import { defineClient } from '../../config/client';
import {
  resolveApiEnvironment as resolveApi,
  resolveUiEnvironment as resolveUi,
  type ApiEnvironment,
  type UiEnvironment,
} from '../../config/environments';

/**
 * A client used only by the framework's self-tests, so they never depend on a real client.
 * The environment names match the ones the existing assertions expect; the URLs are
 * placeholders on the reserved .test domain.
 */
export const testClient = defineClient({
  name: 'framework-test',
  dir: './clients/framework-test',
  ui: {
    defaultBaseURL: 'https://app.example.test/',
  },
  api: {
    defaultEnvironment: 'jsonplaceholder',
    environments: {
      jsonplaceholder: { baseURL: 'https://api.example.test', readOnly: false },
      qa: { readOnly: false },
      staging: { readOnly: true },
    },
  },
});

/** The framework resolvers, bound to the test client. */
export const resolveApiEnvironment = (env: NodeJS.ProcessEnv): ApiEnvironment => resolveApi(env, testClient.api);
export const resolveUiEnvironment = (env: NodeJS.ProcessEnv): UiEnvironment => resolveUi(env, testClient.ui);
