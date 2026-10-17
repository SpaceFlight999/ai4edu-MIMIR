import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('.', import.meta.url));
const server = createServer(async (req, res) => {
  try {
    const name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).replace(/^\/+/, '') || 'demo.html';
    const file = resolve(root, name), location = relative(root, file);
    if (location === '..' || location.startsWith('..' + sep) || location.includes(':') || !['.html', '.mjs', '.svg', '.png'].includes(extname(file))) { res.writeHead(404); res.end(); return; }
    const type = { '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' }[extname(file)];
    const data = await readFile(file); res.writeHead(200, { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff' }); res.end(data);
  } catch { res.writeHead(404); res.end(); }
});
server.listen(0, '127.0.0.1', () => console.log(`MIMIR wordmark demo: http://127.0.0.1:${server.address().port}/demo.html`));
