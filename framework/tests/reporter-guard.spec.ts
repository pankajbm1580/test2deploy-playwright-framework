import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test, expect, type FullConfig } from '@playwright/test';
import { listOnly, redactingReporterPath, reporters } from '../config/diagnostics';
import reporterGuard, {
  LIST_REPORTERS_REFUSED,
  REPORTER_OVERRIDE_REFUSED,
  assertSafeReporterCommandLine,
  cliReporterOption,
  configuredReporterProblem,
  listRunProblem,
  reporterOverrideProblem,
} from '../config/reporter-guard';

const repoRoot = path.resolve(__dirname, '../..');
const argv = (...args: string[]) => ['node', 'playwright', 'test', ...args];

test.describe('Mandatory redaction: reporter overrides', () => {
  test('A --reporter override that drops or demotes the redacting reporter is refused', () => {
    for (const args of [
      ['--reporter=dot'],
      ['--reporter', 'html'],
      ['--reporter=list,html,junit'],
      ['--reporter=html,./framework/reporters/redacting-reporter.ts'],
      ['--reporter=./framework/reporters/redacting-reporter.ts', '--reporter=html'],
      ['--reporter=./framework/reporters/other-reporter.ts'],
    ]) {
      expect(reporterOverrideProblem(argv(...args), repoRoot), args.join(' ')).toBe(REPORTER_OVERRIDE_REFUSED);
    }
  });

  test('Runs that keep the redacting reporter first are allowed', () => {
    for (const args of [
      [],
      ['--add-reporter=dot'],
      ['--reporter='],
      ['--reporter=./framework/reporters/redacting-reporter.ts,dot'],
      ['--reporter', `${redactingReporterPath},html`],
      ['--', '--reporter=dot'],
    ]) {
      expect(reporterOverrideProblem(argv(...args), repoRoot), args.join(' ') || '(no arguments)').toBeUndefined();
    }
    expect(cliReporterOption(argv('--reporter=dot', '--reporter', 'list'))).toBe('list');
  });

  test('The refusal never echoes the reporter value', () => {
    const value = './framework/reporters/unknown-reporter-name.ts';
    expect(reporterOverrideProblem(argv(`--reporter=${value}`), repoRoot)).not.toContain('unknown-reporter-name');
  });

  test('The global setup backstop refuses resolved reporters that do not start with the redacting reporter', () => {
    const run = (reporter: FullConfig['reporter']) => () => reporterGuard({ reporter } as FullConfig);

    for (const reporter of [[], [['dot', undefined]], [['list', undefined], [redactingReporterPath, undefined]]] as FullConfig['reporter'][]) {
      expect(run(reporter), JSON.stringify(reporter)).toThrow(REPORTER_OVERRIDE_REFUSED);
    }
    expect(run([[redactingReporterPath, undefined], ['html', { outputFolder: 'x', open: 'never' }]])).not.toThrow();
    expect(configuredReporterProblem([[redactingReporterPath, undefined]])).toBeUndefined();
  });

  test('A --list run gets the list reporter only, so it never replaces existing reports', () => {
    expect(listOnly(argv('--list'))).toBe(true);
    expect(listOnly(argv())).toBe(false);
    for (const suite of ['ui', 'api', 'all'] as const) {
      expect(reporters(suite, `report-${suite}`, {}, argv('--list'))).toEqual([['list']]);
      expect(reporters(suite, `report-${suite}`, {}, argv()).map(([name]) => name)).toEqual(['list', 'html', 'junit']);
    }
    // After "--", arguments are file filters: a test file named "--list" does not make it a list run.
    expect(listOnly(argv('--', '--list'))).toBe(false);
  });

  test('A --list run may only add terminal reporters, so it never replaces existing reports', () => {
    const redacting = './framework/reporters/redacting-reporter.ts';
    for (const [args, env] of [
      [['--list', '--add-reporter=html'], {}],
      [['--list', '--add-reporter', 'junit'], {}],
      [['--list', '--add-reporter=dot,blob'], {}],
      [['--list', '--add-reporter=./framework/reporters/custom-reporter.ts'], {}],
      [['--list', `--reporter=${redacting},html`], {}],
      [['--list', `--reporter=${redacting},json`], {}],
      [['--list'], { PW_TEST_REPORTER: 'html' }],
    ] as [string[], NodeJS.ProcessEnv][]) {
      const label = `${args.join(' ')} ${JSON.stringify(env)}`;
      expect(listRunProblem(argv(...args), env, repoRoot), label).toBe(LIST_REPORTERS_REFUSED);
      expect(LIST_REPORTERS_REFUSED, label).not.toContain('custom-reporter');
    }

    for (const [args, env] of [
      [['--list'], {}],
      [['--list', '--add-reporter=dot'], {}],
      [['--list', `--reporter=${redacting},line`], {}],
      [['--list'], { PW_TEST_REPORTER: 'null' }],
      // Not list runs: added reporters run after redaction and write full, redacted reports.
      [['--add-reporter=html'], {}],
      [['--', '--list', '--add-reporter=html'], {}],
    ] as [string[], NodeJS.ProcessEnv][]) {
      expect(listRunProblem(argv(...args), env, repoRoot), `${args.join(' ')} ${JSON.stringify(env)}`).toBeUndefined();
    }
  });

  test('The configs refuse both unsafe command lines before any reporter starts', () => {
    expect(() => assertSafeReporterCommandLine(argv('--reporter=html'), {})).toThrow(REPORTER_OVERRIDE_REFUSED);
    expect(() => assertSafeReporterCommandLine(argv('--list', '--add-reporter=html'), {})).toThrow(LIST_REPORTERS_REFUSED);
    expect(() => assertSafeReporterCommandLine(argv('--list', '--add-reporter=dot'), {})).not.toThrow();
  });
});

