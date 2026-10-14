import { defineConfig, type ReporterDescription } from '@playwright/test';
import { apiCallsMode, apiDiagnostics, htmlReportEnabled, listOnly, redactingReporter } from '../config/diagnostics';
import { assertSafeReporterCommandLine, reporterGuardPath } from '../config/reporter-guard';

/**
 * Controlled redaction check for "api-calls" attachments, run on demand only:
 *   npm run verify:redaction                         (no token: HTML report written)
 *   API_TOKEN=<fake marker> npm run verify:redaction (token: HTML report skipped)
 * Its tests fail on purpose (marked test.fail(), so the run passes) to produce real
 * attachments, reports and test-results from calls carrying fake secret markers. Those
 * outputs are then scanned for the markers; the expected number of matches is zero.
 * It is not part of test:api or test:all, so it never changes their test counts.
 *
 * The HTML report follows the same rule as the API suite (skipped while API_TOKEN is set),
 * because Playwright's own report steps record request headers unredacted.
 */
apiCallsMode(); // Fail fast on an invalid PW_API_CALLS, as the main configs do.
assertSafeReporterCommandLine(); // Redaction is mandatory here too.

// The same reporter order as the suites: redaction first. A --list run writes no reports.
const reporter: ReporterDescription[] = [
  redactingReporter,
  ['list'],
  ...(!listOnly() && htmlReportEnabled('api')
    ? [['html', { outputFolder: '../../playwright-report-verification', open: 'never' }] satisfies ReporterDescription]
    : []),
  ...(!listOnly() ? [['junit', { outputFile: '../../reports/junit/verification.xml' }] satisfies ReporterDescription] : []),
];

export default defineConfig({
  testDir: '.',
  testMatch: '*.check.ts',
  retries: 0,
  reporter,
  globalSetup: reporterGuardPath,
  outputDir: '../../test-results-verification',
  use: { ...apiDiagnostics },
});
