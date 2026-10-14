# Test2Deploy login demo: presenter guide

This guide shows how the Test2Deploy Playwright framework handles applications that need a login. It covers:

- **Log in once.** One setup step signs in and saves the browser session.
- **Reuse the session.** Every test starts already signed in, with no login code in the tests.
- **Cross-browser.** The same tests run in Chromium, Firefox and WebKit (Safari's engine).
- **Report.** One HTML report covers the whole run, and credentials never appear in it.

The demo runs against a small local application (`clients/login-demo/app/server.mjs`), so it needs
no network access, test account or configuration.

## 1. Run the demo

Run these from the repository root. You need Node.js and the Playwright browsers
(`npx playwright install` once per machine).

```
npm run test:login-demo
```

Expected result: **7 passed**, about 30 seconds.

| Project | Test | What it proves |
| --- | --- | --- |
| `setup` | Log in and save the signed-in state | Logs in once through the real login form |
| `chromium`, `firefox`, `webkit` | Opens the account page without logging in again | The saved session is reused in each browser |
| `chromium`, `firefox`, `webkit` | The account page redirects to the login page | A test without the session is really signed out, so the session is what grants access |

Open the report:

```
npx playwright show-report playwright-report-login-demo
```

Optional, to let the audience watch the browser (Chromium only):

```
npm run test:login-demo -- --project=chromium --headed
```

The setup step always runs first, even when you choose a single browser, because every browser
project depends on it.

Where the run writes its output:

| Output | Location |
| --- | --- |
| HTML report | `playwright-report-login-demo/` |
| Failure details (screenshots, error context) | `test-results-login-demo/` |
| JUnit XML for CI dashboards | `reports/junit/login-demo.xml` |
| Saved session (sensitive) | `playwright/.auth/login-demo.json` |

All four locations are git-ignored.

## 2. How it works

```
setup project ──► logs in with UI_USERNAME / UI_PASSWORD
      │            saves cookies to playwright/.auth/login-demo.json
      ▼
chromium ┐
firefox  ├──► each test starts with the saved cookies, already signed in
webkit   ┘
```

| Piece | File |
| --- | --- |
| Turns login on for a client: `ui.login: { setupFile: 'auth.setup.ts' }` | `clients/login-demo/client.config.ts` |
| Login steps (the only application-specific code) | `clients/login-demo/ui/auth.setup.ts` |
| Signed-in tests, with no login code | `clients/login-demo/ui/tests/account.spec.ts` |
| Credential loading, session file path, saving | `framework/support/login.ts` |
| Setup project, browser dependencies, saved session | `framework/config/create-config.ts` |
| Demo-only: starts the local app, generates one-off credentials | `playwright.login-demo.config.ts` |

Clients that don't enable `ui.login` keep the normal browser projects, unchanged.

**Credentials in the demo.** If `UI_USERNAME` and `UI_PASSWORD` aren't set, the demo config
generates random one-off credentials for each run and gives them to the demo application. No
credential is stored anywhere in the repository.

## 3. What to show in the report

Open the report with `npx playwright show-report playwright-report-login-demo`, then:

1. **Overview.** All 7 tests passed, each tagged with its project: `setup`, `chromium`, `firefox` or `webkit`.
   Filter by project with the tags.
2. **The setup test.** Open "Log in and save the signed-in state" and expand its steps. The
   username and password fields show as `Fill "***"`: the steps are recorded, but the values are
   masked.
3. **A browser test.** Open "Opens the account page without logging in again" in any browser. It
   has no login steps; it goes straight to `/account`.
4. **The negative test.** "The account page redirects to the login page" clears the session and
   lands on the login page. This shows that access depends on the saved session.

On failure, a test keeps a screenshot and an error-context file. Traces are off for login runs,
because a trace would contain the typed password and the session cookies.

## 4. Demonstration scenario (about 10 minutes)

> **Context for the audience.** "Your application has a login page. Most test suites log in again
> in every test, which is slow, and they often keep the password in the test code. We'll show a
> suite that logs in once, runs the same tests in three browsers, and never exposes the
> credentials."

1. **Show how little login code there is (2 min).** Open `clients/login-demo/ui/auth.setup.ts`.
   The whole login is five lines. The `APP-SPECIFIC` comments mark the only lines that change for
   their application. Then open `ui/tests/account.spec.ts`: the tests contain no login code.
2. **Run it (1 min).** Run `npm run test:login-demo`. Point out that `[setup]` runs once, and the
   Chromium, Firefox and WebKit tests follow, passing 7 of 7.
3. **Walk through the report (3 min).** Use the steps in section 3, and stop on `Fill "***"`:
   "Your test password never reaches a report you attach to a ticket or a CI job."
4. **Show a rejected login (2 min, optional).** Make the application expect a different password
   than the one the tests send. In PowerShell:

   ```powershell
   $env:UI_USERNAME='demo-user'; $env:UI_PASSWORD='Wrong-Pass-123'
   $env:LOGIN_DEMO_USER='demo-user'; $env:LOGIN_DEMO_PASSWORD='Right-Pass-456'
   npx playwright test -c playwright.login-demo.config.ts --project=chromium
   ```

   Expected result: `1 failed` (setup, with the message "The login was not accepted") and `2 did
   not run`. The suite stops at the login instead of producing a page of confusing failures. The
   failure output doesn't show the password. Afterwards, close that terminal, or clear the
   variables with `Remove-Item Env:UI_USERNAME, Env:UI_PASSWORD, Env:LOGIN_DEMO_USER,
   Env:LOGIN_DEMO_PASSWORD`, then run `npm run test:login-demo` again so the passing report is the
   last one.
5. **Close with how to adapt it (2 min).** Use section 5: three things to configure, and the
   framework handles the rest.

## 5. Adapting the demo to a real client application

Three things are specific to each application. Everything else (the setup project, browser
dependencies, session reuse, masking, report folders) comes from the framework.

| What | Where | Demo value | Real application |
| --- | --- | --- | --- |
| **Base URL** | `UI_BASE_URL` env variable, or `ui.defaultBaseURL` in `clients/<name>/client.config.ts` | `http://127.0.0.1:4321/` | The test environment URL, such as `https://staging.example.com/` |
| **Login URL** | `page.goto(...)` in `clients/<name>/ui/auth.setup.ts` | `./login` | The login path relative to the base URL, such as `./signin` or `./auth/login` |
| **Selectors** | `clients/<name>/ui/auth.setup.ts` | `getByLabel('Username')`, `getByLabel('Password')`, `getByRole('button', { name: 'Sign in' })` | The application's own field labels and button text. Prefer labels and roles over CSS classes. |
| **Signed-in check** | `clients/<name>/ui/auth.setup.ts` | `getByRole('heading', { name: 'Account' })` | Something only a signed-in user sees, such as a user menu or dashboard heading. It must fail when the login is rejected. |
| **Credentials** | `UI_USERNAME`, `UI_PASSWORD` env variables | Generated per run | A dedicated test account from CI secrets or a local `.env`. Never in code. |

Steps:

1. **Client config.** Create `clients/<name>/client.config.ts` with `defineClient`. Set
   `ui.defaultBaseURL` and `ui.login: { setupFile: 'auth.setup.ts' }`, and list production hosts
   in `productionHosts` so the production guard applies.
2. **Login steps.** Copy `clients/login-demo/ui/auth.setup.ts` to `clients/<name>/ui/auth.setup.ts`.
   Change the `APP-SPECIFIC` lines, and import the new client config for `loginStatePath`. For
   single sign-on or MFA, script those steps in the same file, or use a test account without MFA in
   the test environment.
3. **Playwright config.** Point a config at the client with
   `createConfig({ suite: 'ui', client: yourClient })`. Add `outputName: '<name>'` to give it
   separate report folders. Don't copy the demo's `webServer` or credential generation: those
   exist only for the local demo application.
4. **Credentials.** Set `UI_USERNAME` and `UI_PASSWORD` (and `UI_BASE_URL` if needed) from CI
   secrets, or in a local `.env` copied from `.env.example`. Use an account with the least access
   the tests need.
5. **Tests.** Write tests in `clients/<name>/ui/tests/`. They start signed in. For a test that
   must start signed out, use `test.use({ storageState: { cookies: [], origins: [] } })`.

To find selectors on a real login page, run `npx playwright codegen <login URL>`. It suggests
role and label locators as you click.

## 6. Credentials and session files: what stays out of Git and reports

| Item | Protection |
| --- | --- |
| `UI_USERNAME`, `UI_PASSWORD` | Read only from the environment. `.env` is git-ignored, and `.env.example` has empty placeholders only. |
| Saved session `playwright/.auth/<client>.json` | Git-ignored. It holds live session cookies, so treat it like a password: don't attach it to tickets or CI artifacts. It's overwritten on every run. |
| HTML report, JUnit XML, failure files | Git-ignored folders. Both credentials are masked (`***`) in step titles, errors and the failure page snapshot. |
| Traces | Off for login runs, because they would capture the password and cookies. |
| Terminal output | **Not masked.** Don't print credentials from tests or the setup file. |
| Missing credentials | The setup fails with a message naming the missing variable, never showing a value. |

Before sharing a report folder, run `git status` to confirm that nothing under `playwright/.auth/`,
`.env` or a report folder is staged.

**Limitations to mention if asked:**
- On Windows, the session file can't be restricted to its owner.
- Single sign-on and MFA need custom setup steps.
- The demo suite isn't part of the default `test:ui` run or CI.
