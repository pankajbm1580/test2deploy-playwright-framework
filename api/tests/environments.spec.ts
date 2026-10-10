import { test, expect } from '@playwright/test';
import { resolveApiEnvironment } from '../config/environments';

// Pure configuration checks: each test passes its own variables, so the real environment is not used.
test.describe('API environment configuration', () => {
  test('Defaults to JSONPlaceholder when no variables are set', () => {
    expect(resolveApiEnvironment({})).toEqual({
      name: 'jsonplaceholder',
      baseURL: 'https://jsonplaceholder.typicode.com',
      timeoutMs: 10_000,
      token: undefined,
      readOnly: false,
    });
  });

  test('Variables override the preset for a client environment', () => {
    const env = resolveApiEnvironment({
      API_ENV: 'staging',
      API_BASE_URL: 'https://staging.example.test/api',
      API_TIMEOUT_MS: '5000',
      API_TOKEN: 'dummy-token',
    });

    expect(env).toEqual({
      name: 'staging',
      baseURL: 'https://staging.example.test/api',
      timeoutMs: 5000,
      token: 'dummy-token',
      readOnly: true,
    });
  });

  test('Fails fast on missing or invalid configuration', () => {
    expect(() => resolveApiEnvironment({ API_ENV: 'qa' })).toThrow(/API_BASE_URL must be set/);
    expect(() => resolveApiEnvironment({ API_ENV: 'prod' })).toThrow(/Unknown API_ENV "prod"/);
    expect(() => resolveApiEnvironment({ API_BASE_URL: 'not a url' })).toThrow(/not a valid URL/);
    expect(() => resolveApiEnvironment({ API_TIMEOUT_MS: '-1' })).toThrow(/positive integer/);
    expect(() => resolveApiEnvironment({ API_READ_ONLY: 'yes' })).toThrow(/"true" or "false"/);
  });
});
