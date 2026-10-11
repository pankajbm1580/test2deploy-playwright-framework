import { test, expect } from '@playwright/test';
import { resolveApiEnvironment as resolveApi, resolveUiEnvironment as resolveUi } from '../../../../framework/config/environments';
import { demoClient } from '../../client.config';

// The demo client's defaults, moved here from the framework tests when the defaults moved
// out of framework/ into clients/demo/client.config.ts. Test names and assertions are unchanged.
const resolveApiEnvironment = (env: NodeJS.ProcessEnv) => resolveApi(env, demoClient.api);
const resolveUiEnvironment = (env: NodeJS.ProcessEnv) => resolveUi(env, demoClient.ui);

test.describe('API environment configuration', () => {
  test('Defaults to JSONPlaceholder when no variables are set', () => {
    expect(resolveApiEnvironment({})).toEqual({
      name: 'jsonplaceholder',
      baseURL: 'https://jsonplaceholder.typicode.com',
      timeoutMs: 10_000,
      token: undefined,
      readOnly: false,
    });
  });
});

test.describe('UI environment configuration', () => {
  test('Defaults to the TodoMVC demo when UI_BASE_URL is not set', () => {
    expect(resolveUiEnvironment({})).toEqual({ baseURL: 'https://demo.playwright.dev/todomvc/' });
    expect(resolveUiEnvironment({ UI_BASE_URL: '' })).toEqual({ baseURL: 'https://demo.playwright.dev/todomvc/' });
  });
});
