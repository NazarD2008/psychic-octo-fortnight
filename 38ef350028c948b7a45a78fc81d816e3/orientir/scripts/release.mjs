import { createReadStream } from 'node:fs';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { parseArgs } from 'node:util';
import config from '../site.config.mjs';
import { releaseView } from '../src/assets/format.js';

const ROOT = path.resolve(import.meta.dirname, '..');

const USAGE = `Использование:
  npm run release -- <app.apk> --url <https://.../app.apk> [опции]

Опции:
  --url      адрес, по которому APK будет доступен для скачивания (обязательно)
  --version  версия; по умолчанию берётся из имени файла (например, Orientir-1.2.0.apk)
  --date     дата выпуска YYYY-MM-DD; по умолчанию сегодня
  --os       поддерживаемые системы через запятую; по умолчанию "Android 8.0+"
  --arch     архитектура, если APK не универсальный (например, arm64-v8a)
  --out      куда записать манифест; по умолчанию public/release.json`;

function fail(message) {
  console.error(`Ошибка: ${message}\n\n${USAGE}`);
  process.exit(1);
}

function today() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function sha256(file) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    createReadStream(file)
      .on('data', (chunk) => hash.update(chunk))
      .on('end', () => resolve(hash.digest('hex')))
      .on('error', reject);
  });
}

let args;
try {
  args = parseArgs({
    allowPositionals: true,
    options: {
      url: { type: 'string' },
      version: { type: 'string' },
      date: { type: 'string' },
      os: { type: 'string' },
      arch: { type: 'string' },
      out: { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    },
  });
} catch (err) {
  fail(err.message);
}

const { values, positionals } = args;
if (values.help) {
  console.log(USAGE);
  process.exit(0);
}

const file = positionals[0];
if (!file) fail('Не указан файл приложения.');
if (!values.url) fail('Не указан --url.');

const info = await stat(file).catch(() => null);
if (!info?.isFile()) fail(`Файл не найден: ${file}`);

const base = path.basename(file);
const version = values.version ?? /(\d+\.\d+(?:\.\d+)?(?:[-+][0-9A-Za-z.-]+)?)$/.exec(base.replace(/\.apk$/i, ''))?.[1];
if (!version) fail(`Не удалось взять версию из имени "${base}". Укажите --version.`);

const manifest = {
  version,
  date: values.date ?? today(),
  url: values.url,
  size: info.size,
  os: (values.os ?? 'Android 8.0+')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  ...(values.arch ? { arch: values.arch } : {}),
  sha256: await sha256(file),
};

const view = releaseView(manifest, config.defaultLocale);
if (!view) fail('Манифест не прошёл проверку. Проверьте, что --url начинается с https://, --date записана как YYYY-MM-DD, а в --version нет пробелов.');

const warnings = [];
if (!base.toLowerCase().endsWith('.apk')) warnings.push(`у файла "${base}" расширение не .apk`);
if (view.fileName !== base) warnings.push(`имя в --url ("${view.fileName}") не совпадает с именем файла ("${base}")`);
if (new URL(view.url).protocol !== 'https:') warnings.push('ссылка не https, браузеры могут предупреждать при скачивании');

const out = path.resolve(values.out ?? path.join(ROOT, 'public', 'release.json'));
await mkdir(path.dirname(out), { recursive: true });
await writeFile(out, `${JSON.stringify(manifest, null, 2)}\n`);

const external = /^https?:\/\//i.test(config.releaseManifest ?? '');
console.log(`Записан ${path.relative(process.cwd(), out) || out}

  Версия    ${view.version}
  Дата      ${view.date}
  Система   ${view.system}
  Размер    ${view.size} (${manifest.size} байт)
  SHA-256   ${manifest.sha256}
  Ссылка    ${view.url}
${warnings.map((w) => `\nВнимание: ${w}`).join('')}
Дальше:
  1. Загрузите ${base} в хранилище так, чтобы он открывался по ссылке выше
     (Content-Type: application/vnd.android.package-archive).
  2. ${
    external
      ? `Загрузите release.json по адресу ${config.releaseManifest}. Сайт подхватит его без пересборки.`
      : 'Замените release.json в корне опубликованного сайта (пересборка не нужна) или выполните npm run build и задеплойте dist/.'
  }`);
