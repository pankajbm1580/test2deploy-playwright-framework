/**
 * Resolves which API environment the tests run against.
 *
 * Everything comes from environment variables (or a local, git-ignored .env file),
 * never from source code:
 *   API_ENV         jsonplaceholder (default) | qa | staging
 *   API_BASE_URL    overrides the preset base URL; required for qa and staging
 *   API_TOKEN       optional; sent as "Authorization: Bearer <token>"
 *   API_TIMEOUT_MS  per-request timeout in ms (default 10000)
 *   API_READ_ONLY   "true"/"false"; overrides whether write tests are allowed
 */

export type ApiEnvironmentName = 'jsonplaceholder' | 'qa' | 'staging';

export interface ApiEnvironment {
  name: ApiEnvironmentName;
  baseURL: string;
  timeoutMs: number;
  token: string | undefined;
  readOnly: boolean;
}

interface Preset {
  baseURL?: string;
  readOnly: boolean;
}

const presets: Record<ApiEnvironmentName, Preset> = {
  jsonplaceholder: { baseURL: 'https://jsonplaceholder.typicode.com', readOnly: false },
  // Client-approved environments: URLs are supplied via API_BASE_URL, not committed.
  qa: { readOnly: false },
  staging: { readOnly: true },
};

const DEFAULT_TIMEOUT_MS = 10_000;

export function resolveApiEnvironment(env: NodeJS.ProcessEnv = process.env): ApiEnvironment {
  const name = (env.API_ENV || 'jsonplaceholder') as ApiEnvironmentName;
  const preset = presets[name];
  if (!preset) {
    throw new Error(`Unknown API_ENV "${name}". Expected one of: ${Object.keys(presets).join(', ')}.`);
  }

  const baseURL = env.API_BASE_URL || preset.baseURL;
  if (!baseURL) {
    throw new Error(`API_BASE_URL must be set when API_ENV is "${name}".`);
  }
  try {
    new URL(baseURL);
  } catch {
    throw new Error(`API_BASE_URL "${baseURL}" is not a valid URL.`);
  }

  const timeoutMs = env.API_TIMEOUT_MS ? Number(env.API_TIMEOUT_MS) : DEFAULT_TIMEOUT_MS;
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
    throw new Error(`API_TIMEOUT_MS must be a positive integer, got "${env.API_TIMEOUT_MS}".`);
  }

  let readOnly = preset.readOnly;
  if (env.API_READ_ONLY !== undefined && env.API_READ_ONLY !== '') {
    if (env.API_READ_ONLY !== 'true' && env.API_READ_ONLY !== 'false') {
      throw new Error(`API_READ_ONLY must be "true" or "false", got "${env.API_READ_ONLY}".`);
    }
    readOnly = env.API_READ_ONLY === 'true';
  }

  return { name, baseURL, timeoutMs, token: env.API_TOKEN || undefined, readOnly };
}
