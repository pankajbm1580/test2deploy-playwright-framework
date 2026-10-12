import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import { createConfig } from '../config/create-config';
import { defineClient, type ClientConfig } from '../config/client';
import { loginStatePath, resolveLoginCredentials } from '../support/login';
import { testClient } from './support/test-client';
import { fakeSecret } from './support/fake-secrets';
import { repoImport, repoRoot, runPlaywright, writtenTexts } from './support/nested-playwright';

const loginClient: ClientConfig = { ...testClient, name: 'login-test', ui: { ...testClient.ui, login: { setupFile: 'auth.setup.ts' } } };
const projectsOf = (client: ClientConfig) => createConfig({ suite: 'ui', client }).projects ?? [];

test.describe('Login setup configuration', () => {
  test('Credentials come only from UI_USERNAME and UI_PASSWORD; missing ones are named, never shown', () => {
    const username = fakeSecret('username');
    const password = fakeSecret('password');
    expect(resolveLoginCredentials({ UI_USERNAME: username, UI_PASSWORD: password })).toEqual({ username, password });

    expect(() => resolveLoginCredentials({})).toThrow(/^Login setup needs UI_USERNAME and UI_PASSWORD\./);
    let message = '';
    try {
      resolveLoginCredentials({ UI_USERNAME: username });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toMatch(/^Login setup needs UI_PASSWORD\./);
    expect(message).not.toContain(username);
  });

  test('Clients without login keep their browser projects unchanged', () => {
    const projects = projectsOf(testClient);

    expect(projects.map((project) => project.name)).toEqual(['chromium', 'firefox', 'webkit']);
    for (const project of projects) {
      expect(project.dependencies, project.name).toBeUndefined();
      expect(project.use?.storageState, project.name).toBeUndefined();
      expect(project.use?.trace, project.name).toBe('retain-on-failure');
    }
  });

  test('A client with login gets a setup project, and browser projects that start signed in', () => {
    const [setup, ...browsers] = projectsOf(loginClient);

    expect(setup.name).toBe('setup');
    expect(setup.testMatch).toBeInstanceOf(RegExp);
    expect((setup.testMatch as RegExp).test(path.join('clients', 'x', 'ui', 'auth.setup.ts'))).toBe(true);
    expect((setup.testMatch as RegExp).test(path.join('clients', 'x', 'ui', 'other-auth.setup.ts'))).toBe(false);
    // It types the password: no trace, screenshot or video.
    expect(setup.use).toMatchObject({ trace: 'off', screenshot: 'off', video: 'off' });

    expect(browsers.map((project) => project.name)).toEqual(['chromium', 'firefox', 'webkit']);
    for (const project of browsers) {
      expect(project.dependencies, project.name).toEqual(['setup']);
      expect(project.use?.storageState, project.name).toBe(loginStatePath(loginClient));
      expect(project.use?.trace, project.name).toBe('off');
    }
  });

  test('The saved login state is git-ignored, and setup files must be plain .setup.ts names', () => {
    const file = path.relative(repoRoot, loginStatePath(loginClient));
    expect(file.split(path.sep)).toEqual(['playwright', '.auth', 'login-test.json']);
    expect(spawnSync('git', ['check-ignore', '-q', file], { cwd: repoRoot }).status, `${file} is git-ignored`).toBe(0);

    for (const setupFile of ['../auth.setup.ts', 'auth.spec.ts', 'sub/auth.setup.ts', '']) {
      expect(() => defineClient({ ...loginClient, ui: { ...loginClient.ui, login: { setupFile } } }), setupFile).toThrow(
        'ui.login.setupFile must be a file name',
      );
    }
  });
});

/**
 * Real runs against the local login demo app, with fake credential markers, scanning every
 * file the run wrote (results, attachments, JUnit, the HTML report and its embedded data).
 * Terminal output is not scanned: it is not redacted (see .env.example).
 */
test.describe('Login setup runs', () => {
  test.describe.configure({ timeout: 180_000 });

  const credentials = { UI_USERNAME: fakeSecret('ui-username'), UI_PASSWORD: fakeSecret('ui-password') };
  const leaks = (dir: string, skip: (file: string) => boolean = () => false) =>
    writtenTexts(dir, skip)
      .filter(({ text }) => Object.values(credentials).some((value) => text.includes(value)))
      .map(({ file }) => path.relative(dir, file));

  test('The login demo signs in once, reuses the state, and no credential reaches a report', async ({}, testInfo) => {
    const dir = testInfo.outputPath('demo');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'playwright.config.ts'), `export { default } from ${repoImport('playwright.login-demo.config')};\n`);

    const { status, output } = runPlaywright(dir, { ...credentials, LOGIN_DEMO_PORT: '4391' }, '--project=chromium');

    expect(status, output).toBe(0);
    expect(output).toMatch(/ok \d+ \[setup\] .*auth\.setup\.ts.* › Log in and save the signed-in state/);
    expect(output).toContain('3 passed');
    expect(fs.existsSync(path.join(dir, 'playwright-report-login-demo/index.html')), 'HTML report written').toBe(true);
    expect(leaks(dir, (file) => file.endsWith('playwright.config.ts'))).toEqual([]);
    // The typed values were recorded and masked, not dropped.
    expect(writtenTexts(dir).some(({ text }) => text.includes('Fill \\"***\\"'))).toBe(true);
  });

  test('A setup that fails after typing the password keeps both credentials out of every report', async ({}, testInfo) => {
    // The failure snapshot (error-context.md) shows the values typed into form fields.
    const dir = testInfo.outputPath('failing');
    fs.mkdirSync(path.join(dir, 'ui'), { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'playwright.config.ts'),
      [
        `import path from 'node:path';`,
        `import { createConfig } from ${repoImport('framework/config/create-config')};`,
        `import { defineClient } from ${repoImport('framework/config/client')};`,
        `const client = defineClient({ name: 'login-failure-test', dir: path.join(__dirname), ui: { defaultBaseURL: 'http://127.0.0.1:4392/', login: { setupFile: 'auth.setup.ts' } }, api: { defaultEnvironment: 'none', environments: { none: { readOnly: true } } } });`,
        `export default { ...createConfig({ suite: 'ui', client, outputName: 'login-failure' }), webServer: { command: 'node ' + JSON.stringify(${repoImport('clients/login-demo/app/server.mjs')}), url: 'http://127.0.0.1:4392/login', env: { LOGIN_DEMO_PORT: '4392', LOGIN_DEMO_USER: 'other-user', LOGIN_DEMO_PASSWORD: 'other-password' } } };`,
      ].join('\n'),
    );
    fs.writeFileSync(
      path.join(dir, 'ui', 'auth.setup.ts'),
      [
        `import { test as setup, expect } from '@playwright/test';`,
        `import { resolveLoginCredentials } from ${repoImport('framework/support/login')};`,
        `setup('Login setup that fails after typing the password', async ({ page }) => {`,
        `  const { username, password } = resolveLoginCredentials();`,
        `  await page.goto('./login');`,
        `  await page.getByLabel('Username').fill(username);`,
        `  await page.getByLabel('Password').fill(password);`,
        `  await expect(page.getByRole('heading', { name: 'Account' })).toBeVisible({ timeout: 1000 });`,
        `});`,
      ].join('\n'),
    );

    const { status, output } = runPlaywright(dir, credentials, '--project=chromium');

    expect(status, output).not.toBe(0);
    expect(output).toContain('1 failed');
    const snapshots = writtenTexts(dir).filter(({ file }) => file.endsWith('error-context.md'));
    expect(snapshots.length, 'a failure snapshot was written').toBeGreaterThan(0);
    for (const { text } of snapshots) expect(text).toContain('textbox "Password": ***');
    expect(leaks(dir, (file) => /playwright\.config\.ts$|auth\.setup\.ts$/.test(file))).toEqual([]);
  });
});
