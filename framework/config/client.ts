import { parseBaseUrl } from './base-url';

/**
 * Everything the framework needs to know about one client (application under test).
 * Each client defines one of these in clients/<name>/client.config.ts; the framework
 * itself holds no client URLs, environment names or defaults.
 *
 * Settings only: tokens and credentials never go here. They come from environment variables.
 */

export interface ApiEnvironmentPreset {
  /** Preset base URL. Omit it to require API_BASE_URL, which keeps client URLs out of source. */
  baseURL?: string;
  /** Whether write (POST/PUT/PATCH/DELETE) tests are skipped. API_READ_ONLY overrides it. */
  readOnly: boolean;
}

export interface ClientConfig {
  /** Short identifier: lowercase letters, digits and dashes. */
  name: string;
  /** Client folder relative to the repository root. UI specs live in <dir>/ui, API specs in <dir>/api/tests. */
  dir: string;
  ui: {
    /** Used when UI_BASE_URL is not set. */
    defaultBaseURL: string;
  };
  api: {
    /** Used when API_ENV is not set. Must be one of `environments`. */
    defaultEnvironment: string;
    /** Selected with API_ENV. */
    environments: Record<string, ApiEnvironmentPreset>;
  };
}

/** Validates a client configuration once, when it is defined, and returns it unchanged. */
export function defineClient<T extends ClientConfig>(client: T): T {
  const label = `Client "${client.name}"`;
  if (!/^[a-z0-9-]+$/.test(client.name)) {
    throw new Error('Client name must use only lowercase letters, digits and dashes.');
  }
  if (!client.dir) {
    throw new Error(`${label}: dir must be set.`);
  }

  parseBaseUrl(`${label} ui.defaultBaseURL`, client.ui.defaultBaseURL);

  const names = Object.keys(client.api.environments);
  if (names.length === 0) {
    throw new Error(`${label}: api.environments must define at least one environment.`);
  }
  if (!Object.hasOwn(client.api.environments, client.api.defaultEnvironment)) {
    throw new Error(`${label}: api.defaultEnvironment must be one of: ${names.join(', ')}.`);
  }
  for (const [name, preset] of Object.entries(client.api.environments)) {
    if (preset.baseURL !== undefined) parseBaseUrl(`${label} api.environments.${name}.baseURL`, preset.baseURL);
  }

  return client;
}
