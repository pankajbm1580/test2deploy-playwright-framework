import path from 'node:path';
import { defineClient } from '../../framework/config/client';

/**
 * Example client with login setup: the local demo app in ./app (see README.md).
 * No credentials here: they come from UI_USERNAME and UI_PASSWORD. The demo config
 * generates one-off values when they are not set.
 *
 * `dir` is absolute so this client also works from configs outside the repository root.
 */
export const loginDemoClient = defineClient({
  name: 'login-demo',
  dir: path.join(__dirname),
  ui: {
    defaultBaseURL: 'http://127.0.0.1:4321/',
    login: { setupFile: 'auth.setup.ts' },
  },
  api: {
    // Unused by this example (UI only); a client config always names an API environment.
    defaultEnvironment: 'local',
    environments: { local: { baseURL: 'http://127.0.0.1:4321', readOnly: true } },
  },
});
