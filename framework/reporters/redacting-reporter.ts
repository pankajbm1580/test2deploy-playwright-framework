import fs from 'node:fs';
import path from 'node:path';
import type { FullConfig, Reporter, TestCase, TestError, TestResult, TestStep } from '@playwright/test/reporter';
import { redactReportText } from '../support/sanitize';

type Writable<T> = { -readonly [K in keyof T]: T[K] };
type StepWithSubtitle = Writable<TestStep> & { subtitle?: string };

// Text attachments, which can be redacted in place.
const TEXT_ATTACHMENT = /^(?:text\/|application\/(?:json|xml|x-www-form-urlencoded)\b|application\/[\w.+-]*\+json\b)/i;

/**
 * Redacts what Playwright itself records before any other reporter sees it. Playwright
 * stores a step's error (with its call log: request headers, including cookies the request
 * context sent on its own) when the step fails, before test code or the framework can catch
 * it, and the HTML and JUnit reporters write those errors out. Listed first in the reporter
 * list (createConfig), this reporter masks secrets, cookies and sensitive headers, query
 * parameters and fields in errors, step titles, stdout/stderr and text attachments in place.
 * Every reporter receives the same result objects in list order, and the HTML report is
 * built from them at the end of the run, so later reporters only ever see redacted text.
 *
 * Text attachments stored as files are redacted in place too, but only inside the run's own
 * output folders (test-results-*), which Playwright creates and cleans for each run: for example
 * the error-context.md page snapshot, which shows the values typed into form fields (a login
 * setup's password included). Files elsewhere, and binary files (screenshots, traces, videos),
 * are not rewritten. The framework's own api-calls.json is redacted before it is written.
 *
 * Live terminal output is NOT redacted. Terminal reporters print progress, errors and test
 * stdout/stderr as it happens (onStdOut, onStepBegin, ...), and Playwright adds its own terminal
 * reporter ahead of this one when no configured reporter prints. Only what reports store is
 * redacted. framework/config/reporter-guard.ts refuses runs where this reporter is not first.
 */
export default class RedactingReporter implements Reporter {
  // The API token and the login credentials (framework/support/login.ts) are masked wherever they
  // appear, e.g. in the "Fill" step a login setup records when it types the password.
  private readonly secrets = [process.env.API_TOKEN, process.env.UI_PASSWORD, process.env.UI_USERNAME].filter(
    (secret): secret is string => !!secret,
  );

  private outputDirs: string[] = [];

  printsToStdio(): boolean {
    return false;
  }

  onBegin(config: FullConfig): void {
    this.outputDirs = [...new Set(config.projects.map((project) => path.resolve(project.outputDir)))];
  }

  onStepEnd(_test: TestCase, _result: TestResult, step: TestStep): void {
    this.redactStep(step, false);
  }

  onTestEnd(_test: TestCase, result: TestResult): void {
    const writable = result as Writable<TestResult>;
    for (const error of result.errors) this.redactError(error);
    if (result.error && !result.errors.includes(result.error)) this.redactError(result.error);
    for (const step of result.steps) this.redactStep(step, true);
    writable.stdout = result.stdout.map((chunk) => this.redactChunk(chunk));
    writable.stderr = result.stderr.map((chunk) => this.redactChunk(chunk));
    for (const attachment of result.attachments) {
      if (!TEXT_ATTACHMENT.test(attachment.contentType)) continue;
      if (attachment.body) {
        (attachment as Writable<typeof attachment>).body = Buffer.from(this.text(attachment.body.toString('utf8')), 'utf8');
      } else if (attachment.path && this.inOutputDir(attachment.path)) {
        this.redactFile(attachment.path);
      }
    }
  }

  onError(error: TestError): void {
    this.redactError(error);
  }

  private inOutputDir(file: string): boolean {
    return this.outputDirs.some((dir) => {
      const relative = path.relative(dir, path.resolve(file));
      return !!relative && !relative.startsWith('..') && !path.isAbsolute(relative);
    });
  }

  private redactFile(file: string): void {
    let original: string;
    try {
      original = fs.readFileSync(file, 'utf8');
    } catch {
      return; // Missing or unreadable: there is nothing for a later reporter to copy either.
    }
    const redacted = this.text(original);
    if (redacted !== original) fs.writeFileSync(file, redacted, 'utf8');
  }

  private text(value: string): string {
    return redactReportText(value, this.secrets);
  }

  private redactChunk(chunk: string | Buffer): string | Buffer {
    return typeof chunk === 'string' ? this.text(chunk) : Buffer.from(this.text(chunk.toString('utf8')), 'utf8');
  }

  private redactError(error: TestError): void {
    const writable = error as Writable<TestError>;
    if (error.message !== undefined) writable.message = this.text(error.message);
    if (error.stack !== undefined) writable.stack = this.text(error.stack);
    if (error.value !== undefined) writable.value = this.text(error.value);
    if (error.snippet !== undefined) writable.snippet = this.text(error.snippet);
    if (error.cause) this.redactError(error.cause);
  }

  private redactStep(step: TestStep, recursive: boolean): void {
    const writable = step as StepWithSubtitle;
    writable.title = this.text(step.title);
    if (typeof writable.subtitle === 'string') writable.subtitle = this.text(writable.subtitle);
    if (step.error) this.redactError(step.error);
    if (recursive) for (const child of step.steps) this.redactStep(child, true);
  }
}
