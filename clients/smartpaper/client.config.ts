import path from 'node:path';
import { defineClient } from '../../framework/config/client';

export const smartpaperClient = defineClient({
  name: 'smartpaper',
  dir: path.join(__dirname),
  ui: {
    defaultBaseURL: 'http://127.0.0.1:4321/',
  },
  productionHosts: ['smartpaper.fi'],
  api: {
    defaultEnvironment: 'test',
    environments: {
      test: {
        readOnly: true,
      },
    },
  },
});
