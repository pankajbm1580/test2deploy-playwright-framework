import http from 'node:http';
import type { AddressInfo } from 'node:net';

/**
 * Minimal local HTTP server for deterministic error and timeout scenarios:
 *   GET /status/:code  -> responds with that status and a JSON error body
 *   GET /delay/:ms     -> responds 200 after the given delay
 *   GET /malformed     -> responds 200 with an invalid JSON body
 * Anything else       -> 404
 */
export interface StubServer {
  baseURL: string;
  close(): Promise<void>;
}

const jsonHeaders = { 'content-type': 'application/json; charset=utf-8' };

export async function startStubServer(): Promise<StubServer> {
  const server = http.createServer((req, res) => {
    const { pathname } = new URL(req.url ?? '/', 'http://localhost');

    const status = pathname.match(/^\/status\/(\d{3})$/);
    if (status) {
      const code = Number(status[1]);
      res.writeHead(code, jsonHeaders);
      res.end(JSON.stringify({ status: code, error: http.STATUS_CODES[code] ?? 'Unknown' }));
      return;
    }

    const delay = pathname.match(/^\/delay\/(\d+)$/);
    if (delay) {
      const ms = Number(delay[1]);
      const timer = setTimeout(() => {
        res.writeHead(200, jsonHeaders);
        res.end(JSON.stringify({ delayedMs: ms }));
      }, ms);
      res.on('close', () => clearTimeout(timer));
      return;
    }

    if (pathname === '/malformed') {
      res.writeHead(200, jsonHeaders);
      res.end('{"id": 1, "title": "unterminated');
      return;
    }

    res.writeHead(404, jsonHeaders);
    res.end(JSON.stringify({ status: 404, error: 'Not Found' }));
  });

  // Port 0 = any free port, so parallel workers never collide.
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;

  return {
    baseURL: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.closeAllConnections();
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}
