import { createConfig } from './framework/config/create-config';
import { demoClient } from './clients/demo/client.config';

/**
 * UI (browser) suite. This is the default config used by `npx playwright test`,
 * the CI workflow and the Playwright test agents.
 */
export default createConfig({ suite: 'ui', client: demoClient });
