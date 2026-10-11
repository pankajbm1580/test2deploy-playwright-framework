import { defineClient } from '../../framework/config/client';

/**
 * Demo client: the TodoMVC demo app (UI) and JSONPlaceholder (API).
 * No secrets here; tokens and client URLs for qa/staging come from environment variables.
 */
export const demoClient = defineClient({
  name: 'demo',
  dir: './clients/demo',
  ui: {
    defaultBaseURL: 'https://demo.playwright.dev/todomvc/',
  },
  api: {
    defaultEnvironment: 'jsonplaceholder',
    environments: {
      jsonplaceholder: { baseURL: 'https://jsonplaceholder.typicode.com', readOnly: false },
      // Client-approved environments: URLs are supplied via API_BASE_URL, not committed.
      qa: { readOnly: false },
      staging: { readOnly: true },
    },
  },
});
