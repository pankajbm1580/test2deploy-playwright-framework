import { createConfig } from './framework/config/create-config';
import { loadEnvFile } from './framework/config/load-env';
import { smartpaperClient } from './clients/smartpaper/client.config';

loadEnvFile();

export default createConfig({
  suite: 'ui',
  client: smartpaperClient,
  outputName: 'smartpaper',
});
