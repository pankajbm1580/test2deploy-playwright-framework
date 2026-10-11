import { createConfig } from './framework/config/create-config';
import { demoClient } from './clients/demo/client.config';

/** API suite. Run with: npm run test:api */
export default createConfig({ suite: 'api', client: demoClient });
