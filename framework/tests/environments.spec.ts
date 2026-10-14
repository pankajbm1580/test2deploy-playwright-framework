import { test, expect } from '@playwright/test';
import { resolveApiEnvironment, resolveUiEnvironment } from './support/test-client';
import { htmlReportMode, videoMode } from '../config/diagnostics';
import { fakeSecret } from './support/fake-secrets';

// Obviously fake values, built at runtime (support/fake-secrets.ts) so they never appear in source
// lines that reports quote as snippets: a marker found in a report is then always a real leak.
const fake = { user: fakeSecret('user'), pass: fakeSecret('pass'), token: fakeSecret('token'), value: fakeSecret('value') };

/** Runs `fn`, which must throw, and returns the error message. */
function errorMessage(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    return (error as Error).message;
  }
  throw new Error('Expected the call to throw');
}

// Pure configuration checks: each test passes its own variables, so the real environment is not used.
test.describe('API environment configuration', () => {
  test('Variables override the preset for a client environment', () => {
    const env = resolveApiEnvironment({
      API_ENV: 'staging',
      API_BASE_URL: 'https://staging.example.test/api',
      API_TIMEOUT_MS: '5000',
      API_TOKEN: 'dummy-token',
    });

    expect(env).toEqual({
      name: 'staging',
      baseURL: 'https://staging.example.test/api',
      timeoutMs: 5000,
      token: 'dummy-token',
      readOnly: true,
    });
  });

  test('Fails fast on missing or invalid configuration', () => {
    expect(() => resolveApiEnvironment({ API_ENV: 'qa' })).toThrow(/API_BASE_URL must be set/);
    expect(() => resolveApiEnvironment({ API_ENV: 'prod' })).toThrow(/API_ENV must be one of: jsonplaceholder, qa, staging/);
    expect(() => resolveApiEnvironment({ API_BASE_URL: 'not a url' })).toThrow(/not a valid URL/);
    expect(() => resolveApiEnvironment({ API_TIMEOUT_MS: '-1' })).toThrow(/positive integer/);
    expect(() => resolveApiEnvironment({ API_READ_ONLY: 'yes' })).toThrow(/"true" or "false"/);
  });

  test('An invalid API_BASE_URL error does not expose credentials or tokens', () => {
    // Obviously fake placeholder values; nothing here is a real credential.
    const invalidUrls = [
      `https://${fake.user}:${fake.pass}@exa mple.test/api?token=${fake.token}`,
      `http://${fake.user}:${fake.pass}@[not-an-ipv6/?token=${fake.token}`,
    ];

    for (const url of invalidUrls) {
      let message = '';
      try {
        resolveApiEnvironment({ API_BASE_URL: url });
      } catch (error) {
        message = (error as Error).message;
      }

      expect(message).toContain('API_BASE_URL is not a valid URL');
      for (const fragment of [url, fake.user, fake.pass, fake.token]) {
        expect(message).not.toContain(fragment);
      }
    }
  });

  test('Invalid configuration values are never echoed in error messages', () => {
    // A fake value standing in for a secret pasted into the wrong variable.
    const fakeSecret = fake.value;
    const cases: [variable: string, run: () => unknown, expected: RegExp][] = [
      ['API_ENV', () => resolveApiEnvironment({ API_ENV: fakeSecret }), /API_ENV must be one of: jsonplaceholder, qa, staging/],
      ['API_TIMEOUT_MS', () => resolveApiEnvironment({ API_TIMEOUT_MS: fakeSecret }), /API_TIMEOUT_MS must be a positive integer/],
      ['API_READ_ONLY', () => resolveApiEnvironment({ API_READ_ONLY: fakeSecret }), /API_READ_ONLY must be "true" or "false"/],
      ['PW_VIDEO', () => videoMode({ PW_VIDEO: fakeSecret }), /PW_VIDEO must be one of: off, on, retain-on-failure, on-first-retry/],
      ['PW_HTML_REPORT', () => htmlReportMode({ PW_HTML_REPORT: fakeSecret }), /PW_HTML_REPORT must be one of: auto, always/],
    ];

    for (const [variable, run, expected] of cases) {
      const message = errorMessage(run);
      expect(message, variable).toMatch(expected);
      expect(message, variable).not.toContain(fakeSecret);
    }
  });

  test('API_BASE_URL with an embedded username or password is rejected without echoing it', () => {
    // Obviously fake placeholder values; nothing here is a real credential.
    const urlsWithCredentials = [
      `https://${fake.user}:${fake.pass}@api.example.test/v1`,
      `https://${fake.user}@api.example.test/v1`,
      `https://:${fake.pass}@api.example.test/v1`,
    ];

    for (const url of urlsWithCredentials) {
      const message = errorMessage(() => resolveApiEnvironment({ API_ENV: 'qa', API_BASE_URL: url }));
      expect(message).toBe('API_BASE_URL must not contain a username or password. Use API_TOKEN for authentication.');
      for (const fragment of [url, fake.user, fake.pass]) {
        expect(message).not.toContain(fragment);
      }
    }
  });
  test('API_BASE_URL with a query string or fragment is rejected without echoing it', () => {
    // Obviously fake placeholder values; nothing here is a real credential.
    const urls = [
      `https://api.example.test/v1?token=${fake.token}`,
      `https://api.example.test/v1#${fake.token}`,
      'https://api.example.test/v1?',
    ];

    for (const url of urls) {
      const message = errorMessage(() => resolveApiEnvironment({ API_ENV: 'qa', API_BASE_URL: url }));
      expect(message).toBe('API_BASE_URL must not contain a query string or fragment.');
      for (const fragment of [url, fake.token]) {
        expect(message).not.toContain(fragment);
      }
    }
  });
});

