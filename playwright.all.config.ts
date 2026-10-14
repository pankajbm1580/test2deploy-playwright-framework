import { createConfig } from './framework/config/create-config';
import { demoClient } from './clients/demo/client.config';

/** UI and API suites in one run with one combined report. Run with: npm run test:all */
export default createConfig({ suite: 'all', client: demoClient });
