import { test as base, expect as baseExpect, type APIRequest, type APIRequestContext } from '@playwright/test';
import type { ClientConfig } from '../config/client';
import { resolveApiEnvironment, type ApiEnvironment } from '../config/environments';
import { startStubServer, type StubServer } from '../support/stub-server';
import { schemaMatchers } from '../support/schema';
import { withRedactedErrors } from '../support/redact';
import { withWritesBlocked } from '../support/read-only';
import { CleanupRegistry } from '../support/cleanup';
import { ApiCallRecorder, attachApiCalls } from '../support/api-recorder';
import { apiCallsMode } from '../config/diagnostics';

/** Headers sent on every request to an API environment. */
function apiHeaders(apiEnv: ApiEnvironment): Record<string, string> {
  return {
    Accept: 'application/json',
    ...(apiEnv.token ? { Authorization: `Bearer ${apiEnv.token}` } : {}),
  };
}

/**
 * Creates the request context for an API environment. Errors from it never contain the token:
 * Playwright's API error call logs include request headers, so they are redacted here.
 */
export async function newApiContext(request: APIRequest, apiEnv: ApiEnvironment): Promise<APIRequestContext> {
  const context = await request.newContext({
    baseURL: apiEnv.baseURL,
    timeout: apiEnv.timeoutMs,
    extraHTTPHeaders: apiHeaders(apiEnv),
  });
  const redacted = withRedactedErrors(context, [apiEnv.token]);
  // Read-only environments (including every production run) reject write requests outright.
  return apiEnv.readOnly ? withWritesBlocked(redacted, apiEnv.name) : redacted;
}

type TestFixtures = {
  /**
   * Request context for the configured API environment (base URL, timeout, optional auth).
   * If the test fails, its last 20 calls are attached, redacted, as "api-calls" (PW_API_CALLS).
   */
  api: APIRequestContext;
  /** Request context for the local stub server (error, timeout and malformed-JSON scenarios). */
  stubApi: APIRequestContext;
  /** Undo steps for test data, run after the test whether it passed or failed. */
  cleanup: CleanupRegistry;
};

/** Set per project by createConfig(): the client's settings (never tokens or credentials). */
export type ApiFixtureOptions = {
  client: ClientConfig | undefined;
};

type WorkerFixtures = ApiFixtureOptions & {
  apiEnv: ApiEnvironment;
  stubServer: StubServer;
};

export const test = base.extend<TestFixtures, WorkerFixtures>({
  client: [undefined, { scope: 'worker', option: true }],

  apiEnv: [
    async ({ client }, use) => {
      if (!client) {
        throw new Error('The api fixture needs client settings: this project has no client option. Pass a client to createConfig().');
      }
      await use(resolveApiEnvironment(process.env, client));
    },
    { scope: 'worker' },
  ],

  stubServer: [
    async ({}, use) => {
      const server = await startStubServer();
      await use(server);
      await server.close();
    },
    { scope: 'worker' },
  ],

  api: async ({ playwright, apiEnv }, use, testInfo) => {
    const context = await newApiContext(playwright.request, apiEnv);
    if (apiCallsMode() === 'off') {
      await use(context);
    } else {
      const recorder = new ApiCallRecorder({ baseURL: apiEnv.baseURL, defaultHeaders: apiHeaders(apiEnv), secrets: [apiEnv.token] });
      await use(recorder.wrap(context));
      // Torn down after cleanup (which depends on api), so failed cleanup calls are included.
      await attachApiCalls(testInfo, recorder);
    }
    await context.dispose();
  },

  // Depends on api, so it is torn down (and its steps run) before the request context is disposed.
  // A failing step fails the test, so leftover data is never silent.
  cleanup: async ({ api }, use) => {
    const registry = new CleanupRegistry(api);
    await use(registry);
    await registry.run();
  },

  stubApi: async ({ playwright, stubServer }, use) => {
    const context = await playwright.request.newContext({ baseURL: stubServer.baseURL });
    await use(context);
    await context.dispose();
  },
});

export const expect = baseExpect.extend(schemaMatchers);