test.describe('UI environment configuration', () => {
  test('UI_BASE_URL overrides the default and keeps its path', () => {
    expect(resolveUiEnvironment({ UI_BASE_URL: 'https://qa.example.test/app/' }).baseURL).toBe('https://qa.example.test/app/');
    expect(resolveUiEnvironment({ UI_BASE_URL: 'http://localhost:3000' }).baseURL).toBe('http://localhost:3000/');
  });

  test('A missing trailing slash is added so relative navigation keeps the full path', () => {
    const { baseURL } = resolveUiEnvironment({ UI_BASE_URL: 'https://demo.playwright.dev/todomvc' });

    expect(baseURL).toBe('https://demo.playwright.dev/todomvc/');
    // Tests call page.goto('./'), which Playwright resolves against baseURL like this.
    expect(new URL('./', baseURL).href).toBe('https://demo.playwright.dev/todomvc/');
  });

  test('Invalid UI_BASE_URL values are rejected without echoing them', () => {
    // Obviously fake placeholder values; nothing here is a real credential.
    const cases: [url: string, expected: string][] = [
      [`not a url ${fake.value}`, 'UI_BASE_URL is not a valid URL. The value is not shown because it may contain credentials.'],
      [`https://${fake.user}:${fake.pass}@app.example.test/`, 'UI_BASE_URL must not contain a username or password.'],
      [`https://${fake.user}@app.example.test/`, 'UI_BASE_URL must not contain a username or password.'],
      [`https://app.example.test/?token=${fake.token}`, 'UI_BASE_URL must not contain a query string or fragment.'],
      [`https://app.example.test/#${fake.token}`, 'UI_BASE_URL must not contain a query string or fragment.'],
      ['ftp://app.example.test/', 'UI_BASE_URL must use http or https.'],
    ];

    for (const [url, expected] of cases) {
      const message = errorMessage(() => resolveUiEnvironment({ UI_BASE_URL: url }));
      expect(message).toBe(expected);
      for (const fragment of [url, fake.user, fake.pass, fake.token, fake.value]) {
        expect(message).not.toContain(fragment);
      }
    }
  });
});
