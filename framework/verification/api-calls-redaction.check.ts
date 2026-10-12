import { test as base, expect } from '../fixtures/api';
import type { APIRequestContext } from '@playwright/test';
import { resolveApiEnvironment, type ApiEnvironment } from '../config/environments';
import { testClient } from '../tests/support/test-client';
import { fakeSecrets as fake } from '../tests/support/fake-secrets';

// With API_TOKEN set (to a fake marker), the HTML report is skipped, as in real runs, and the
// calls carry every kind of fake secret. Without it, the HTML report is written, and secrets
// stay out of query strings: Playwright shows request URLs in report steps, so secrets must be
// sent in headers or bodies, never in URLs (see docs on PW_API_CALLS in .env.example).
const token = process.env.API_TOKEN || undefined;
const querySecret = (name: string, value: string) => (token ? `&${name}=${value}` : '');

// The real api and cleanup fixtures, pointed at the local stub server. Nothing is sent to
// any external host.
const test = base.extend<{}, { apiEnv: ApiEnvironment }>({
  apiEnv: [
    async ({ stubServer }, use) => {
      await use(resolveApiEnvironment({ API_ENV: 'qa', API_BASE_URL: stubServer.baseURL, API_TOKEN: token }, testClient));
    },
    { scope: 'worker' },
  ],
});

/** Calls that carry fake secrets, in requests and in echoed responses. */
async function callsWithSecrets(api: APIRequestContext) {
  await api.post(`/echo?userId=1${querySecret('access_token', fake.accessToken)}`, {
    headers: { Cookie: `session=${fake.session}`, 'X-API-Key': fake.apiKey },
    data: { title: 'verification', password: fake.password, nested: { apiKey: fake.apiKey } },
  });
  await api.post('/echo', { form: { username: 'demo', password: fake.password } });
  await api.get('/echo?format=text', { headers: { Cookie: `sid=${fake.cookie}` } });
  await api.get('/echo?format=html');
  // A failing request: its error call log lists the request headers, including cookies.
  await api.get('/delay/2000', { timeout: 200 }).catch(() => undefined);
}

test.describe('api-calls redaction check', () => {
  test('A failed test attaches its calls, redacted', async ({ api }) => {
    test.fail(true, 'Deliberate failure: produces a real api-calls attachment for the redaction scan.');
    await callsWithSecrets(api);
    expect(1, 'deliberate failure for the redaction check').toBe(2);
  });

  test('A failed cleanup step attaches the calls, including the cleanup request', async ({ api, cleanup }) => {
    test.fail(true, 'Deliberate failure: cleanup responds 500, so the test fails in teardown.');
    await callsWithSecrets(api);
    cleanup.delete(`/status/500?id=7${querySecret('session', fake.session)}`);
  });

  test('A passing test attaches nothing', async ({ api }) => {
    await callsWithSecrets(api);
  });
});
