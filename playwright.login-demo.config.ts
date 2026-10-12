import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { createConfig } from './framework/config/create-config';
import { loadEnvFile } from './framework/config/load-env';
import { loginDemoClient } from './clients/login-demo/client.config';

/**
 * Login setup example against the local demo app. Run with: npm run test:login-demo
 *
 * Local demo only: when UI_USERNAME and UI_PASSWORD are not set, one-off random credentials
 * are generated for this run and given to the demo app, so nothing is hardcoded. Workers
 * inherit them from this process. A real client sets its own credentials and has no webServer.
 */
loadEnvFile();
const generated = () => `demo-${randomBytes(12).toString('hex')}`;
process.env.UI_USERNAME ||= generated();
process.env.UI_PASSWORD ||= generated();

const port = process.env.LOGIN_DEMO_PORT || '4321';
process.env.UI_BASE_URL ||= `http://127.0.0.1:${port}/`;

export default {
  ...createConfig({ suite: 'ui', client: loginDemoClient, outputName: 'login-demo' }),
  webServer: {
    command: `node "${path.join(__dirname, 'clients/login-demo/app/server.mjs')}"`,
    url: `http://127.0.0.1:${port}/login`,
    reuseExistingServer: false,
    timeout: 30_000,
    env: {
      LOGIN_DEMO_PORT: port,
      // The demo app expects these; LOGIN_DEMO_* lets a test make it reject the login.
      LOGIN_DEMO_USER: process.env.LOGIN_DEMO_USER || process.env.UI_USERNAME,
      LOGIN_DEMO_PASSWORD: process.env.LOGIN_DEMO_PASSWORD || process.env.UI_PASSWORD,
    },
  },
};
