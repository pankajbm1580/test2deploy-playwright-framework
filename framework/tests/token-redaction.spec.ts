import { createHash } from 'node:crypto';
import { test, expect, newApiContext } from '../fixtures/api';
import { resolveApiEnvironment } from './support/test-client';

// Playwright's API error call logs include request headers. These tests prove the API_TOKEN
// sent in the Authorization header is masked in errors. Runs against the local stub server.
test.describe('API token redaction', () => {
  // Obviously fake placeholder; nothing here is a real credential.
  const fakeToken = 'fake-token-marker-789';

  test('Request errors never contain the API token', async ({ playwright, stubServer }) => {
    const apiEnv = resolveApiEnvironment({ API_ENV: 'qa', API_BASE_URL: stubServer.baseURL, API_TOKEN: fakeToken });
    const api = await newApiContext(playwright.request, apiEnv);

    try {
      // Started one at a time so no rejection is left unhandled while another is awaited.
      const failures = [
        () => api.get('/delay/3000', { timeout: 500 }),
        () => api.get('/status/503', { failOnStatusCode: true }),
      ];

      for (const failure of failures) {
        const error: Error = await failure().then(
          () => {
            throw new Error('Expected the request to fail');
          },
          (e: Error) => e,
        );
        expect(error.message).toContain('Bearer ***');
        expect(error.message).not.toContain(fakeToken);
        expect(error.stack ?? '').not.toContain(fakeToken);
      }
    } finally {
      await api.dispose();
    }
  });

  test('Successful requests still send the real token', async ({ playwright, stubServer }) => {
    // Redaction must only affect error messages, never the request itself.
    const apiEnv = resolveApiEnvironment({ API_ENV: 'qa', API_BASE_URL: stubServer.baseURL, API_TOKEN: fakeToken });
    const api = await newApiContext(playwright.request, apiEnv);

    try {
      const response = await api.get('/auth-hash');
      expect(response.status()).toBe(200);
      const expectedHash = createHash('sha256').update(`Bearer ${fakeToken}`).digest('hex');
      expect(await response.json()).toEqual({ sha256: expectedHash });
    } finally {
      await api.dispose();
    }
  });
});
