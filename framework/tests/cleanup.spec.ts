import { test, expect, newApiContext } from '../fixtures/api';
import { CleanupRegistry } from '../support/cleanup';
import { resolveApiEnvironment } from './support/test-client';

/** Runs the registry, which must fail, and returns the error message. */
async function runError(registry: CleanupRegistry): Promise<string> {
  return registry.run().then(
    () => {
      throw new Error('Expected cleanup to fail');
    },
    (e: Error) => e.message,
  );
}

// Runs against the local stub server, whose /status/:code route answers any HTTP method.
test.describe('Test data cleanup', () => {
  test('Steps run newest first', async () => {
    const order: string[] = [];
    const registry = new CleanupRegistry();
    registry.add('parent', () => order.push('parent'));
    registry.add('child', async () => order.push('child'));

    await registry.run();

    expect(order).toEqual(['child', 'parent']);
  });

  test('Every step runs even when one fails, and the error names each failed step', async () => {
    const ran: string[] = [];
    const registry = new CleanupRegistry();
    registry.add('first', () => ran.push('first'));
    registry.add('broken sync', () => {
      throw new Error('sync failure');
    });
    registry.add('broken async', async () => {
      throw new Error('async failure');
    });
    registry.add('last', () => ran.push('last'));

    const message = await runError(registry);

    expect(ran).toEqual(['last', 'first']);
    expect(message).toBe(
      'Test data cleanup failed for 2 of 4 step(s):\n  - broken async: async failure\n  - broken sync: sync failure',
    );
  });

  test('An empty registry runs without error', async () => {
    await expect(new CleanupRegistry().run()).resolves.toBeUndefined();
  });

  test('Running twice does not repeat steps', async () => {
    let runs = 0;
    const registry = new CleanupRegistry();
    registry.add('count', () => runs++);

    await registry.run();
    await registry.run();

    expect(runs).toBe(1);
  });

  test('delete() treats 2xx and 404 as cleaned up and other statuses as failures', async ({ stubApi }) => {
    const registry = new CleanupRegistry(stubApi);
    for (const code of [200, 204, 404, 500, 409]) registry.delete(`/status/${code}`);

    const message = await runError(registry);

    expect(message).toBe(
      'Test data cleanup failed for 2 of 5 step(s):\n' +
        '  - DELETE /status/409: responded 409 Conflict\n' +
        '  - DELETE /status/500: responded 500 Internal Server Error',
    );
  });

  test('delete() without a request context is rejected when registered', () => {
    expect(() => new CleanupRegistry().delete('/posts/1')).toThrow('cleanup.delete() needs an API request context.');
  });

  test('Cleanup errors never contain the API token', async ({ playwright, stubServer }) => {
    const fakeToken = 'fake-token-marker-789';
    const apiEnv = resolveApiEnvironment({ API_ENV: 'qa', API_BASE_URL: stubServer.baseURL, API_TOKEN: fakeToken });
    const api = await newApiContext(playwright.request, apiEnv);
    try {
      const registry = new CleanupRegistry(api);
      registry.delete('/status/500');
      registry.add('request error', () => api.get('/delay/3000', { timeout: 300 }));

      const message = await runError(registry);

      expect(message).toContain('DELETE /status/500: responded 500');
      expect(message).toContain('request error:');
      expect(message).not.toContain(fakeToken);
    } finally {
      await api.dispose();
    }
  });
});

// The framework project has no client, so api is pointed at the stub server here.
const fixtureTest = test.extend({ api: async ({ stubApi }, use) => use(stubApi) });

fixtureTest.describe('Cleanup fixture', () => {
  fixtureTest.describe.configure({ mode: 'serial' });

  // Shared across the two serial tests in this worker: the first registers, the second checks.
  const ran: string[] = [];

  fixtureTest('Registers a step without running it', async ({ cleanup }) => {
    cleanup.add('record teardown', () => ran.push('teardown'));
    expect(ran).toEqual([]);
  });

  fixtureTest('The step ran when the previous test finished', () => {
    expect(ran).toEqual(['teardown']);
  });
});
