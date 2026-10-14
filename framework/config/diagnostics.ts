import path from 'node:path';
import type { PlaywrightTestConfig, ReporterDescription } from '@playwright/test';
import type { Suite } from './create-config';

/**
 * Masks secrets and cookies in Playwright's own results (step errors with call logs, test
 * errors, step titles, stdout) before other reporters write them. Must be listed first;
 * framework/config/reporter-guard.ts refuses runs where it is not. It does not redact live
 * terminal output.
 */
export const redactingReporterPath = path.join(__dirname, '../reporters/redacting-reporter.ts');
export const redactingReporter: ReporterDescription = [redactingReporterPath];

/**
 * Whether this is a `playwright test --list` run. Playwright still runs the configured
 * reporters when listing, so the HTML and JUnit reporters would replace existing reports
 * with empty ones; list runs therefore only print the test list.
 */
export function listOnly(argv: readonly string[] = process.argv): boolean {
  const end = argv.indexOf('--'); // Arguments after "--" are file filters, not options.
  return (end < 0 ? argv : argv.slice(0, end)).includes('--list');
}

/**
 * Shared failure diagnostics for every suite.
 *
 * Video is off unless a test is retried. To record it while debugging, set PW_VIDEO,
 * e.g. PW_VIDEO=retain-on-failure (allowed: off, on, retain-on-failure, on-first-retry).
 *
 * API traces stay off: they would record request headers such as Authorization.
 * For the same reason, the HTML report is skipped when a run sends API_TOKEN (see below).
 * Instead, a failed API test gets a redacted "api-calls" attachment (see PW_API_CALLS).
 */

const videoModes = ['off', 'on', 'retain-on-failure', 'on-first-retry'] as const;
type VideoMode = (typeof videoModes)[number];

export function videoMode(env: NodeJS.ProcessEnv = process.env): VideoMode {
  const value = env.PW_VIDEO || 'on-first-retry';
  if (!(videoModes as readonly string[]).includes(value)) {
    throw new Error(`PW_VIDEO must be one of: ${videoModes.join(', ')}.`);
  }
  return value as VideoMode;
}

export function uiDiagnostics(env: NodeJS.ProcessEnv = process.env): PlaywrightTestConfig['use'] {
  return {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: videoMode(env),
  };
}

export const apiDiagnostics: PlaywrightTestConfig['use'] = {
  trace: 'off',
};

const apiCallsModes = ['on-failure', 'off'] as const;
type ApiCallsMode = (typeof apiCallsModes)[number];

/**
 * Whether failed API tests get an "api-calls" attachment with their last 20 calls, redacted
 * (framework/support/sanitize.ts). PW_API_CALLS=off disables it; the default is on-failure.
 */
export function apiCallsMode(env: NodeJS.ProcessEnv = process.env): ApiCallsMode {
  const value = env.PW_API_CALLS || 'on-failure';
  if (!(apiCallsModes as readonly string[]).includes(value)) {
    throw new Error(`PW_API_CALLS must be one of: ${apiCallsModes.join(', ')}.`);
  }
  return value as ApiCallsMode;
}

const htmlReportModes = ['auto', 'always'] as const;
type HtmlReportMode = (typeof htmlReportModes)[number];

export function htmlReportMode(env: NodeJS.ProcessEnv = process.env): HtmlReportMode {
  const value = env.PW_HTML_REPORT || 'auto';
  if (!(htmlReportModes as readonly string[]).includes(value)) {
    throw new Error(`PW_HTML_REPORT must be one of: ${htmlReportModes.join(', ')}.`);
  }
  return value as HtmlReportMode;
}

/**
 * Whether to write an HTML report. Playwright stores failed API request steps in the HTML
 * report with their request headers unredacted, so a suite that sends API_TOKEN skips it
 * by default. PW_HTML_REPORT=always forces it, for local debugging only.
 */
export function htmlReportEnabled(suite: Suite, env: NodeJS.ProcessEnv = process.env): boolean {
  const mode = htmlReportMode(env);
  const sendsApiToken = suite !== 'ui' && !!env.API_TOKEN;
  return !sendsApiToken || mode === 'always';
}

/**
 * list + HTML (when safe; never auto-opened, so no report server is started) + JUnit for CI.
 * A --list run gets the list reporter only, so it never overwrites existing reports.
 */
export function reporters(
  suite: Suite,
  htmlFolder: string,
  env: NodeJS.ProcessEnv = process.env,
  argv: readonly string[] = process.argv,
  junitName: string = suite,
): ReporterDescription[] {
  if (listOnly(argv)) return [['list']];
  return [
    ['list'],
    ...(htmlReportEnabled(suite, env)
      ? [['html', { outputFolder: htmlFolder, open: 'never' }] satisfies ReporterDescription]
      : []),
    ['junit', { outputFile: `reports/junit/${junitName}.xml` }],
  ];
}
