import { parseBaseUrl } from './base-url';
import type { ClientConfig } from './client';

/**
 * Resolves which UI and API environments the tests run against.
 *
 * Defaults and environment presets come from the client configuration (see client.ts);
 * everything else comes from environment variables (or a local, git-ignored .env file),
 * never from source code:
 *   UI_BASE_URL     app under test for the browser suite (default: the client's ui.defaultBaseURL)
 *   API_ENV         one of the client's api.environments (default: api.defaultEnvironment)
 *   API_BASE_URL    overrides the preset base URL; required when the preset has none
 *   API_TOKEN       optional; sent as "Authorization: Bearer <token>"
 *   API_TIMEOUT_MS  per-request timeout in ms (default 10000)
 *   API_READ_ONLY   "true"/"false"; overrides whether write tests are allowed
 * Base URLs must not contain credentials, a query string or a fragment.
 */

export interface UiEnvironment {
  baseURL: string;
}

export function resolveUiEnvironment(env: NodeJS.ProcessEnv, ui: ClientConfig['ui']): UiEnvironment {
  const url = parseBaseUrl('UI_BASE_URL', env.UI_BASE_URL || ui.defaultBaseURL);
  // Tests navigate with page.goto('./'), which resolves against the last path segment,
  // so the base URL must end with "/" to keep its full path (e.g. /app/).
  if (!url.pathname.endsWith('/')) url.pathname += '/';
  return { baseURL: url.href };
}

export interface ApiEnvironment {
  name: string;
  baseURL: string;
  timeoutMs: number;
  token: string | undefined;
  readOnly: boolean;
}

const DEFAULT_TIMEOUT_MS = 10_000;

export function resolveApiEnvironment(env: NodeJS.ProcessEnv, api: ClientConfig['api']): ApiEnvironment {
  // Error messages name the variable and the expected format but never echo the supplied
  // value: a secret pasted into the wrong variable must not end up in logs or reports.
  const name = env.API_ENV || api.defaultEnvironment;
  if (!Object.hasOwn(api.environments, name)) {
    throw new Error(`API_ENV must be one of: ${Object.keys(api.environments).join(', ')}.`);
  }
  const preset = api.environments[name];

  const baseURL = env.API_BASE_URL || preset.baseURL;
  if (!baseURL) {
    throw new Error(`API_BASE_URL must be set when API_ENV is "${name}".`);
  }
  parseBaseUrl('API_BASE_URL', baseURL, { credentialsHint: 'Use API_TOKEN for authentication.' });

  const timeoutMs = env.API_TIMEOUT_MS ? Number(env.API_TIMEOUT_MS) : DEFAULT_TIMEOUT_MS;
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
    throw new Error('API_TIMEOUT_MS must be a positive integer number of milliseconds.');
  }

  let readOnly = preset.readOnly;
  if (env.API_READ_ONLY !== undefined && env.API_READ_ONLY !== '') {
    if (env.API_READ_ONLY !== 'true' && env.API_READ_ONLY !== 'false') {
      throw new Error('API_READ_ONLY must be "true" or "false", or left unset.');
    }
    readOnly = env.API_READ_ONLY === 'true';
  }

  return { name, baseURL, timeoutMs, token: env.API_TOKEN || undefined, readOnly };
}