/**
 * Real Playwright runs of the real createConfig, in a temporary folder: the reports and
 * results it writes resolve against that folder, never the suite's own report folders.
 */
test.describe('Mandatory redaction: Playwright runs', () => {
  test.describe.configure({ timeout: 120_000 });

  const reportFile = 'playwright-report-api/index.html';
  const junitFile = 'reports/junit/api.xml';

  function setUp(dir: string): void {
    const posix = (file: string) => JSON.stringify(file.split(path.sep).join('/'));
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'playwright.config.ts'),
      [
        `import { createConfig } from ${posix(path.join(repoRoot, 'framework/config/create-config'))};`,
        `import { testClient } from ${posix(path.join(repoRoot, 'framework/tests/support/test-client'))};`,
        `export default { ...createConfig({ suite: 'api', client: testClient }), projects: [{ name: 'nested', testDir: '.' }] };`,
      ].join('\n'),
    );
    fs.writeFileSync(
      path.join(dir, 'nested.spec.ts'),
      `import { test, expect } from '@playwright/test';\ntest('nested test runs', () => { expect(1).toBe(1); });\n`,
    );
  }

  function runPlaywright(dir: string, ...args: string[]): { status: number | null; output: string } {
    return runPlaywrightWithEnv(dir, {}, ...args);
  }

  function runPlaywrightWithEnv(dir: string, extraEnv: NodeJS.ProcessEnv, ...args: string[]): { status: number | null; output: string } {
    // A clean environment: no worker variables from this run, no API or report settings.
    const env = Object.fromEntries(
      Object.entries(process.env).filter(([name]) => !/^(TEST_|PW_|PWTEST|PLAYWRIGHT_|API_|UI_|ALLOW_PRODUCTION$|FORCE_COLOR$)/.test(name)),
    );
    const cli = path.join(repoRoot, 'node_modules/@playwright/test/cli.js');
    const result = spawnSync(process.execPath, [cli, 'test', '-c', 'playwright.config.ts', ...args], {
      cwd: dir,
      env: { ...env, ...extraEnv, NO_COLOR: '1' },
      encoding: 'utf8',
      timeout: 100_000,
    });
    return { status: result.status, output: `${result.stdout}\n${result.stderr}` };
  }

  test('Replacing the reporters on the command line is refused before any test runs or report is written', async ({}, testInfo) => {
    const dir = testInfo.outputPath('override');
    setUp(dir);

    for (const args of [['--reporter=dot'], ['--reporter', 'html'], ['--reporter=junit,list']]) {
      const { status, output } = runPlaywright(dir, ...args);
      expect(status, args.join(' ')).not.toBe(0);
      expect(output).toContain(REPORTER_OVERRIDE_REFUSED);
      expect(output).not.toContain('1 passed');
    }
    for (const written of ['playwright-report', 'playwright-report-api', 'reports', 'test-results-api']) {
      expect(fs.existsSync(path.join(dir, written)), written).toBe(false);
    }
  });

  test('Reporters added after redaction run normally and still write the reports', async ({}, testInfo) => {
    const dir = testInfo.outputPath('allowed');
    setUp(dir);

    for (const args of [['--add-reporter=dot'], [`--reporter=${redactingReporterPath},dot`]]) {
      const { status, output } = runPlaywright(dir, ...args);
      expect(status, `${args.join(' ')}\n${output}`).toBe(0);
      expect(output).toContain('1 passed');
    }
    // The last run replaced the reporters with redaction + dot, so only the first wrote reports.
    expect(fs.existsSync(path.join(dir, reportFile))).toBe(true);
    expect(fs.existsSync(path.join(dir, junitFile))).toBe(true);
  });

  test('A --list run lists the tests and leaves existing reports untouched', async ({}, testInfo) => {
    const dir = testInfo.outputPath('list');
    setUp(dir);
    for (const file of [reportFile, junitFile]) {
      fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
      fs.writeFileSync(path.join(dir, file), `existing ${file}`);
    }

    const { status, output } = runPlaywright(dir, '--list');

    expect(status, output).toBe(0);
    expect(output).toContain('nested test runs');
    for (const file of [reportFile, junitFile]) {
      expect(fs.readFileSync(path.join(dir, file), 'utf8'), file).toBe(`existing ${file}`);
    }
  });

  test('A --list run that adds a report-writing reporter is refused and leaves existing reports untouched', async ({}, testInfo) => {
    const dir = testInfo.outputPath('list-added');
    setUp(dir);
    // playwright-report/ is where an added html reporter writes by default (the UI suite's folder).
    const existing = ['playwright-report/index.html', reportFile, junitFile];
    for (const file of existing) {
      fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
      fs.writeFileSync(path.join(dir, file), `existing ${file}`);
    }

    for (const [env, args] of [
      [{}, ['--list', '--add-reporter=html']],
      [{}, ['--list', `--reporter=${redactingReporterPath},html`]],
      [{}, ['--list', '--add-reporter=junit']],
      [{ PW_TEST_REPORTER: 'html' }, ['--list']],
    ] as [NodeJS.ProcessEnv, string[]][]) {
      const { status, output } = runPlaywrightWithEnv(dir, env, ...args);
      const label = `${args.join(' ')} ${JSON.stringify(env)}`;
      expect(status, label).not.toBe(0);
      expect(output, label).toContain(LIST_REPORTERS_REFUSED);
      expect(output, label).not.toContain('nested test runs');
      for (const file of existing) {
        expect(fs.readFileSync(path.join(dir, file), 'utf8'), `${label}: ${file}`).toBe(`existing ${file}`);
      }
    }
  });
});
