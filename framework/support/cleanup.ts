import type { APIRequestContext } from '@playwright/test';

interface CleanupStep {
  label: string;
  fn: () => Promise<unknown> | unknown;
}

/**
 * Collects undo steps for test data a test creates, and runs them after the test.
 * Steps run newest first (children before parents). Every step runs even if an earlier
 * one fails; failures are reported together as one error naming each step by its label.
 * Labels and statuses go into errors, never request headers, so tokens stay out of reports.
 */
export class CleanupRegistry {
  private steps: CleanupStep[] = [];

  constructor(private readonly api?: APIRequestContext) {}

  /** Registers an undo step. `label` names it in errors, e.g. "delete post 101". */
  add(label: string, fn: () => Promise<unknown> | unknown): void {
    this.steps.push({ label, fn });
  }

  /** Registers a DELETE of `path`. A 2xx or 404 (already gone) counts as cleaned up. */
  delete(path: string): void {
    const api = this.api;
    if (!api) throw new Error('cleanup.delete() needs an API request context.');
    this.add(`DELETE ${path}`, async () => {
      const response = await api.delete(path);
      if (!response.ok() && response.status() !== 404) {
        throw new Error(`responded ${response.status()} ${response.statusText()}`);
      }
    });
  }

  /** Runs and clears all registered steps. Calling it again runs only steps added since. */
  async run(): Promise<void> {
    const steps = this.steps.reverse();
    this.steps = [];

    const failures: string[] = [];
    for (const { label, fn } of steps) {
      try {
        await fn();
      } catch (error) {
        failures.push(`  - ${label}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    if (failures.length > 0) {
      throw new Error(`Test data cleanup failed for ${failures.length} of ${steps.length} step(s):\n${failures.join('\n')}`);
    }
  }
}
