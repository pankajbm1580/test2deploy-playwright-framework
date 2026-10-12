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
  /** Marks a production environment: runs need ALLOW_PRODUCTION=true and are always read-only. */
  production?: boolean;
}

export interface ClientConfig {
  /** Short identifier: lowercase letters, digits and dashes. */
  name: string;
  /** Client folder relative to the repository root. UI specs live in <dir>/ui, API specs in <dir>/api/tests. */
  dir: string;
  ui: {
    /** Used when UI_BASE_URL is not set. */
    defaultBaseURL: string;
    /**
     * Optional login setup (framework/support/login.ts). When set, a "setup" project runs this
     * file from <dir>/ui once per run to log in with UI_USERNAME and UI_PASSWORD, and every
     * browser project starts from the saved, signed-in state. Omit it for apps without login.
     */
    login?: {
      /** File name in <dir>/ui, ending in .setup.ts, e.g. "auth.setup.ts". */
      setupFile: string;
    };
  };
  /**
   * Hostnames of production systems, e.g. ['example.com']. A listed host also covers its
   * subdomains (app.example.com, api.example.com). Any UI_BASE_URL or API_BASE_URL on these
   * hosts is treated as production, whatever API_ENV says.
   */
  productionHosts?: readonly string[];
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
  if (client.ui.login && !/^[\w.-]+\.setup\.ts$/.test(client.ui.login.setupFile)) {
    throw new Error(`${label}: ui.login.setupFile must be a file name in ${client.dir}/ui ending in .setup.ts, such as "auth.setup.ts".`);
  }

  const names = Object.keys(client.api.environments);
  if (names.length === 0) {
    throw new Error(`${label}: api.environments must define at least one environment.`);
  }
  if (!Object.hasOwn(client.api.environments, client.api.defaultEnvironment)) {
    throw new Error(`${label}: api.defaultEnvironment must be one of: ${names.join(', ')}.`);
  }
  for (const [name, preset] of Object.entries(client.api.environments)) {
    if (preset.baseURL !== undefined) parseBaseUrl(`${label} api.environments.${name}.baseURL`, preset.baseURL);
    if (preset.production && !preset.readOnly) {
      throw new Error(`${label}: api.environments.${name} is a production environment and must set readOnly: true.`);
    }
  }

  // Fail closed: a malformed entry would silently never match, so reject it.
  for (const host of client.productionHosts ?? []) {
    if (normalizeHost(host) === undefined) {
      throw new Error(`${label}: productionHosts entries must be plain hostnames such as "example.com", without a scheme, port or path.`);
    }
  }

  return client;
}

/** Lowercase, punycode-normalised hostname, or undefined if `host` is not a plain hostname. */
function normalizeHost(host: string): string | undefined {
  if (!/^[a-z0-9.-]+$/i.test(host) || host.startsWith('.') || host.includes('..')) return undefined;
  try {
    return new URL(`http://${host}`).hostname.replace(/\.$/, '');
  } catch {
    return undefined;
  }
}

/** Whether `url` is on one of the client's production hosts (or a subdomain of one). */
export function isProductionHost(url: URL, productionHosts: readonly string[] = []): boolean {
  const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
  return productionHosts.some((entry) => {
    const host = normalizeHost(entry);
    return host !== undefined && (hostname === host || hostname.endsWith(`.${host}`));
  });
}
