import { test, expect } from '@playwright/test';
import { reporters } from '../config/diagnostics';
import { fakeSecret } from './support/fake-secrets';

// Pure configuration checks: each test passes its own variables, so the real environment is not used.
test.describe('Report configuration', () => {
  // Obviously fake placeholder; nothing here is a real credential.
  const fakeToken = fakeSecret('token');

  const reporterNames = (...args: Parameters<typeof reporters>) => reporters(...args).map(([name]) => name);

  test('Without API_TOKEN every suite writes list, HTML (never auto-opened) and JUnit reports', () => {
    for (const suite of ['ui', 'api', 'all'] as const) {
      expect(reporters(suite, `report-${suite}`, {})).toEqual([
        ['list'],
        ['html', { outputFolder: `report-${suite}`, open: 'never' }],
        ['junit', { outputFile: `reports/junit/${suite}.xml` }],
      ]);
    }
  });

  test('With API_TOKEN, suites that send it skip the HTML report but keep list and JUnit', () => {
    const env = { API_TOKEN: fakeToken };

    expect(reporterNames('api', 'playwright-report-api', env)).toEqual(['list', 'junit']);
    expect(reporterNames('all', 'playwright-report-all', env)).toEqual(['list', 'junit']);
    // The UI suite never sends API_TOKEN, so its CI report at playwright-report/ is unaffected.
    expect(reporters('ui', 'playwright-report', env)).toContainEqual(['html', { outputFolder: 'playwright-report', open: 'never' }]);
  });

  test('PW_HTML_REPORT=always forces the HTML report, still without auto-opening it', () => {
    const env = { API_TOKEN: fakeToken, PW_HTML_REPORT: 'always' };

    expect(reporters('api', 'playwright-report-api', env)).toContainEqual([
      'html',
      { outputFolder: 'playwright-report-api', open: 'never' },
    ]);
  });

  test('Reporter options never contain the API token', () => {
    for (const suite of ['ui', 'api', 'all'] as const) {
      for (const mode of ['auto', 'always']) {
        const serialized = JSON.stringify(reporters(suite, 'out', { API_TOKEN: fakeToken, PW_HTML_REPORT: mode }));
        expect(serialized).not.toContain(fakeToken);
      }
    }
  });
});
