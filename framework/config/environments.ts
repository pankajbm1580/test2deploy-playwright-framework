import { parseBaseUrl } from './base-url';
import { isProductionHost, type ClientConfig } from './client';

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
 *   ALLOW_PRODUCTION "true" confirms a run against production (see below)
 * Base URLs must not contain credentials, a query string or a fragment.
 *
 * Production guard: a target is production when its API preset sets production: true or its
 * UI/API base URL is on one of the client's productionHosts. Such runs are refused unless
 * ALLOW_PRODUCTION=true, and production API runs are always read-only. Anything that cannot
 * be validated (a malformed URL or ALLOW_PRODUCTION value) stops the run: the guard fails closed.
 */

/** Parses ALLOW_PRODUCTION. Any value other than "true", "false" or unset is an error. */
function productionAllowed(env: NodeJS.ProcessEnv): boolean {
  const value = env.ALLOW_PRODUCTION;
  if (value === undefined || value === '' || value === 'false') return false;
  if (value === 'true') return true;
  throw new Error('ALLOW_PRODUCTION must be "true" or "false", or left unset.');
}

export interface UiEnvironment {
  baseURL: string;
}

export function resolveUiEnvironment(env: NodeJS.ProcessEnv, client: ClientConfig): UiEnvironment {
  const allowProduction = productionAllowed(env);
  const url = parseBaseUrl('UI_BASE_URL', env.UI_BASE_URL || client.ui.defaultBaseURL);
  if (isProductionHost(url, client.productionHosts) && !allowProduction) {
    throw new Error('Refusing to run against a production UI. Set ALLOW_PRODUCTION=true to confirm.');
  }
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

export function resolveApiEnvironment(env: NodeJS.ProcessEnv, client: ClientConfig): ApiEnvironment {
  const { api } = client;
  const allowProduction = productionAllowed(env);
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
  const url = parseBaseUrl('API_BASE_URL', baseURL, { credentialsHint: 'Use API_TOKEN for authentication.' });
  const production = preset.production === true || isProductionHost(url, client.productionHosts);
  if (production && !allowProduction) {
    throw new Error('Refusing to run against a production API environment. Set ALLOW_PRODUCTION=true to confirm.');
  }

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
  if (production) {
    if (env.API_READ_ONLY === 'false') {
      throw new Error('API_READ_ONLY cannot be "false" for a production environment. Production runs are always read-only.');
    }
    // Also covers a production host reached through a writable preset such as qa.
    readOnly = true;
  }

  return { name, baseURL, timeoutMs, token: env.API_TOKEN || undefined, readOnly };
}
