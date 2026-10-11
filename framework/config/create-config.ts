import { defineConfig, devices, type Project } from '@playwright/test';
import { loadEnvFile } from './load-env';
import { apiDiagnostics, htmlReportEnabled, htmlReportMode, reporters, uiDiagnostics } from './diagnostics';
import { resolveApiEnvironment, resolveUiEnvironment } from './environments';

export type Suite = 'ui' | 'api' | 'all';

// Separate folders per suite so runs never overwrite each other's reports.
// playwright-report/ is the path the CI workflow uploads; keep it for the UI suite.
const outputs: Record<Suite, { report: string; results: string }> = {
  ui: { report: 'playwright-report', results: 'test-results' },
  api: { report: 'playwright-report-api', results: 'test-results-api' },
  all: { report: 'playwright-report-all', results: 'test-results-all' },
};

// Root test directory per suite; test paths in output and reports are shown relative to it.
const rootTestDir: Record<Suite, string> = {
  ui: './clients/demo/ui',
  api: '.',
  all: '.',
};

function uiProjects(): Project[] {
  const use = { baseURL: resolveUiEnvironment().baseURL, ...uiDiagnostics() };
  return [
    { name: 'chromium', testDir: './clients/demo/ui', use: { ...devices['Desktop Chrome'], ...use } },
    { name: 'firefox', testDir: './clients/demo/ui', use: { ...devices['Desktop Firefox'], ...use } },
    { name: 'webkit', testDir: './clients/demo/ui', use: { ...devices['Desktop Safari'], ...use } },
  ];
}

function apiProjects(): Project[] {
  return [
    // The framework's own self-tests (config, redaction, stub server); no browser needed.
    { name: 'framework', testDir: './framework/tests', use: { ...apiDiagnostics } },
    { name: 'api', testDir: './clients/demo/api/tests', use: { ...apiDiagnostics } },
  ];
}

export function createConfig({ suite }: { suite: Suite }) {
  loadEnvFile();

  // Validate configuration up front so a misconfigured run fails before any test starts.
  // Each suite checks only the variables it uses, so a bad UI_BASE_URL never blocks API runs.
  if (suite !== 'api') resolveUiEnvironment();
  if (suite !== 'ui') resolveApiEnvironment();

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
    testDir: rootTestDir[suite],
    fullyParallel: true,
    forbidOnly: isCI,
    retries: isCI ? 2 : 0,
    workers: isCI ? 1 : undefined,
    reporter: reporters(suite, outputs[suite].report),
    outputDir: outputs[suite].results,
    projects: [
      ...(suite !== 'api' ? uiProjects() : []),
      ...(suite !== 'ui' ? apiProjects() : []),
    ],
  });
}
