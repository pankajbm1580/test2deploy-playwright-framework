import type { TestError, TestResult, TestStep } from '@playwright/test/reporter';
import { test, expect, newApiContext } from '../fixtures/api';
import { maskHeaderLines, redactCookies } from '../support/redact';
import { redactReportText } from '../support/sanitize';
import { ApiCallRecorder } from '../support/api-recorder';
import RedactingReporter from '../reporters/redacting-reporter';
import { resolveApiEnvironment } from './support/test-client';
import { FAKE_SECRET_TAG, fakeSecrets as fake } from './support/fake-secrets';

const dim = (line: string) => `\u001b[2m${line}\u001b[22m`;

// A request context saves cookies from Set-Cookie responses and sends them on later
// requests by itself; Playwright then lists them in error call logs. Runs against the stub.
test.describe('Cookie redaction', () => {
  test('Cookie and Set-Cookie header lines are masked whole, keeping colour codes', () => {
    const log = [
      dim(`    - cookie: session=${fake.session}; sid=${fake.cookie}`),
      dim(`    - Set-Cookie: sid=${fake.cookie}; Path=/; HttpOnly`),
      `  - cookie2: legacy=${fake.cookie}`,
      dim('    - accept: application/json'),
    ].join('\n');

    expect(redactCookies(log)).toBe(
      [dim('    - cookie: ***'), dim('    - Set-Cookie: ***'), '  - cookie2: ***', dim('    - accept: application/json')].join('\n'),
    );
    expect(maskHeaderLines('x-trace: abc\ncookie:', () => true)).toBe('x-trace: ***\ncookie:');
  });

  test('Report text masks cookies, tokens and sensitive query parameters, but keeps ordinary messages', () => {
    const text = [
      'Error: apiRequestContext.get: Timeout 200ms exceeded.',
      dim(`    - Authorization: Bearer ${fake.token}`),
      dim(`    - cookie: session=${fake.session}`),
      `GET /echo?userId=1&access_token=${fake.accessToken}&page=2`,
      'SyntaxError: Unexpected token < in JSON at position 0',
    ].join('\n');

    const redacted = redactReportText(text, [fake.token]);

    expect(redacted).not.toContain(FAKE_SECRET_TAG);
    expect(redacted).toBe(
      [
        'Error: apiRequestContext.get: Timeout 200ms exceeded.',
        dim('    - Authorization: ***'),
        dim('    - cookie: ***'),
        'GET /echo?userId=1&access_token=***&page=2',
        'SyntaxError: Unexpected token < in JSON at position 0',
      ].join('\n'),
    );
  });

  test('Errors from the request context never contain cookies it saved, with or without a token', async ({ playwright, stubServer }) => {
    for (const token of [fake.token, undefined]) {
      const apiEnv = resolveApiEnvironment({ API_ENV: 'qa', API_BASE_URL: stubServer.baseURL, API_TOKEN: token });
      const api = await newApiContext(playwright.request, apiEnv);
      try {
        // /echo answers with Set-Cookie: the context saves both cookies and sends them from now on.
        await api.get('/echo', { headers: { Cookie: `session=${fake.session}` } });
        await api.get('/echo', { headers: { Cookie: `sid=${fake.cookie}` } });
        expect((await api.storageState()).cookies.map((c) => c.name).sort(), 'cookies were saved').toEqual(['session', 'sid']);

        const error: Error = await api.get('/delay/3000', { timeout: 300 }).then(
          () => {
            throw new Error('Expected the request to time out');
          },
          (e: Error) => e,
        );

        expect(error.message, 'the call log lists the saved cookies').toMatch(/cookie: \*\*\*/);
        expect(error.message).not.toContain(FAKE_SECRET_TAG);
        expect(error.stack ?? '').not.toContain(FAKE_SECRET_TAG);
        if (token) expect(error.message).toContain('Bearer ***');
      } finally {
        await api.dispose();
      }
    }
  });

  test('Saved cookies never reach the api-calls attachment', async ({ playwright, stubServer }) => {
    const apiEnv = resolveApiEnvironment({ API_ENV: 'qa', API_BASE_URL: stubServer.baseURL });
    const context = await newApiContext(playwright.request, apiEnv);
    const recorder = new ApiCallRecorder({ baseURL: stubServer.baseURL });
    const api = recorder.wrap(context);
    try {
      await api.get('/echo', { headers: { Cookie: `session=${fake.session}; sid=${fake.cookie}` } });
      // Sent automatically from the saved cookies, and echoed back in the response body.
      await api.get('/echo');
      await api.get('/echo?format=text');
      await api.get('/delay/3000', { timeout: 300 }).catch(() => undefined);

      const attachment = recorder.toAttachment();
      expect(attachment).not.toContain(FAKE_SECRET_TAG);
      const calls = JSON.parse(attachment).calls;
      expect(calls[1].response.body.body.headers.cookie).toBe('***');
      expect(calls[3].error).toMatch(/cookie: \*\*\*/);
    } finally {
      await context.dispose();
    }
  });

  test('The redacting reporter masks step errors, test errors, titles, output and text attachments in place', () => {
    const callLog = (prefix: string) =>
      [`${prefix}: apiRequestContext.get: Timeout 200ms exceeded.`, dim(`    - Authorization: Bearer ${fake.token}`), dim(`    - cookie: session=${fake.session}; sid=${fake.cookie}`)].join('\n');
    const stepError: TestError = { message: callLog('Error'), stack: callLog('Error') };
    const childStep = { title: `GET /echo?access_token=${fake.accessToken}`, subtitle: `/echo?session=${fake.session}`, error: stepError, steps: [] } as unknown as TestStep;
    const parentStep = { title: 'fixture: api', steps: [childStep] } as unknown as TestStep;
    const testError: TestError = { message: callLog('Error'), snippet: `> 1 | cookie: sid=${fake.cookie}`, cause: { message: callLog('Cause') } };
    const binary = Buffer.from([0, 1, 2, 3]);
    const result = {
      errors: [testError],
      error: testError,
      steps: [parentStep],
      stdout: [`set-cookie: sid=${fake.cookie}\n`, Buffer.from(`password=${fake.password}\n`)],
      stderr: [],
      attachments: [
        { name: 'log', contentType: 'text/plain', body: Buffer.from(callLog('Log')) },
        { name: 'data', contentType: 'application/json', body: Buffer.from(JSON.stringify({ msg: `Cookie: sid=${fake.cookie}` })) },
        { name: 'image', contentType: 'image/png', body: binary },
      ],
    } as unknown as TestResult;

    const previous = process.env.API_TOKEN;
    process.env.API_TOKEN = fake.token;
    try {
      const reporter = new RedactingReporter();
      reporter.onStepEnd({} as never, result, childStep);
      reporter.onTestEnd({} as never, result);
    } finally {
      if (previous === undefined) delete process.env.API_TOKEN;
      else process.env.API_TOKEN = previous;
    }

    const serialized = JSON.stringify(result, (_key, value) =>
      value && value.type === 'Buffer' && Array.isArray(value.data) ? Buffer.from(value.data).toString('utf8') : value,
    );
    expect(serialized).not.toContain(FAKE_SECRET_TAG);
    expect(stepError.message).toBe(['Error: apiRequestContext.get: Timeout 200ms exceeded.', dim('    - Authorization: ***'), dim('    - cookie: ***')].join('\n'));
    expect(childStep.title).toBe('GET /echo?access_token=***');
    expect((childStep as unknown as { subtitle: string }).subtitle).toBe('/echo?session=***');
    expect(result.stdout).toEqual(['set-cookie: ***\n', Buffer.from('password=***\n')]);
    expect(result.attachments[2].body).toBe(binary);
  });
});
