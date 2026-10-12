// Local demo app with a login page, for the login setup example (see ../README.md).
// Not a real authentication system: one user, sessions in memory, plain HTTP on 127.0.0.1.
//
// The expected credentials come from LOGIN_DEMO_USER and LOGIN_DEMO_PASSWORD (the demo config
// passes them in); nothing is hardcoded. Started by playwright.login-demo.config.ts (webServer).
import { createServer } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';

const user = process.env.LOGIN_DEMO_USER;
const password = process.env.LOGIN_DEMO_PASSWORD;
const port = Number(process.env.LOGIN_DEMO_PORT || 4321);
if (!user || !password) {
  console.error('LOGIN_DEMO_USER and LOGIN_DEMO_PASSWORD must be set.');
  process.exit(1);
}

const sessions = new Set();

const same = (a, b) => {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && timingSafeEqual(left, right);
};

const page = (title, body) =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title}</title></head><body><main>${body}</main></body></html>`;

const loginPage = (failed) =>
  page(
    'Sign in',
    `<h1>Sign in</h1>
${failed ? '<p role="alert">Invalid username or password.</p>' : ''}
<form method="post" action="/login">
  <label>Username <input name="username" autocomplete="username" required></label>
  <label>Password <input name="password" type="password" autocomplete="current-password" required></label>
  <button type="submit">Sign in</button>
</form>`,
  );

function session(req) {
  const match = /(?:^|;\s*)session=([a-f0-9]{64})/.exec(req.headers.cookie ?? '');
  return match && sessions.has(match[1]) ? match[1] : undefined;
}

function send(res, status, headers, body = '') {
  res.writeHead(status, { 'Cache-Control': 'no-store', ...headers });
  res.end(body);
}

createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const html = { 'Content-Type': 'text/html; charset=utf-8' };

  if (req.method === 'GET' && url.pathname === '/login') {
    return send(res, 200, html, loginPage(url.searchParams.has('error')));
  }
  if (req.method === 'POST' && url.pathname === '/login') {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 10_000) req.destroy();
    });
    req.on('end', () => {
      const form = new URLSearchParams(data);
      // Both comparisons always run, so a wrong username takes as long as a wrong password.
      const userOk = same(form.get('username') ?? '', user);
      const passwordOk = same(form.get('password') ?? '', password);
      if (!(userOk && passwordOk)) return send(res, 303, { Location: '/login?error' });
      const id = randomBytes(32).toString('hex');
      sessions.add(id);
      send(res, 303, { Location: '/account', 'Set-Cookie': `session=${id}; HttpOnly; SameSite=Lax; Path=/` });
    });
    return;
  }
  if (req.method === 'GET' && url.pathname === '/account') {
    if (!session(req)) return send(res, 303, { Location: '/login' });
    return send(res, 200, html, page('Account', '<h1>Account</h1><p>You are signed in.</p><form method="post" action="/logout"><button>Sign out</button></form>'));
  }
  if (req.method === 'POST' && url.pathname === '/logout') {
    sessions.delete(session(req));
    return send(res, 303, { Location: '/login', 'Set-Cookie': 'session=; Max-Age=0; Path=/' });
  }
  if (req.method === 'GET' && url.pathname === '/') {
    return send(res, 303, { Location: session(req) ? '/account' : '/login' });
  }
  send(res, 404, { 'Content-Type': 'text/plain' }, 'Not found');
}).listen(port, '127.0.0.1', () => console.log(`Login demo app on http://127.0.0.1:${port}/`));
