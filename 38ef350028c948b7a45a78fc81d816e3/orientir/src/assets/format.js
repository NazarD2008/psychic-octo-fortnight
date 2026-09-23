export function safeHref(value) {
  if (typeof value !== 'string' || value.trim() === '') return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}

const VERSION = /^[0-9A-Za-z][0-9A-Za-z.+_-]{0,39}$/;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const SHA256 = /^[0-9a-f]{64}$/i;

function text(value, max = 80) {
  return typeof value === 'string' && value.trim() !== '' && value.length <= max ? value.trim() : null;
}

function parseDate(value) {
  const m = typeof value === 'string' ? DATE.exec(value) : null;
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3] ? d : null;
}

function fileNameOf(href) {
  const last = new URL(href).pathname.split('/').filter(Boolean).pop() ?? '';
  try {
    return decodeURIComponent(last);
  } catch {
    return last;
  }
}

export function releaseView(raw, locale) {
  if (!raw || typeof raw !== 'object') return null;

  const version = typeof raw.version === 'string' && VERSION.test(raw.version) ? raw.version : null;
  const date = parseDate(raw.date);
  const url = safeHref(raw.url);
  const size = Number.isSafeInteger(raw.size) && raw.size > 0 ? raw.size : null;
  const osList = (Array.isArray(raw.os) ? raw.os : [raw.os]).map((s) => text(s, 40));
  if (!version || !date || !url || !size || osList.length === 0 || osList.includes(null)) return null;

  const arch = raw.arch == null || raw.arch === '' ? '' : text(raw.arch, 20);
  const sha256 = raw.sha256 == null || raw.sha256 === '' ? '' : SHA256.test(raw.sha256) ? raw.sha256.toLowerCase() : null;
  if (arch === null || sha256 === null) return null;

  const os = new Intl.ListFormat(locale, { style: 'long', type: 'conjunction' }).format(osList);
  const mb = size / 1024 / 1024;

  return {
    version,
    date: new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(date),
    dateISO: raw.date,
    size: new Intl.NumberFormat(locale, {
      style: 'unit',
      unit: 'megabyte',
      maximumFractionDigits: mb < 10 ? 1 : 0,
    }).format(mb),
    os,
    arch,
    system: arch ? `${os} (${arch})` : os,
    fileName: fileNameOf(url),
    url,
    sha256,
  };
}
