import { createHash } from 'node:crypto';
import http from 'node:http';
import type { AddressInfo } from 'node:net';

/**
 * Minimal local HTTP server for deterministic error and timeout scenarios:
 *   GET /status/:code  -> responds with that status and a JSON error body
 *   GET /delay/:ms     -> responds 200 after the given delay
 *   GET /auth-hash     -> responds 200 with a SHA-256 hash of the Authorization header
 *   GET /malformed     -> responds 200 with an invalid JSON body
 *   ANY /echo          -> responds 200 with the request's method, headers, query and body;
 *                         its Cookie header is sent back as Set-Cookie. ?format=text|html|binary
 *                         changes the response content type (default JSON)
 *   GET /large/:bytes  -> responds 200 with a JSON body of roughly that many bytes
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

    if (pathname === '/auth-hash') {
      // Returns a hash, never the header itself, so tests can verify the token without exposing it.
      const authorization = req.headers.authorization ?? '';
      res.writeHead(200, jsonHeaders);
      res.end(JSON.stringify({ sha256: createHash('sha256').update(authorization).digest('hex') }));
      return;
    }

    if (pathname === '/echo') {
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => {
        const { searchParams } = new URL(req.url ?? '/', 'http://localhost');
        const echo = JSON.stringify({
          method: req.method,
          headers: req.headers,
          query: Object.fromEntries(searchParams),
          body: Buffer.concat(chunks).toString('utf8'),
        });
        const types: Record<string, string> = { text: 'text/plain', html: 'text/html', binary: 'application/octet-stream' };
        const headers: Record<string, string> = { 'content-type': types[searchParams.get('format') ?? ''] ?? jsonHeaders['content-type'] };
        if (req.headers.cookie) headers['set-cookie'] = req.headers.cookie;
        res.writeHead(200, headers);
        res.end(echo);
      });
      return;
    }

    const large = pathname.match(/^\/large\/(\d+)$/);
    if (large) {
      res.writeHead(200, jsonHeaders);
      res.end(JSON.stringify({ data: 'x'.repeat(Number(large[1])) }));
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
