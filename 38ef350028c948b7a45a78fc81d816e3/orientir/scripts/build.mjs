import { cp, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import config from '../site.config.mjs';
import { renderPage } from '../src/render.mjs';
import { releaseView } from '../src/assets/format.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const SRC = path.join(ROOT, 'src');
const PUBLIC = path.join(ROOT, 'public');
const OUT = path.join(ROOT, 'dist');
const TMP = path.join(ROOT, '.dist-tmp');
const OLD = path.join(ROOT, '.dist-old');

const isAbsoluteUrl = (value) => /^https?:\/\//i.test(value);
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

function deepMerge(base, over) {
  if (over === undefined) return base;
  if (!isObject(base) || !isObject(over)) return over;
  const out = { ...base };
  for (const [key, value] of Object.entries(over)) out[key] = deepMerge(base[key], value);
  return out;
}

async function readJson(file) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch (err) {
    throw new Error(`${path.relative(ROOT, file)}: ${err.message}`);
  }
}

function siteUrl() {
  const url = String(config.siteUrl ?? '').replace(/\/+$/, '');
  if (!isAbsoluteUrl(url)) throw new Error('site.config.mjs: siteUrl должен быть абсолютным адресом, например https://example.org');
  return url;
}

function localeList() {
  const locales = [...new Set(config.locales ?? [])];
  const def = config.defaultLocale;
  if (!locales.includes(def)) throw new Error(`site.config.mjs: defaultLocale "${def}" нет в locales`);
  return [def, ...locales.filter((code) => code !== def)];
}

async function loadMessages(locales) {
  const base = await readJson(path.join(SRC, 'locales', `${locales[0]}.json`));
  const out = { [locales[0]]: base };
  for (const code of locales.slice(1)) out[code] = deepMerge(base, await readJson(path.join(SRC, 'locales', `${code}.json`)));
  return out;
}

async function loadManifest() {
  const source = config.releaseManifest || 'release.json';
  if (isAbsoluteUrl(source)) {
    try {
      const res = await fetch(source, { signal: AbortSignal.timeout(10_000), headers: { accept: 'application/json' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const raw = await res.json();
      if (!releaseView(raw, config.defaultLocale)) throw new Error('неверный формат');
      return { raw, from: source };
    } catch (err) {
      console.warn(`Не удалось получить ${source} (${err.message}), используется public/release.json`);
    }
  }
  const file = isAbsoluteUrl(source) ? path.join(PUBLIC, 'release.json') : path.join(PUBLIC, source.replace(/^\/+/, ''));
  return { raw: await readJson(file), from: path.relative(ROOT, file) };
}

async function assetVersion() {
  const hash = createHash('sha256');
  for (const file of ['styles.css', 'app.js', 'format.js']) hash.update(await readFile(path.join(SRC, 'assets', file)));
  return hash.digest('hex').slice(0, 10);
}

function manifestUrl(prefix) {
  const source = config.releaseManifest || 'release.json';
  return isAbsoluteUrl(source) ? source : prefix + source.replace(/^\/+/, '');
}

function contentSecurityPolicy(manifest = config.releaseManifest) {
  const connect = ["'self'"];
  if (isAbsoluteUrl(manifest ?? '')) connect.push(new URL(manifest).origin);
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "font-src 'self'",
    "img-src 'self'",
    `connect-src ${connect.join(' ')}`,
    "form-action 'none'",
    "base-uri 'none'",
    "object-src 'none'",
  ].join('; ');
}

function sitemap(languages) {
  const alt = (l) => `    <xhtml:link rel="alternate" hreflang="${l.code}" href="${l.absUrl}"/>`;
  const urls = languages
    .map((l) => [`  <url>`, `    <loc>${l.absUrl}</loc>`, ...(languages.length > 1 ? languages.map(alt) : []), `  </url>`].join('\n'))
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls}
</urlset>
`;
}

async function build() {
  const started = performance.now();
  const base = siteUrl();
  const locales = localeList();
  const messages = await loadMessages(locales);
  const manifest = await loadManifest();
  const version = await assetVersion();
  const csp = contentSecurityPolicy();
  const year = new Date().getFullYear();

  const languages = locales.map((code, i) => ({
    code,
    name: messages[code].meta.langName,
    short: messages[code].meta.langShort,
    path: i === 0 ? '/' : `/${code}/`,
    absUrl: i === 0 ? `${base}/` : `${base}/${code}/`,
  }));

  await rm(TMP, { recursive: true, force: true });
  await mkdir(TMP, { recursive: true });
  await cp(PUBLIC, TMP, { recursive: true });
  await cp(path.join(SRC, 'assets'), path.join(TMP, 'assets'), { recursive: true });

  const appFile = path.join(TMP, 'assets', 'app.js');
  const app = await readFile(appFile, 'utf8');
  if (!app.includes("'./format.js'")) throw new Error("src/assets/app.js: не найден импорт './format.js'");
  await writeFile(appFile, app.replaceAll("'./format.js'", `'./format.js?v=${version}'`));

  for (const [i, lang] of languages.entries()) {
    const release = releaseView(manifest.raw, lang.code);
    if (!release) {
      throw new Error(
        `${manifest.from}: неверный формат. Нужны поля version, date (YYYY-MM-DD), url (https://...), size (в байтах) и os. Поле sha256, если есть, должно содержать 64 hex-символа.`,
      );
    }
    const prefix = i === 0 ? '' : '../';
    const html = renderPage({
      config,
      locale: lang.code,
      t: messages[lang.code],
      release,
      languages: languages.map((l) => ({ ...l, url: prefix + l.path.slice(1) || './', current: l === lang })),
      prefix,
      pageUrl: lang.absUrl,
      manifestUrl: manifestUrl(prefix),
      assetVersion: version,
      csp,
      year,
    });
    const dir = i === 0 ? TMP : path.join(TMP, lang.code);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, 'index.html'), html);
  }

  await writeFile(path.join(TMP, 'sitemap.xml'), sitemap(languages));

  await rm(OLD, { recursive: true, force: true });
  if (existsSync(OUT)) await rename(OUT, OLD);
  await rename(TMP, OUT);
  await rm(OLD, { recursive: true, force: true });

  const ms = Math.round(performance.now() - started);
  console.log(`dist/ собран за ${ms} мс (${languages.map((l) => l.code).join(', ')}; релиз ${manifest.raw.version} из ${manifest.from})`);

  if (/example\.(org|com)/.test(base)) console.log('siteUrl в site.config.mjs пока заглушка. От него зависят canonical, sitemap и QR-код.');
}

build().catch(async (err) => {
  await rm(TMP, { recursive: true, force: true }).catch(() => {});
  console.error(`Сборка не удалась: ${err.message}`);
  process.exitCode = 1;
});
