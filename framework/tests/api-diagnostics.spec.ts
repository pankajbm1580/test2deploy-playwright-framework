import fs from 'node:fs/promises';
import path from 'node:path';
import { test, expect, newApiContext } from '../fixtures/api';
import { apiCallsMode } from '../config/diagnostics';
import { ApiCallRecorder, attachApiCalls, CALL_HISTORY_LIMIT, type AttachTarget } from '../support/api-recorder';
import { BODY_LIMIT, redactText, sanitizeBody, sanitizeError, sanitizeHeaders, sanitizePath, sanitizeUrl } from '../support/sanitize';
import { resolveApiEnvironment } from './support/test-client';
import { FAKE_SECRET_TAG, fakeSecrets as fake } from './support/fake-secrets';

const json = 'application/json';

test.describe('API call redaction', () => {
  test('Sensitive headers are masked; other headers are kept', () => {
    const headers = sanitizeHeaders({
      Authorization: `Bearer ${fake.token}`,
      'Proxy-Authorization': `Basic ${fake.password}`,
      Cookie: `session=${fake.session}`,
      'Set-Cookie': `sid=${fake.cookie}`,
      'X-API-Key': fake.apiKey,
      'X-Auth-Token': fake.accessToken,
      'X-Session-Id': fake.session,
      'Content-Type': json,
      Accept: json,
    });

    expect(headers).toEqual({
      authorization: '***',
      'proxy-authorization': '***',
      cookie: '***',
      'set-cookie': '***',
      'x-api-key': '***',
      'x-auth-token': '***',
      'x-session-id': '***',
      'content-type': json,
      accept: json,
    });
  });

  test('URLs lose embedded credentials and sensitive query parameters', () => {
    const url = sanitizeUrl(
      `https://user:${fake.password}@api.example.test/posts?userId=1&token=${fake.token}&access_token=${fake.accessToken}&api_key=${fake.apiKey}&code=${fake.session}&sig=${fake.cookie}`,
    );

    expect(url).toBe('https://api.example.test/posts?userId=1&token=***&access_token=***&api_key=***&code=***&sig=***');
    expect(sanitizeUrl('/posts/1?Password=x', 'http://127.0.0.1:9')).toBe('http://127.0.0.1:9/posts/1?Password=***');
    expect(sanitizeUrl('not a url')).toBe('<url omitted: could not be parsed for redaction>');
  });

  test('JSON bodies mask sensitive keys at any depth, in any case, and inside strings', () => {
    const body = {
      title: 'kept',
      password: fake.password,
      user: { name: 'kept', ApiKey: fake.apiKey, sessions: [{ id: 1, refreshToken: fake.token }] },
      items: [{ client_secret: fake.session }, { ok: true, count: 2, missing: null }],
      echoed: JSON.stringify({ password: fake.password, Authorization: `Bearer ${fake.token}` }),
    };

    const { body: sanitized } = sanitizeBody(JSON.stringify(body), json);

    expect(sanitized).toEqual({
      title: 'kept',
      password: '***',
      user: { name: 'kept', ApiKey: '***', sessions: '***' },
      items: [{ client_secret: '***' }, { ok: true, count: 2, missing: null }],
      // "Authorization" matches the text rules itself, so the scheme is masked too.
      echoed: '{"password":"***","Authorization":"*** ***"}',
    });
  });

  test('URL-encoded form bodies mask sensitive fields', () => {
    const { body } = sanitizeBody(`username=demo&password=${fake.password}&csrf_token=${fake.token}`, 'application/x-www-form-urlencoded');

    expect(body).toBe('username=demo&password=***&csrf_token=***');
  });

  test('Plain text masks auth schemes, header lines and sensitive key=value pairs', () => {
    const text = [`Authorization: Bearer ${fake.token}`, `cookie: sid=${fake.cookie}`, `retry with api_key=${fake.apiKey}&page=2`, 'status: 503'].join('\n');

    expect(redactText(text)).toBe(['Authorization: ***', 'cookie: ***', 'retry with api_key=***&page=2', 'status: 503'].join('\n'));
    expect(redactText(`Basic ${fake.password}`)).toBe('Basic ***');
  });

  test('Bodies that cannot be safely inspected are omitted', () => {
    const secret = Buffer.from(`<input name="session" value="${fake.session}">`);
    for (const contentType of ['text/html', 'application/xml', 'application/octet-stream', 'multipart/form-data; boundary=x', undefined]) {
      const result = sanitizeBody(secret, contentType);
      expect(result.body, String(contentType)).toBeUndefined();
      expect(result.omitted, String(contentType)).toMatch(/^body omitted: content type ".*" is not inspected for secrets$/);
      expect(result.size).toBe(secret.length);
    }

    const invalid = sanitizeBody(`{"password": "${fake.password}"`, json);
    expect(invalid).toEqual({ contentType: json, size: invalid.size, omitted: 'body omitted: invalid JSON cannot be safely redacted' });
  });

  test('Known secrets are masked anywhere, including JSON-escaped forms', () => {
    const quoted = `${fake.token}"\\x`;
    // Shorter secrets first: masking must still replace the longer one whole.
    const { body } = sanitizeBody(JSON.stringify({ title: `echo ${quoted}`, plain: fake.token }), json, [fake.token, quoted]);

    expect(JSON.stringify(body)).not.toContain(FAKE_SECRET_TAG);
    expect(body).toEqual({ title: 'echo ***', plain: '***' });
  });

  test(`Bodies are redacted before being capped at ${BODY_LIMIT} bytes`, () => {
    // The secret straddles the cut: capping first would keep half of it.
    const text = `${'x'.repeat(BODY_LIMIT - 8)}password=${fake.password} tail`;
    const result = sanitizeBody(text, 'text/plain');

    expect(result.truncated).toBe(true);
    expect(String(result.body)).not.toContain(FAKE_SECRET_TAG);
    expect(String(result.body)).not.toContain('fake-pass');
    // The note counts the redacted text; `size` is the original body's byte count.
    expect(String(result.body)).toMatch(/…\[truncated, \d+ bytes total\]$/);

    const big = sanitizeBody(JSON.stringify({ data: 'y'.repeat(3 * BODY_LIMIT) }), json);
    expect(big.truncated).toBe(true);
    expect(Buffer.byteLength(String(big.body).replace(/…\[truncated.*$/, ''))).toBe(BODY_LIMIT);
  });

  test('Error messages mask tokens, cookies and known secrets, and are capped', () => {
    const log = `apiRequestContext.get: 503\n  - → GET /x\n    - authorization: Bearer ${fake.token}\n    - cookie: sid=${fake.cookie}\n    - user-agent: pw`;

    expect(sanitizeError(log, [fake.token])).toBe('apiRequestContext.get: 503\n  - → GET /x\n    - authorization: ***\n    - cookie: ***\n    - user-agent: pw');
    expect(Buffer.byteLength(sanitizeError('e'.repeat(3 * BODY_LIMIT)))).toBeLessThan(BODY_LIMIT + 100);
  });
  test('Colour-coded call logs and multi-cookie headers are fully masked', () => {
    // As Playwright prints them: ANSI codes around each line, cookies from the request context's jar.
    const dim = (line: string) => `\u001b[2m${line}\u001b[22m`;
    const log = [
      'apiRequestContext.get: Timeout 200ms exceeded.',
      dim('  - → GET http://127.0.0.1:9/delay/2000'),
      dim(`    - Authorization: Bearer ${fake.token}`),
      dim(`    - cookie: session=${fake.session}; sid=${fake.cookie}`),
      dim('    - accept: application/json'),
    ].join('\n');

    const sanitized = sanitizeError(log);

    expect(sanitized).not.toContain(FAKE_SECRET_TAG);
    expect(sanitized).toBe(
      [
        'apiRequestContext.get: Timeout 200ms exceeded.',
        '  - → GET http://127.0.0.1:9/delay/2000',
        '    - Authorization: ***',
        '    - cookie: ***',
        '    - accept: application/json',
      ].join('\n'),
    );
  });

  test('Cookie values outside header lines are masked to the end of the line', () => {
    expect(redactText(`sent cookie=session=${fake.session}; sid=${fake.cookie}\nnext line`)).toBe('sent cookie=***\nnext line');
    expect(redactText(`{"set-cookie":"sid=${fake.cookie}; Path=/"}`)).toBe('{"set-cookie":"***"}');
  });

  test('Paths for labels and messages mask sensitive query parameters', () => {
    expect(sanitizePath(`/posts/1?session=${fake.session}&page=2`)).toBe('/posts/1?session=***&page=2');
    expect(sanitizePath('/posts/1')).toBe('/posts/1');
    expect(sanitizePath(`https://api.example.test/x?token=${fake.token}`)).toBe('https://api.example.test/x?token=***');
  });
});

test.describe('API call recorder', () => {
  async function recordedContext(playwright: { request: Parameters<typeof newApiContext>[0] }, baseURL: string, apiEnvName = 'qa') {
    const apiEnv = resolveApiEnvironment({ API_ENV: apiEnvName, API_BASE_URL: baseURL, API_TOKEN: fake.token });
    const context = await newApiContext(playwright.request, apiEnv);
    const recorder = new ApiCallRecorder({
      baseURL,
      defaultHeaders: { Accept: json, Authorization: `Bearer ${fake.token}` },
      secrets: [apiEnv.token],
    });
    return { api: recorder.wrap(context), recorder, dispose: () => context.dispose() };
  }

  test('Secrets sent and echoed back never reach the attachment', async ({ playwright, stubServer }) => {
    const { api, recorder, dispose } = await recordedContext(playwright, stubServer.baseURL);
    try {
      const response = await api.post(`/echo?userId=1&access_token=${fake.accessToken}`, {
        headers: { Cookie: `session=${fake.session}`, 'X-API-Key': fake.apiKey },
        data: { title: 'kept title', password: fake.password, nested: { apiKey: fake.apiKey } },
      });
      // Recording does not consume the response: the test still reads it.
      expect((await response.json()).method).toBe('POST');

      await api.post('/echo', { form: { username: 'demo', password: fake.password } });
      await api.fetch('/echo', { method: 'put', params: { token: fake.token, page: 2 }, data: `Bearer ${fake.token}` });
      await api.get('/echo?format=text', { headers: { Cookie: `sid=${fake.cookie}` } });

      const attachment = recorder.toAttachment();
      expect(attachment).not.toContain(FAKE_SECRET_TAG);

      const { calls, totalCalls } = JSON.parse(attachment);
      expect(totalCalls).toBe(4);
      expect(calls.map((c: { method: string }) => c.method)).toEqual(['POST', 'POST', 'PUT', 'GET']);
      expect(calls[0].url).toBe(`${stubServer.baseURL}/echo?userId=1&access_token=***`);
      expect(calls[0].request.headers).toMatchObject({ authorization: '***', cookie: '***', 'x-api-key': '***', accept: json });
      expect(calls[0].request.body.body).toEqual({ title: 'kept title', password: '***', nested: { apiKey: '***' } });
      expect(calls[0].response).toMatchObject({ status: 200, headers: { 'set-cookie': '***' } });
      expect(calls[0].response.body.body).toMatchObject({ method: 'POST', query: { userId: '1', access_token: '***' } });
      expect(calls[1].request.body.body).toBe('username=demo&password=***');
      expect(calls[2].url).toBe(`${stubServer.baseURL}/echo?token=***&page=2`);
      expect(calls[2].request.body.body).toBe('Bearer ***');
    } finally {
      await dispose();
    }
  });

  test('Uninspectable response bodies are omitted, with their size and a reason', async ({ playwright, stubServer }) => {
    const { api, recorder, dispose } = await recordedContext(playwright, stubServer.baseURL);
    try {
      await api.get('/echo?format=html');
      await api.get('/echo?format=binary');
      await api.get('/malformed');

      const attachment = recorder.toAttachment();
      expect(attachment).not.toContain(FAKE_SECRET_TAG);
      const bodies = JSON.parse(attachment).calls.map((c: { response: { body: object } }) => c.response.body);
      expect(bodies[0]).toMatchObject({ contentType: 'text/html', omitted: 'body omitted: content type "text/html" is not inspected for secrets' });
      expect(bodies[1]).toMatchObject({ omitted: 'body omitted: content type "application/octet-stream" is not inspected for secrets' });
      expect(bodies[2]).toMatchObject({ omitted: 'body omitted: invalid JSON cannot be safely redacted' });
      for (const body of bodies) expect(body.size).toBeGreaterThan(0);
    } finally {
      await dispose();
    }
  });

  test(`Only the last ${CALL_HISTORY_LIMIT} calls are kept, and dropped calls are counted`, async ({ playwright, stubServer }) => {
    const { api, recorder, dispose } = await recordedContext(playwright, stubServer.baseURL);
    try {
      for (let i = 1; i <= 25; i++) await api.get(`/status/200?call=${i}`);

      const report = JSON.parse(recorder.toAttachment());
      expect(report).toMatchObject({ totalCalls: 25, recordedCalls: CALL_HISTORY_LIMIT, droppedCalls: 5 });
      expect(report.calls[0].url).toBe(`${stubServer.baseURL}/status/200?call=6`);
      expect(report.calls.at(-1).url).toBe(`${stubServer.baseURL}/status/200?call=25`);
    } finally {
      await dispose();
    }
  });

  test(`Request and response bodies are capped at ${BODY_LIMIT} bytes`, async ({ playwright, stubServer }) => {
    const { api, recorder, dispose } = await recordedContext(playwright, stubServer.baseURL);
    try {
      const response = await api.get('/large/50000');
      expect((await response.json()).data).toHaveLength(50000);
      await api.post('/status/201', { data: { data: 'z'.repeat(50000) } });

      const attachment = recorder.toAttachment();
      const [large, upload] = JSON.parse(attachment).calls;
      expect(large.response.body).toMatchObject({ truncated: true, size: 50000 + '{"data":""}'.length });
      expect(upload.request.body).toMatchObject({ truncated: true });
      // Two capped bodies plus headers and metadata.
      expect(Buffer.byteLength(attachment)).toBeLessThan(3 * BODY_LIMIT);
    } finally {
      await dispose();
    }
  });

  test('Blocked writes and timeouts are recorded with token-free errors, and still thrown', async ({ playwright, stubServer }) => {
    const { api, recorder, dispose } = await recordedContext(playwright, stubServer.baseURL, 'staging');
    try {
      await expect(api.post('/status/201', { data: { password: fake.password } })).rejects.toThrow('Write request blocked');
      await expect(api.get('/delay/3000', { timeout: 300 })).rejects.toThrow(/Timeout 300ms exceeded/);
      await expect(api.get('/status/503', { failOnStatusCode: true })).rejects.toThrow(/503/);

      const attachment = recorder.toAttachment();
      expect(attachment).not.toContain(FAKE_SECRET_TAG);
      const calls = JSON.parse(attachment).calls;
      expect(calls[0]).toMatchObject({ method: 'POST', error: expect.stringContaining('Write request blocked') });
      expect(calls[0].request.body.body).toEqual({ password: '***' });
      expect(calls[1]).toMatchObject({ method: 'GET', error: expect.stringContaining('Timeout 300ms exceeded') });
      expect(calls[2].error).toMatch(/503/);
      for (const call of calls) expect(call.response).toBeUndefined();
    } finally {
      await dispose();
    }
  });
});

test.describe('API call attachments', () => {
  function fakeTestInfo(status: string) {
    const attached: { name: string; path: string; contentType: string }[] = [];
    const target: AttachTarget = {
      status,
      // A folder per fake status inside this test's own output folder.
      outputPath: (...segments) => test.info().outputPath(`fake-${status}`, ...segments),
      attach: async (name, { path, contentType }) => {
        attached.push({ name, path, contentType });
      },
    };
    return { target, attached };
  }

  async function recorderWithCall(playwright: { request: Parameters<typeof newApiContext>[0] }, baseURL: string) {
    const apiEnv = resolveApiEnvironment({ API_ENV: 'qa', API_BASE_URL: baseURL, API_TOKEN: fake.token });
    const context = await newApiContext(playwright.request, apiEnv);
    const recorder = new ApiCallRecorder({ baseURL, secrets: [fake.token] });
    await recorder.wrap(context).get('/status/200');
    await context.dispose();
    return recorder;
  }

  test('Attached only for failed, timed-out and interrupted tests', async ({ playwright, stubServer }) => {
    const recorder = await recorderWithCall(playwright, stubServer.baseURL);
    for (const [status, expected] of [['failed', true], ['timedOut', true], ['interrupted', true], ['passed', false], ['skipped', false]] as const) {
      const { target, attached } = fakeTestInfo(status);
      expect(await attachApiCalls(target, recorder), status).toBe(expected);
      expect(attached.map((a) => [a.name, a.contentType]), status).toEqual(expected ? [['api-calls', json]] : []);
      if (expected) {
        // Written to the test's output folder as api-calls.json, already redacted.
        expect(path.basename(attached[0].path)).toBe('api-calls.json');
        const written = await fs.readFile(attached[0].path, 'utf8');
        expect(written).not.toContain(FAKE_SECRET_TAG);
        expect(JSON.parse(written)).toMatchObject({ totalCalls: 1, recordedCalls: 1, droppedCalls: 0 });
      }
    }
  });

  test('Nothing is attached when the test made no calls', async () => {
    const { target, attached } = fakeTestInfo('failed');
    expect(await attachApiCalls(target, new ApiCallRecorder({ baseURL: 'http://127.0.0.1:9' }))).toBe(false);
    expect(attached).toEqual([]);
  });

  test('PW_API_CALLS accepts on-failure (default) and off, and rejects anything else without echoing it', () => {
    expect(apiCallsMode({})).toBe('on-failure');
    expect(apiCallsMode({ PW_API_CALLS: 'on-failure' })).toBe('on-failure');
    expect(apiCallsMode({ PW_API_CALLS: 'off' })).toBe('off');
    for (const value of [fake.token, 'on', 'always']) {
      expect(() => apiCallsMode({ PW_API_CALLS: value })).toThrow(/^PW_API_CALLS must be one of: on-failure, off\.$/);
    }
  });
});
