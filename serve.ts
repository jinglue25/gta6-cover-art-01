import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('./app/', import.meta.url));
const portArg = process.argv.indexOf('--port');
const port = Number(portArg < 0 ? (process.env.PORT ?? 8080) : process.argv[portArg + 1]);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('端口必须是 1 至 65535');
const types = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json',
  '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf', '.txt': 'text/plain; charset=utf-8',
};
createServer(async (req, res) => {
  try {
    const raw = decodeURIComponent((req.url ?? '/').split('?')[0]);
    const file = resolve(root, '.' + (raw.endsWith('/') ? raw + 'index.html' : raw));
    if (!file.startsWith(resolve(root) + sep)) { res.writeHead(403).end('Forbidden'); return; }
    if (!(await stat(file)).isFile()) { res.writeHead(404).end('Not found'); return; }
    const bytes = await readFile(file);
    res.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(req.method === 'HEAD' ? undefined : bytes);
  } catch { res.writeHead(404).end('Not found'); }
}).listen(port, '127.0.0.1', () => console.log(`Afterglow 本地预览：http://localhost:${port}`));
