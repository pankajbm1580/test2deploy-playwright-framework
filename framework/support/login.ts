import fs from 'node:fs';
import path from 'node:path';
import type { BrowserContext } from '@playwright/test';

/**
 * Reusable login setup for UI suites (see clients/login-demo/README.md).
 *
 * A client opts in with `ui.login` in its client config. createConfig then adds a "setup"
 * project that runs the client's setup file, which logs in once and saves the browser state
 * with saveLoginState(). The browser projects depend on it and start every test from that
 * state, already signed in. Clients without `ui.login` are unchanged.
 *
 * Credentials come only from UI_USERNAME and UI_PASSWORD (shell, CI secrets or the git-ignored
 * .env), never from source. The saved state holds session cookies, so it lives in the
 * git-ignored playwright/.auth/ folder and is readable by the current user only where the OS allows.
 */

export const LOGIN_VARIABLES = ['UI_USERNAME', 'UI_PASSWORD'] as const;

export interface LoginCredentials {
  username: string;
  password: string;
}

/** The login credentials, or an error naming the missing variables (never any values). */
export function resolveLoginCredentials(env: NodeJS.ProcessEnv = process.env): LoginCredentials {
  const missing = LOGIN_VARIABLES.filter((name) => !env[name]);
  if (missing.length) {
    throw new Error(
      `Login setup needs ${missing.join(' and ')}. Set them in the shell, CI secrets or the git-ignored .env file; never commit them.`,
    );
  }
  return { username: env.UI_USERNAME!, password: env.UI_PASSWORD! };
}

/** The git-ignored folder for saved login state. */
export const loginStateDir = path.join(__dirname, '../../playwright/.auth');

/** Where a client's saved login state is kept: playwright/.auth/<client>.json. */
export function loginStatePath(client: { name: string }): string {
  return path.join(loginStateDir, `${client.name}.json`);
}

/** Saves the context's cookies and storage to `file`, readable by the current user only (where supported). */
export async function saveLoginState(context: BrowserContext, file: string): Promise<void> {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  fs.writeFileSync(file, JSON.stringify(await context.storageState()), { mode: 0o600 });
  // writeFileSync only applies the mode to new files; Windows ignores POSIX modes.
  fs.chmodSync(file, 0o600);
}
