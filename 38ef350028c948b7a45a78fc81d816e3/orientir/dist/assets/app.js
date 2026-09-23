import { releaseView } from './format.js?v=c3e9de722e';

const root = document.documentElement;
const data = readSiteData();
const platform = detectPlatform();
root.dataset.platform = platform;

setupMenu();
setupFaqLinks();
setupShare();
refreshRelease();

function readSiteData() {
  try {
    return JSON.parse(document.getElementById('site-data')?.textContent || '{}');
  } catch {
    return {};
  }
}

function detectPlatform() {
  const ua = navigator.userAgent || '';
  const hint = navigator.userAgentData?.platform || '';
  if (/android/i.test(hint) || /Android/i.test(ua)) return 'android';
  if (/iPhone|iPad|iPod/.test(ua) || (/Mac/.test(ua) && navigator.maxTouchPoints > 1)) return 'ios';
  return 'desktop';
}

function setupMenu() {
  const menu = document.querySelector('details.menu');
  if (!menu) return;
  const summary = menu.querySelector('summary');
  const close = () => {
    menu.open = false;
  };

  menu.addEventListener('click', (event) => {
    if (event.target.closest('a')) close();
  });
  document.addEventListener('click', (event) => {
    if (menu.open && !menu.contains(event.target)) close();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && menu.open) {
      close();
      summary.focus();
    }
  });
  matchMedia('(min-width: 960px)').addEventListener('change', (event) => {
    if (event.matches) close();
  });
}

function setupFaqLinks() {
  const openFrom = (hash) => {
    const target = hash && document.getElementById(decodeURIComponent(hash.slice(1)));
    if (target instanceof HTMLDetailsElement) target.open = true;
  };
  document.addEventListener('click', (event) => {
    const link = event.target.closest('a[href^="#"]');
    if (link) openFrom(link.getAttribute('href'));
  });
  openFrom(location.hash);
}

function setupShare() {
  if (platform === 'android') return;
  const strings = data.strings || {};
  const url = new URL('#download', location.href).href;
  const canShare = platform === 'ios' && typeof navigator.share === 'function';

  for (const button of document.querySelectorAll('[data-share]')) {
    const label = button.querySelector('[data-share-label]');
    const status = button.parentElement.querySelector('[data-share-status]');
    if (label) label.textContent = (canShare ? strings.shareMobile : strings.shareDesktop) || label.textContent;
    button.hidden = false;

    button.addEventListener('click', async () => {
      if (canShare) {
        try {
          await navigator.share({ title: strings.shareTitle, text: strings.shareText, url });
          return;
        } catch (err) {
          if (err?.name === 'AbortError') return;
        }
      }
      try {
        await navigator.clipboard.writeText(url);
        say(status, strings.copied);
      } catch {
        say(status, (strings.copyManual || '{url}').replace('{url}', url));
      }
    });
  }
}

function say(el, message) {
  if (el && message) el.textContent = message;
}

async function refreshRelease() {
  if (!data.manifest) return;
  let view;
  try {
    const res = await fetch(data.manifest, { cache: 'no-cache', credentials: 'omit' });
    if (!res.ok) return;
    view = releaseView(await res.json(), data.locale);
  } catch {
    return;
  }
  if (!view) return;

  for (const el of document.querySelectorAll('[data-release]')) {
    const key = el.dataset.release;
    if (!(key in view)) continue;
    el.textContent = view[key];
    if (el instanceof HTMLTimeElement) el.dateTime = view.dateISO;
  }
  for (const el of document.querySelectorAll('[data-release-link]')) el.href = view.url;
  for (const el of document.querySelectorAll('[data-requires]')) el.hidden = !view[el.dataset.requires];
}
