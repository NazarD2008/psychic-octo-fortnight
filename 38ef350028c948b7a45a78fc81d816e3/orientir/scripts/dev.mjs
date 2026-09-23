import http from 'node:http';
import { spawn } from 'node:child_process';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const DIST = path.join(ROOT, 'dist');
const BUILD = path.join(ROOT, 'scripts', 'build.mjs');
const HOST = process.env.HOST || 'localhost';
const START_PORT = Number(process.env.PORT) || 4321;
const PORT_ATTEMPTS = 10;
const WATCHED = ['src', 'public', 'site.config.mjs'];
const POLL_MS = 400;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.apk': 'application/vnd.android.package-archive',
};

let building = false;
let queued = false;
let timer;

function build() {
  if (building) {
    queued = true;
    return Promise.resolve();
  }
  building = true;
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [BUILD], { cwd: ROOT, stdio: 'inherit' });
    child.on('exit', () => {
      building = false;
      resolve();
      if (queued) {
        queued = false;
        build();
      }
    });
  });
}

function schedule() {
  clearTimeout(timer);
  timer = setTimeout(build, 150);
}

async function snapshot(target = WATCHED.map((p) => path.join(ROOT, p))) {
  let out = '';
  for (const entry of target) {
    const info = await stat(entry).catch(() => null);
    if (!info) continue;
    if (info.isDirectory()) {
      const names = (await readdir(entry)).sort();
      out += await snapshot(names.map((name) => path.join(entry, name)));
    } else {
      out += `${entry}:${info.mtimeMs}:${info.size}\n`;
    }
  }
  return out;
}

async function startWatching() {
  let last = await snapshot();
  setInterval(async () => {
    const next = await snapshot();
    if (next !== last) {
      last = next;
      schedule();
    }
  }, POLL_MS);
}

async function serve(req, res) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    res.writeHead(400).end('Bad request');
    return;
  }

  let file = path.join(DIST, pathname);
  if (file !== DIST && !file.startsWith(DIST + path.sep)) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  let info = await stat(file).catch(() => null);
  if (info?.isDirectory()) {
    if (!pathname.endsWith('/')) {
      res.writeHead(301, { location: `${pathname}/` }).end();
      return;
    }
    file = path.join(file, 'index.html');
    info = await stat(file).catch(() => null);
  }
  if (!info?.isFile()) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' }).end('404 Не найдено');
    return;
  }

  const body = await readFile(file);
  res.writeHead(200, {
    'content-type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  res.end(req.method === 'HEAD' ? undefined : body);
}

function listen(server, port, attemptsLeft) {
  server.once('error', (err) => {
    if (err.code === 'EADDRINUSE' && attemptsLeft > 0) {
      console.log(`Порт ${port} занят, пробую ${port + 1}`);
      listen(server, port + 1, attemptsLeft - 1);
    } else {
      console.error(err.message);
      process.exit(1);
    }
  });
  server.listen(port, HOST, () => {
    console.log(`\nСервер запущен: http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${port}\nОстановить: Ctrl+C\n`);
  });
}

await build();
startWatching();
const server = http.createServer((req, res) => {
  serve(req, res).catch((err) => {
    console.error(err);
    if (!res.headersSent) res.writeHead(500);
    res.end();
  });
});
listen(server, START_PORT, PORT_ATTEMPTS);
