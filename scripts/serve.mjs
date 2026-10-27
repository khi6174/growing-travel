import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const publicRoot = fileURLToPath(new URL('../dist/', import.meta.url));
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' };

export function createServer() {
  return http.createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
    if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(req.headers.host ?? '')) {
      res.writeHead(403); res.end('Local requests only'); return;
    }
    if (!['GET', 'HEAD'].includes(req.method)) {
      res.writeHead(405, { Allow: 'GET, HEAD' }); res.end('Method not allowed'); return;
    }
    try {
      const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      const target = path.resolve(publicRoot, '.' + (pathname === '/' ? '/index.html' : pathname));
      const relative = path.relative(publicRoot, target);
      if (relative.startsWith('..') || path.isAbsolute(relative) || !mime[path.extname(target)]) {
        res.writeHead(404); res.end('Not found'); return;
      }
      const content = await fs.readFile(target);
      res.writeHead(200, { 'Content-Type': mime[path.extname(target)] });
      res.end(req.method === 'HEAD' ? undefined : content);
    } catch (error) {
      res.writeHead(error instanceof URIError ? 400 : 404); res.end('Not found');
    }
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const portArg = process.argv.indexOf('--port');
  const port = portArg === -1 ? 4173 : Number(process.argv[portArg + 1]);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    console.error('Use a port from 1024 to 65535.'); process.exitCode = 1;
  } else {
    const server = createServer();
    server.on('error', (error) => {
      console.error(error.code === 'EADDRINUSE'
        ? `Port ${port} is in use. Stop the existing demo or use --port 4174 (separate browser storage).`
        : error.message);
      process.exitCode = 1;
    });
    server.listen(port, '127.0.0.1', () => console.log(`Growing Travel · Local: http://127.0.0.1:${port}\nStop: Ctrl+C · Static files only, no external requests.`));
    process.on('SIGINT', () => server.close());
    process.on('SIGTERM', () => server.close());
  }
}
