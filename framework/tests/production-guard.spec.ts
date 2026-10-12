import { test, expect, newApiContext } from '../fixtures/api';
import { defineClient, isProductionHost, type ClientConfig } from '../config/client';
import { resolveApiEnvironment, resolveUiEnvironment } from '../config/environments';
import { fakeSecret } from './support/fake-secrets';

// Obviously fake values, built at runtime (support/fake-secrets.ts) so they never appear in source
// lines that reports quote as snippets: a marker found in a report is then always a real leak.
const fake = { value: fakeSecret('value'), path: fakeSecret('path') };

/** Runs `fn`, which must throw, and returns the error message. */
function errorMessage(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    return (error as Error).message;
  }
  throw new Error('Expected the call to throw');
}

// Placeholder hosts on the reserved .test domain; nothing here is a real system or credential.
const guardClient = defineClient({
  name: 'guard-test',
  dir: './clients/guard-test',
  productionHosts: ['example-prod.test'],
  ui: { defaultBaseURL: 'https://app.example-staging.test/' },
  api: {
    defaultEnvironment: 'qa',
    environments: {
      qa: { baseURL: 'https://api.example-qa.test', readOnly: false },
      staging: { baseURL: 'https://api.example-staging.test', readOnly: true },
      production: { baseURL: 'https://api.example-prod.test', readOnly: true, production: true },
    },
  },
});

const api = (env: NodeJS.ProcessEnv) => resolveApiEnvironment(env, guardClient);
const ui = (env: NodeJS.ProcessEnv) => resolveUiEnvironment(env, guardClient);

const REFUSED_API = 'Refusing to run against a production API environment. Set ALLOW_PRODUCTION=true to confirm.';
const REFUSED_UI = 'Refusing to run against a production UI. Set ALLOW_PRODUCTION=true to confirm.';

test.describe('Production guard', () => {
  test('A production environment is refused without ALLOW_PRODUCTION=true', () => {
    expect(errorMessage(() => api({ API_ENV: 'production' }))).toBe(REFUSED_API);
    expect(errorMessage(() => api({ API_ENV: 'production', ALLOW_PRODUCTION: 'false' }))).toBe(REFUSED_API);
    expect(errorMessage(() => api({ API_ENV: 'production', ALLOW_PRODUCTION: '' }))).toBe(REFUSED_API);
  });

  test('ALLOW_PRODUCTION=true allows a production environment, always read-only', () => {
    expect(api({ API_ENV: 'production', ALLOW_PRODUCTION: 'true' })).toMatchObject({ name: 'production', readOnly: true });
    expect(api({ API_ENV: 'production', ALLOW_PRODUCTION: 'true', API_READ_ONLY: 'true' }).readOnly).toBe(true);
  });

  test('API_READ_ONLY=false is rejected for production, even when confirmed', () => {
    expect(errorMessage(() => api({ API_ENV: 'production', ALLOW_PRODUCTION: 'true', API_READ_ONLY: 'false' }))).toBe(
      'API_READ_ONLY cannot be "false" for a production environment. Production runs are always read-only.',
    );
  });

  test('A production host under a non-production environment name is still treated as production', () => {
    const env = { API_ENV: 'qa', API_BASE_URL: 'https://api.example-prod.test/v1' };

    expect(errorMessage(() => api(env))).toBe(REFUSED_API);
    // Confirmed, it runs, but read-only even though the qa preset is writable.
    expect(api({ ...env, ALLOW_PRODUCTION: 'true' })).toMatchObject({ name: 'qa', readOnly: true });
  });

  test('A production UI_BASE_URL is refused without ALLOW_PRODUCTION=true', () => {
    expect(errorMessage(() => ui({ UI_BASE_URL: 'https://www.example-prod.test/shop/' }))).toBe(REFUSED_UI);
    expect(ui({ UI_BASE_URL: 'https://www.example-prod.test/shop/', ALLOW_PRODUCTION: 'true' })).toEqual({
      baseURL: 'https://www.example-prod.test/shop/',
    });
  });

  test('Non-production targets are unaffected', () => {
    expect(api({})).toMatchObject({ name: 'qa', readOnly: false });
    expect(api({ API_ENV: 'staging' })).toMatchObject({ name: 'staging', readOnly: true });
    expect(ui({})).toEqual({ baseURL: 'https://app.example-staging.test/' });
  });

  test('Production hosts match case-insensitively, ignore ports and cover subdomains, but not lookalikes', () => {
    const hosts = ['example-prod.test'];
    for (const url of ['https://EXAMPLE-PROD.test/', 'https://example-prod.test:8443/', 'https://api.eu.example-prod.test/', 'https://example-prod.test./']) {
      expect(isProductionHost(new URL(url), hosts), url).toBe(true);
    }
    for (const url of ['https://notexample-prod.test/', 'https://example-prod.test.evil.test/', 'https://example-staging.test/']) {
      expect(isProductionHost(new URL(url), hosts), url).toBe(false);
    }
  });

  test('Fails closed on an invalid ALLOW_PRODUCTION value, without echoing it', () => {
    const fakeValue = fake.value;
    for (const run of [() => api({ ALLOW_PRODUCTION: fakeValue }), () => ui({ ALLOW_PRODUCTION: 'yes' })]) {
      const message = errorMessage(run);
      expect(message).toBe('ALLOW_PRODUCTION must be "true" or "false", or left unset.');
      expect(message).not.toContain(fakeValue);
    }
  });

  test('Guard errors never echo the target URL', () => {
    const url = `https://api.example-prod.test/${fake.path}`;
    const messages = [
      errorMessage(() => api({ API_ENV: 'qa', API_BASE_URL: url })),
      errorMessage(() => ui({ UI_BASE_URL: url })),
    ];
    for (const message of messages) {
      for (const fragment of [url, 'example-prod', fake.path]) expect(message).not.toContain(fragment);
    }
  });

  test('Client definitions that would weaken the guard are rejected', () => {
    const base: ClientConfig = { ...guardClient, productionHosts: [] };
    expect(
      errorMessage(() =>
        defineClient({ ...base, api: { defaultEnvironment: 'prod', environments: { prod: { readOnly: false, production: true } } } }),
      ),
    ).toBe('Client "guard-test": api.environments.prod is a production environment and must set readOnly: true.');

    for (const host of ['https://example.com', 'example.com/path', 'example.com:443', '', '.example.com', 'exa mple.com']) {
      expect(errorMessage(() => defineClient({ ...base, productionHosts: [host] })), host).toBe(
        'Client "guard-test": productionHosts entries must be plain hostnames such as "example.com", without a scheme, port or path.',
      );
    }
  });
});

