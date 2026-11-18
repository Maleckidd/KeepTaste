// Minimal static server for the web export (`npm run e2e:build` → dist/).
// The app is a single-page build (app.json web.output = "single"), so any
// path that is not a file falls back to index.html and Expo Router takes over.
// No dependency on purpose: Node's http module is enough for a test harness.
//
//   node e2e/support/serve.mjs [dir=dist] [port=8090]
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';

const root = resolve(process.argv[2] ?? 'dist');
const port = Number(process.argv[3] ?? 8090);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.svg': 'image/svg+xml',
};

async function isFile(path) {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

try {
  await stat(join(root, 'index.html'));
} catch {
  console.error(`No web export in ${root}. Run \`npm run e2e:build\` first.`);
  process.exit(1);
}

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  // Resolve inside root only; anything escaping it falls back to the SPA.
  const candidate = normalize(join(root, decodeURIComponent(url.pathname)));
  const inside = candidate === root || candidate.startsWith(root + sep);
  const file = inside && (await isFile(candidate)) ? candidate : join(root, 'index.html');
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(500).end();
  }
}).listen(port, '127.0.0.1', () => {
  console.log(`Serving ${root} on http://127.0.0.1:${port}`);
});
