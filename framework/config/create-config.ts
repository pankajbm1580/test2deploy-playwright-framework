import { defineConfig, devices, type Project } from '@playwright/test';
import { loadEnvFile } from './load-env';
import { apiCallsMode, apiDiagnostics, htmlReportEnabled, htmlReportMode, redactingReporter, reporters, uiDiagnostics } from './diagnostics';
import type { ClientConfig } from './client';
import { assertSafeReporterCommandLine, reporterGuardPath } from './reporter-guard';
import { resolveApiEnvironment, resolveUiEnvironment } from './environments';
import type { ApiFixtureOptions } from '../fixtures/api';

export type Suite = 'ui' | 'api' | 'all';

// Separate folders per suite so runs never overwrite each other's reports.
// playwright-report/ is the path the CI workflow uploads; keep it for the UI suite.
const outputs: Record<Suite, { report: string; results: string }> = {
  ui: { report: 'playwright-report', results: 'test-results' },
  api: { report: 'playwright-report-api', results: 'test-results-api' },
  all: { report: 'playwright-report-all', results: 'test-results-all' },
};

// Root test directory per suite; test paths in output and reports are shown relative to it.
function rootTestDir(suite: Suite, client: ClientConfig): string {
  return suite === 'ui' ? `${client.dir}/ui` : '.';
}

function uiProjects(client: ClientConfig): Project[] {
  const testDir = `${client.dir}/ui`;
  const use = { baseURL: resolveUiEnvironment(process.env, client).baseURL, ...uiDiagnostics() };
  return [
    { name: 'chromium', testDir, use: { ...devices['Desktop Chrome'], ...use } },
    { name: 'firefox', testDir, use: { ...devices['Desktop Firefox'], ...use } },
    { name: 'webkit', testDir, use: { ...devices['Desktop Safari'], ...use } },
  ];
}

function apiProjects(client: ClientConfig): Project<{}, ApiFixtureOptions>[] {
  return [
    // The framework's own self-tests (config, redaction, stub server); no browser and no client needed.
    { name: 'framework', testDir: './framework/tests', use: { ...apiDiagnostics } },
    // Client settings only (no token): the api fixture resolves API_* variables against them.
    { name: 'api', testDir: `${client.dir}/api/tests`, use: { ...apiDiagnostics, client } },
  ];
}

export function createConfig({ suite, client }: { suite: Suite; client: ClientConfig }) {
  // Before any reporter starts: refuse a --reporter override that drops the redacting reporter,
  // and reporters that would write files during a --list run.
  assertSafeReporterCommandLine();

  loadEnvFile();

  // Validate configuration up front so a misconfigured run fails before any test starts.
  // Each suite checks only the variables it uses, so a bad UI_BASE_URL never blocks API runs.
  // This also runs the production guard, so an unconfirmed production run never starts.
  if (suite !== 'api') resolveUiEnvironment(process.env, client);
  if (suite !== 'ui') {
    resolveApiEnvironment(process.env, client);
    apiCallsMode();
  }

  if (process.env.ALLOW_PRODUCTION === 'true' && !process.env.TEST_WORKER_INDEX) {
    console.warn('[config] ALLOW_PRODUCTION=true: production targets are allowed for this run. Production API runs are read-only.');
  }

  // Explain the HTML report decision once, from the main process only (workers also load the config).
  if (suite !== 'ui' && process.env.API_TOKEN && !process.env.TEST_WORKER_INDEX) {
    console.warn(
      htmlReportEnabled(suite)
        ? `[config] PW_HTML_REPORT=${htmlReportMode()}: HTML report forced while API_TOKEN is set. It may contain the token; keep it private and delete it after use.`
        : '[config] API_TOKEN is set: HTML report skipped for this run because it could contain the token. List and JUnit output are still written. Set PW_HTML_REPORT=always to force it for local debugging.',
    );
  }

  const isCI = !!process.env.CI;

  return defineConfig({
    testDir: rootTestDir(suite, client),
    fullyParallel: true,
    forbidOnly: isCI,
    retries: isCI ? 2 : 0,
    workers: isCI ? 1 : undefined,
    // The redacting reporter goes first: it masks secrets and cookies in Playwright's own
    // results before the list, HTML and JUnit reporters see them.
    reporter: [redactingReporter, ...reporters(suite, outputs[suite].report)],
    // Backstop: refuses the run if the reporters it resolved do not start with the redacting reporter.
    globalSetup: reporterGuardPath,
    outputDir: outputs[suite].results,
    projects: [
      ...(suite !== 'api' ? uiProjects(client) : []),
      ...(suite !== 'ui' ? apiProjects(client) : []),
    ],
  });
}