test.describe('Read-only write blocking', () => {
  // Runs against the local stub server: a read-only environment pointed at it.
  const readOnlyEnv = (baseURL: string, token?: string) =>
    resolveApiEnvironment({ API_ENV: 'staging', API_BASE_URL: baseURL, API_TOKEN: token }, guardClient);

  test('Write requests are rejected in a read-only environment; reads still work', async ({ playwright, stubServer }) => {
    const context = await newApiContext(playwright.request, readOnlyEnv(stubServer.baseURL));
    try {
      expect((await context.get('/status/200')).status()).toBe(200);
      expect((await context.head('/status/200')).status()).toBe(200);
      expect((await context.fetch('/status/200')).status()).toBe(200);

      const writes: [string, () => Promise<unknown>][] = [
        ['POST', () => context.post('/status/201')],
        ['PUT', () => context.put('/status/200')],
        ['PATCH', () => context.patch('/status/200')],
        ['DELETE', () => context.delete('/status/200')],
        ['POST', () => context.fetch('/status/201', { method: 'post' })],
      ];
      for (const [method, write] of writes) {
        await expect(write()).rejects.toThrow(`Write request blocked: API environment "staging" is read-only (${method}).`);
      }
    } finally {
      await context.dispose();
    }
  });

  test('Writes are allowed in a writable environment', async ({ playwright, stubServer }) => {
    const env = resolveApiEnvironment({ API_ENV: 'qa', API_BASE_URL: stubServer.baseURL }, guardClient);
    const context = await newApiContext(playwright.request, env);
    try {
      // The stub answers every path; a status means the request was sent, not blocked.
      expect((await context.post('/status/201')).status()).toBe(201);
    } finally {
      await context.dispose();
    }
  });

  test('Write blocking keeps token redaction working', async ({ playwright, stubServer }) => {
    const fakeToken = fakeSecret('token');
    const context = await newApiContext(playwright.request, readOnlyEnv(stubServer.baseURL, fakeToken));
    try {
      const blocked: Error = await context.post('/status/201').then(
        () => { throw new Error('Expected the write to be blocked'); },
        (e: Error) => e,
      );
      expect(blocked.message).not.toContain(fakeToken);

      const failed: Error = await context.get('/status/503', { failOnStatusCode: true }).then(
        () => { throw new Error('Expected the request to fail'); },
        (e: Error) => e,
      );
      expect(failed.message).toContain('Bearer ***');
      expect(failed.message).not.toContain(fakeToken);
    } finally {
      await context.dispose();
    }
  });
});
