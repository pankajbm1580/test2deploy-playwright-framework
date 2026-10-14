# Login setup example (`login-demo`)

A working example of the framework's reusable login setup, against a small local demo app.
The browser logs in **once per run** in a `setup` project, saves the signed-in state, and every
browser project (Chromium, Firefox, WebKit) starts each test already signed in.

```
npm run test:login-demo
```

No configuration is needed for the demo. It starts the app in `app/server.mjs` on
`http://127.0.0.1:4321/` (`LOGIN_DEMO_PORT` changes the port) and, unless `UI_USERNAME` and
`UI_PASSWORD` are set, generates one-off random credentials for the run. Reports go to
`playwright-report-login-demo/`, `test-results-login-demo/` and `reports/junit/login-demo.xml`.

## How it works

| Piece | File |
| --- | --- |
| Opt-in setting: `ui.login.setupFile` | `client.config.ts` |
| Login steps (app-specific) | `ui/auth.setup.ts` |
| Signed-in tests (no login code) | `ui/tests/*.spec.ts` |
| Framework helpers: credentials, state path, saving | `framework/support/login.ts` |
| Setup project, dependencies, `storageState` | `framework/config/create-config.ts` |

When a client config has `ui.login`, `createConfig` adds a `setup` project that runs only that
file and makes every browser project depend on it and use its saved state. A client without
`ui.login` (such as `clients/demo`) gets exactly the same projects as before.

## Security

- **Credentials** come only from `UI_USERNAME` and `UI_PASSWORD`: shell, CI secrets, or the
  git-ignored `.env`. Never put them in a client config, a setup file or a test. A missing
  variable fails the setup with a message that names it, never shows a value.
- **Saved state** (the session cookies) is written to `playwright/.auth/<client>.json`, which is
  git-ignored, with owner-only permissions where the OS supports them (not on Windows). Treat it
  like a password: don't copy it into the repo, artifacts or tickets. Each run logs in again and
  overwrites it.
- **Reports**: both credentials are masked wherever they appear, including the `Fill "***"` steps
  Playwright records when the password is typed and the failure snapshot (`error-context.md`),
  which shows values typed into form fields.
- **Traces** are off for the setup project (it types the password) and for the signed-in tests
  (their requests carry the session cookies). Screenshots on failure are kept for the tests and
  off for the setup.
- **Terminal output is not redacted** (see `.env.example`). Don't log credentials from tests.

## Adapting it to a real client

1. Create `clients/<name>/client.config.ts` with `defineClient`, setting
   `ui.defaultBaseURL` and `ui.login: { setupFile: 'auth.setup.ts' }`. List production hosts in
   `productionHosts`, so the production guard applies.
2. Copy `ui/auth.setup.ts` to `clients/<name>/ui/auth.setup.ts` and change the lines marked
   `APP-SPECIFIC`: the login page path, the username, password and submit locators, and the check
   that only a signed-in user passes (it must fail when the login is rejected). Import your own
   client config for `loginStatePath`. For single sign-on or MFA, script those steps here too, or
   use a test account without MFA in the test environment.
3. Point a config at the client, like the root `playwright.config.ts` but with your client:
   `createConfig({ suite: 'ui', client: yourClient })`. Add `outputName` if it runs next to another
   client's UI suite, so their reports don't overwrite each other. Don't copy this demo's
   `webServer` or credential generation: those exist only for the local demo app.
4. Provide the environment: `UI_BASE_URL` (or rely on `ui.defaultBaseURL`), `UI_USERNAME` and
   `UI_PASSWORD`, from CI secrets or a local `.env`. Use a dedicated test account with the least
   access the tests need.
5. Write tests normally in `clients/<name>/ui/tests/`: they start signed in. For a test that must
   start signed out, use `test.use({ storageState: { cookies: [], origins: [] } })`, as in
   `ui/tests/account.spec.ts`.
