import { test as base, expect as baseExpect, type APIRequest, type APIRequestContext } from '@playwright/test';
import { resolveApiEnvironment, type ApiEnvironment } from '../../framework/config/environments';
import { startStubServer, type StubServer } from '../support/stub-server';
import { schemaMatchers } from '../support/schema';
import { withRedactedErrors } from '../support/redact';

/**
 * Creates the request context for an API environment. Errors from it never contain the token:
 * Playwright's API error call logs include request headers, so they are redacted here.
 */
export async function newApiContext(request: APIRequest, apiEnv: ApiEnvironment): Promise<APIRequestContext> {
  const context = await request.newContext({
    baseURL: apiEnv.baseURL,
    timeout: apiEnv.timeoutMs,
    extraHTTPHeaders: {
      Accept: 'application/json',
      ...(apiEnv.token ? { Authorization: `Bearer ${apiEnv.token}` } : {}),
    },
  });
  return withRedactedErrors(context, [apiEnv.token]);
}

type TestFixtures = {
  /** Request context for the configured API environment (base URL, timeout, optional auth). */
  api: APIRequestContext;
  /** Request context for the local stub server (error, timeout and malformed-JSON scenarios). */
  stubApi: APIRequestContext;
};

type WorkerFixtures = {
  apiEnv: ApiEnvironment;
  stubServer: StubServer;
};

export const test = base.extend<TestFixtures, WorkerFixtures>({
  apiEnv: [
    async ({}, use) => {
      await use(resolveApiEnvironment());
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

  api: async ({ playwright, apiEnv }, use) => {
    const context = await newApiContext(playwright.request, apiEnv);
    await use(context);
    await context.dispose();
  },

  stubApi: async ({ playwright, stubServer }, use) => {
    const context = await playwright.request.newContext({ baseURL: stubServer.baseURL });
    await use(context);
    await context.dispose();
  },
});

export const expect = baseExpect.extend(schemaMatchers);
