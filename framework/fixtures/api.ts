import { test as base, expect as baseExpect, type APIRequest, type APIRequestContext } from '@playwright/test';
import type { ClientConfig } from '../config/client';
import { resolveApiEnvironment, type ApiEnvironment } from '../config/environments';
import { startStubServer, type StubServer } from '../support/stub-server';
import { schemaMatchers } from '../support/schema';
import { withRedactedErrors } from '../support/redact';
import { withWritesBlocked } from '../support/read-only';

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
  const redacted = withRedactedErrors(context, [apiEnv.token]);
  // Read-only environments (including every production run) reject write requests outright.
  return apiEnv.readOnly ? withWritesBlocked(redacted, apiEnv.name) : redacted;
}

type TestFixtures = {
  /** Request context for the configured API environment (base URL, timeout, optional auth). */
  api: APIRequestContext;
  /** Request context for the local stub server (error, timeout and malformed-JSON scenarios). */
  stubApi: APIRequestContext;
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
