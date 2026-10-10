import { test, expect } from '../fixtures/api-fixtures';

// These run against the local stub server, so they are deterministic and need no network.
test.describe('Error and timeout handling', () => {
  test('A 500 response is returned, not thrown, and its error body can be inspected', async ({ stubApi }) => {
    const response = await stubApi.get('/status/500');

    expect(response.status()).toBe(500);
    expect(response.ok()).toBe(false);
    expect(await response.json()).toEqual({ status: 500, error: 'Internal Server Error' });
  });

  test('failOnStatusCode turns a 503 response into an error', async ({ stubApi }) => {
    await expect(stubApi.get('/status/503', { failOnStatusCode: true })).rejects.toThrow(
      /503 Service Unavailable/,
    );
  });

  test('A response slower than the request timeout fails with a timeout error', async ({ stubApi }) => {
    await expect(stubApi.get('/delay/3000', { timeout: 1000 })).rejects.toThrow(/Timeout 1000ms exceeded/);
  });

  test('A response faster than the request timeout succeeds', async ({ stubApi }) => {
    const response = await stubApi.get('/delay/200', { timeout: 1000 });

    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({ delayedMs: 200 });
  });

  test('A malformed JSON body fails to parse but its raw text is still readable', async ({ stubApi }) => {
    const response = await stubApi.get('/malformed');

    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('application/json');
    await expect(response.json()).rejects.toThrow(SyntaxError);
    expect(await response.text()).toBe('{"id": 1, "title": "unterminated');
  });
});
