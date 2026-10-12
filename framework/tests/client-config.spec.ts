import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import { defineClient, type ClientConfig } from '../config/client';
import { resolveApiEnvironment, resolveUiEnvironment, testClient } from './support/test-client';
import { fakeSecret } from './support/fake-secrets';

/** Runs `fn`, which must throw, and returns the error message. */
function errorMessage(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    return (error as Error).message;
  }
  throw new Error('Expected the call to throw');
}

function validClient(): ClientConfig {
  return {
    name: 'sample',
    dir: './clients/sample',
    ui: { defaultBaseURL: 'https://app.example.test/' },
    api: { defaultEnvironment: 'qa', environments: { qa: { baseURL: 'https://api.example.test', readOnly: false } } },
  };
}

test.describe('Client configuration', () => {
  test('A valid client is returned unchanged', () => {
    const client = validClient();
    expect(defineClient(client)).toBe(client);
  });

  test('Invalid client definitions are rejected', () => {
    expect(errorMessage(() => defineClient({ ...validClient(), name: 'Not Valid' }))).toBe(
      'Client name must use only lowercase letters, digits and dashes.',
    );
    expect(errorMessage(() => defineClient({ ...validClient(), dir: '' }))).toBe('Client "sample": dir must be set.');
    expect(errorMessage(() => defineClient({ ...validClient(), api: { defaultEnvironment: 'qa', environments: {} } }))).toBe(
      'Client "sample": api.environments must define at least one environment.',
    );
    expect(
      errorMessage(() => defineClient({ ...validClient(), api: { ...validClient().api, defaultEnvironment: 'prod' } })),
    ).toBe('Client "sample": api.defaultEnvironment must be one of: qa.');
  });

  test('Invalid client URLs are rejected without echoing them', () => {
    // Obviously fake placeholder values; nothing here is a real credential.
    const fake = { user: fakeSecret('user'), pass: fakeSecret('pass') };
    const badUrl = `https://${fake.user}:${fake.pass}@app.example.test/`;
    const uiMessage = errorMessage(() => defineClient({ ...validClient(), ui: { defaultBaseURL: badUrl } }));
    const apiMessage = errorMessage(() =>
      defineClient({ ...validClient(), api: { defaultEnvironment: 'qa', environments: { qa: { baseURL: badUrl, readOnly: false } } } }),
    );

    expect(uiMessage).toBe('Client "sample" ui.defaultBaseURL must not contain a username or password.');
    expect(apiMessage).toBe('Client "sample" api.environments.qa.baseURL must not contain a username or password.');
    for (const message of [uiMessage, apiMessage]) {
      for (const fragment of [badUrl, fake.user, fake.pass]) expect(message).not.toContain(fragment);
    }
  });

  test('Resolvers take their defaults from the client', () => {
    expect(resolveUiEnvironment({})).toEqual({ baseURL: testClient.ui.defaultBaseURL });
    expect(resolveApiEnvironment({})).toEqual({
      name: 'jsonplaceholder',
      baseURL: 'https://api.example.test',
      timeoutMs: 10_000,
      token: undefined,
      readOnly: false,
    });
  });

  test('Framework source holds no client values and never imports a client', () => {
    // Guards the rule that client-specific settings live only in clients/<name>/client.config.ts.
    const frameworkDir = path.resolve(__dirname, '..');
    const sources = readdirSync(frameworkDir, { recursive: true, encoding: 'utf8' })
      .filter((file) => file.endsWith('.ts') && !file.split(path.sep).includes('tests'))
      .map((file) => ({ file, text: readFileSync(path.join(frameworkDir, file), 'utf8') }));

    expect(sources.length).toBeGreaterThan(0);
    for (const { file, text } of sources) {
      expect(text, file).not.toMatch(/demo\.playwright\.dev|jsonplaceholder|todomvc/i);
      expect(text, file).not.toMatch(/from ['"][./]*clients\//);
    }
  });
});
