import path from 'node:path';
import type { FullConfig } from '@playwright/test';
import { listOnly, redactingReporterPath } from './diagnostics';

/**
 * Redaction is mandatory: the redacting reporter must run first, before any reporter that
 * writes errors, steps or output. `--reporter` on the command line replaces the configured
 * reporters, so a run that drops it (or lists another reporter before it) is refused.
 * `--add-reporter` and PW_TEST_REPORTER add reporters after the configured ones and are allowed.
 *
 * Two checks: the config refuses a --reporter override before any reporter starts
 * (reporterOverrideProblem), and this module, used as globalSetup, checks the reporters the run
 * actually resolved (configuredReporterProblem) as a backstop.
 *
 * A --list run still runs every reporter, so one that writes files would replace existing
 * reports with empty ones. The configs drop their own HTML and JUnit reporters in list mode, and
 * listRunProblem refuses reporters added for the run. List mode skips globalSetup, so that check
 * runs only when the config loads.
 */

export const REPORTER_OVERRIDE_REFUSED =
  'Refusing to run: the redacting reporter must be the first reporter, or reports could contain secrets and cookies. ' +
  'To add a reporter, use --add-reporter=<name>; to replace them, list it first: ' +
  '--reporter=./framework/reporters/redacting-reporter.ts,<name>.';

const normalize = (file: string) => (process.platform === 'win32' ? path.resolve(file).toLowerCase() : path.resolve(file));

/** Whether a reporter name or path (resolved like Playwright resolves --reporter) is the redacting reporter. */
export function isRedactingReporter(id: string, cwd: string = process.cwd()): boolean {
  return normalize(path.resolve(cwd, id)) === normalize(redactingReporterPath);
}

export const LIST_REPORTERS_REFUSED =
  'Refusing to list tests: a --list run may only use terminal reporters (dot, line, list, null), ' +
  'so it never replaces existing reports with empty ones. Remove reporters that write files from ' +
  '--reporter, --add-reporter and PW_TEST_REPORTER.';

// Built-in reporters that only print to the terminal: the only ones a --list run may use.
const TERMINAL_REPORTERS: readonly string[] = ['dot', 'line', 'list', 'null'];

/** The value of a reporter option (--reporter by default) on a command line; the last one wins, as in Playwright. */
export function cliReporterOption(argv: readonly string[], option: '--reporter' | '--add-reporter' = '--reporter'): string | undefined {
  let value: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--') break;
    if (arg === option) value = argv[++i] ?? '';
    else if (arg.startsWith(`${option}=`)) value = arg.slice(option.length + 1);
  }
  return value;
}

/** A problem with the command line's --reporter override, or undefined. Never echoes the value. */
export function reporterOverrideProblem(argv: readonly string[] = process.argv, cwd: string = process.cwd()): string | undefined {
  const value = cliReporterOption(argv);
  // An empty value is ignored by Playwright, which then keeps the configured reporters.
  if (!value) return undefined;
  return isRedactingReporter(value.split(',')[0].trim(), cwd) ? undefined : REPORTER_OVERRIDE_REFUSED;
}

/** A problem with the reporters a --list run would add, or undefined. Never echoes the values. */
export function listRunProblem(
  argv: readonly string[] = process.argv,
  env: NodeJS.ProcessEnv = process.env,
  cwd: string = process.cwd(),
): string | undefined {
  if (!listOnly(argv)) return undefined;
  const fromCli = [cliReporterOption(argv, '--reporter'), cliReporterOption(argv, '--add-reporter')].flatMap((value) =>
    value ? value.split(',') : [],
  );
  // Playwright reads PW_TEST_REPORTER as a single reporter name.
  const names = [...fromCli, ...(env.PW_TEST_REPORTER ? [env.PW_TEST_REPORTER] : [])].map((name) => name.trim()).filter(Boolean);
  return names.every((name) => TERMINAL_REPORTERS.includes(name) || isRedactingReporter(name, cwd)) ? undefined : LIST_REPORTERS_REFUSED;
}

/** For the configs: throws, before any reporter starts, if the command line would bypass redaction or overwrite reports. */
export function assertSafeReporterCommandLine(argv: readonly string[] = process.argv, env: NodeJS.ProcessEnv = process.env): void {
  const problem = reporterOverrideProblem(argv) ?? listRunProblem(argv, env);
  if (problem) throw new Error(problem);
}

/** A problem with the reporters a run resolved, or undefined. */
export function configuredReporterProblem(reporters: FullConfig['reporter']): string | undefined {
  const first = reporters[0]?.[0];
  return first && isRedactingReporter(first) ? undefined : REPORTER_OVERRIDE_REFUSED;
}

/** globalSetup: refuses the run if its reporters would write unredacted results. */
export default function reporterGuard(config: FullConfig): void {
  const problem = configuredReporterProblem(config.reporter);
  if (problem) throw new Error(problem);
}

export const reporterGuardPath = path.join(__dirname, 'reporter-guard.ts');
