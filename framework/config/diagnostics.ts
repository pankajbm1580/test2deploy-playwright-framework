import type { PlaywrightTestConfig, ReporterDescription } from '@playwright/test';
import type { Suite } from './create-config';

/**
 * Shared failure diagnostics for every suite.
 *
 * Video is off unless a test is retried. To record it while debugging, set PW_VIDEO,
 * e.g. PW_VIDEO=retain-on-failure (allowed: off, on, retain-on-failure, on-first-retry).
 *
 * API traces stay off: they would record request headers such as Authorization.
 * For the same reason, the HTML report is skipped when a run sends API_TOKEN (see below).
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

/** list + HTML (when safe; never auto-opened, so no report server is started) + JUnit for CI. */
export function reporters(suite: Suite, htmlFolder: string, env: NodeJS.ProcessEnv = process.env): ReporterDescription[] {
  return [
    ['list'],
    ...(htmlReportEnabled(suite, env)
      ? [['html', { outputFolder: htmlFolder, open: 'never' }] satisfies ReporterDescription]
      : []),
    ['junit', { outputFile: `reports/junit/${suite}.xml` }],
  ];
}
