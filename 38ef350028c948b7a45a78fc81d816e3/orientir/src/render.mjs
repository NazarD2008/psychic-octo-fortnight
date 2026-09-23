import qrcode from '../scripts/vendor/qrcode.mjs';

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const NBSP = ' ';
const PLACEHOLDER = /\{(\w+)\}/g;

export const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

export function typo(value) {
  return String(value ?? '')
    .replace(/(?<=^|[\s(«„"])(\p{L}{1,2})[ \t]+/gu, `$1${NBSP}`)
    .replace(/[ \t]+—/g, `${NBSP}—`)
    .replace(/[ \t]+(ли|же|бы)(?=[\s.,!?;:)»]|$)/giu, `${NBSP}$1`);
}

export const tx = (value) => esc(typo(value));

function releaseSpan(key, view) {
  if (!(key in view)) throw new Error(`Неизвестный ключ {${key}} в тексте локали`);
  return `<span data-release="${key}">${esc(view[key])}</span>`;
}

function withRelease(value, view) {
  return tx(value).replace(PLACEHOLDER, (_, key) => releaseSpan(key, view));
}

function rich(value, view) {
  return String(value)
    .split('`')
    .map((part, i) =>
      i % 2 ? `<code>${esc(part).replace(PLACEHOLDER, (_, key) => releaseSpan(key, view))}</code>` : withRelease(part, view),
    )
    .join('');
}

function fill(value, vars) {
  return tx(value).replace(PLACEHOLDER, (match, key) => (key in vars ? esc(vars[key]) : match));
}

function plain(value, view) {
  return String(value).replace(PLACEHOLDER, (match, key) => view[key] ?? match).replaceAll('`', '');
}

const pad2 = (n) => String(n).padStart(2, '0');

const jsonBlock = (data) => JSON.stringify(data).replace(/</g, '\\u003c');

const ICONS = {
  chevron: '<path d="m6 9 6 6 6-6"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  arrow: '<path d="M3 12h17"/><path d="m14 6 6 6-6 6"/>',
};

function icon(name, cls = '') {
  return `<svg class="icon${cls ? ` ${cls}` : ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true" focusable="false">${ICONS[name]}</svg>`;
}

const logo = () =>
  `<svg class="logo" viewBox="0 0 32 32" aria-hidden="true" focusable="false"><rect class="logo__bg" x="0.75" y="0.75" width="30.5" height="30.5" rx="2"/><path class="logo__cross" d="M16 3v4M16 25v4M3 16h4M25 16h4"/><g transform="rotate(35 16 16)"><path class="logo__north" d="M16 7.5 19.2 16h-6.4z"/><path class="logo__south" d="M12.8 16h6.4L16 24.5z"/></g></svg>`;

function dialSvg(letters, readout) {
  const R = 190;
  const point = (deg, r) => {
    const a = ((deg - 90) * Math.PI) / 180;
    return [+(r * Math.cos(a)).toFixed(2), +(r * Math.sin(a)).toFixed(2)];
  };
  let ticks = '';
  let major = '';
  for (let d = 0; d < 360; d += 5) {
    const len = d % 30 === 0 ? 18 : d % 10 === 0 ? 11 : 6;
    const [x1, y1] = point(d, R);
    const [x2, y2] = point(d, R - len);
    if (d % 30 === 0) major += `M${x1} ${y1}L${x2} ${y2}`;
    else ticks += `M${x1} ${y1}L${x2} ${y2}`;
  }
  let numbers = '';
  for (let d = 30; d < 360; d += 30) {
    if (d % 90 === 0) continue;
    const [x, y] = point(d, R - 36);
    numbers += `<text x="${x}" y="${y}" class="dial__num">${String(d).padStart(3, '0')}</text>`;
  }
  const cardinals = letters
    .map((letter, i) => {
      const [x, y] = point(i * 90, R - 38);
      return `<text x="${x}" y="${y}" class="dial__card${i === 0 ? ' dial__card--n' : ''}">${esc(letter)}</text>`;
    })
    .join('');
  return `<svg class="dial" viewBox="-215 -215 430 470" aria-hidden="true" focusable="false">
            <circle class="dial__ring" r="${R}"/>
            <circle class="dial__ring dial__ring--dash" r="${R - 62}"/>
            <circle class="dial__ring" r="70"/>
            <path class="dial__tick" d="${ticks}"/>
            <path class="dial__tick dial__tick--major" d="${major}"/>
            <path class="dial__cross" d="M${-R + 70} 0H-78M78 0H${R - 70}M0 ${-R + 70}V-78M0 78V${R - 70}"/>
            ${numbers}${cardinals}
            <g transform="rotate(35)">
              <path class="dial__bearing" d="M0 -${R - 20}V-78"/>
              <path class="dial__needle-n" d="M0 -118 14 0h-28z"/>
              <path class="dial__needle-s" d="M-14 0h28L0 118z"/>
            </g>
            <circle class="dial__hub" r="6"/>
            <text x="0" y="${R + 40}" class="dial__readout">${esc(readout.toLocaleUpperCase('ru'))}</text>
          </svg>`;
}

function qrSvg(text, label) {
  const qr = qrcode(0, 'M');
  qr.addData(text, 'Byte');
  qr.make();
  const count = qr.getModuleCount();
  const quiet = 4;
  const size = count + quiet * 2;
  let d = '';
  for (let r = 0; r < count; r += 1) {
    for (let c = 0; c < count; c += 1) {
      if (!qr.isDark(r, c)) continue;
      let run = 1;
      while (c + run < count && qr.isDark(r, c + run)) run += 1;
      d += `M${c + quiet} ${r + quiet}h${run}v1h-${run}z`;
      c += run - 1;
    }
  }
  return `<svg class="qr__code" viewBox="0 0 ${size} ${size}" role="img" aria-label="${esc(label)}" shape-rendering="crispEdges"><rect width="${size}" height="${size}" fill="#ffffff"/><path d="${d}" fill="#111418"/></svg>`;
}

function telegramHandle(href) {
  try {
    const { hostname, pathname } = new URL(href);
    const name = pathname.split('/').filter(Boolean)[0];
    return /(^|\.)t\.me$|(^|\.)telegram\.me$/.test(hostname) && name ? `@${name}` : href.replace(/^https?:\/\//, '');
  } catch {
    return href;
  }
}

function mailto(email, subject) {
  return `mailto:${email}?subject=${encodeURIComponent(subject)}`;
}

export function renderPage({ config, locale, t, release, languages, prefix, pageUrl, manifestUrl, assetVersion, csp, year }) {
  const v = release;
  const asset = (file) => `${prefix}assets/${file}?v=${assetVersion}`;
  const font = (file) => `${prefix}assets/fonts/${file}`;
  const downloadPage = new URL('#download', pageUrl).href;
  const qrText = downloadPage.replace(/^https?:\/\//, '');

  const navItems = [
    ['how', t.nav.how],
    ['download', t.nav.download],
    ['about', t.nav.about],
    ['faq', t.nav.faq],
    ['contacts', t.nav.contacts],
  ];
  const links = (items) => items.map(([id, label]) => `<li><a href="#${id}">${tx(label)}</a></li>`).join('');
  const navList = links(navItems);
  const footerList = links(navItems.filter(([id]) => id !== 'how'));

  const head = (n, id, title) =>
    `<div class="section__head"><p class="section__index" aria-hidden="true">${tx(t.nav.section)} ${pad2(n)}</p><h2 id="${id}">${tx(title)}</h2></div>`;

  const langSwitch =
    languages.length > 1
      ? `<nav class="lang" aria-label="${esc(t.nav.language)}"><ul>${languages
          .map(
            (l) =>
              `<li><a href="${esc(l.url)}" lang="${l.code}" hreflang="${l.code}"${l.current ? ' aria-current="page"' : ''} title="${esc(l.name)}">${esc(l.short)}</a></li>`,
          )
          .join('')}</ul></nav>`
      : '';

  const alternates =
    languages.length > 1
      ? languages.map((l) => `\n  <link rel="alternate" hreflang="${l.code}" href="${esc(l.absUrl)}">`).join('') +
        `\n  <link rel="alternate" hreflang="x-default" href="${esc(languages[0].absUrl)}">`
      : '';

  const telegram = config.contacts?.telegram;
  const email = config.contacts?.email;

  const faqItems = t.faq.items
    .map(
      (item, i) => `
            <details class="faq__item" id="faq-${esc(item.id ?? i + 1)}">
              <summary><span class="faq__num" aria-hidden="true">${pad2(i + 1)}</span><span class="faq__q">${tx(item.q)}</span>${icon('chevron', 'faq__chevron')}</summary>
              <div class="faq__body">${item.a.map((p) => `<p>${rich(p, v)}</p>`).join('')}</div>
            </details>`,
    )
    .join('');

  const structured = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'SoftwareApplication',
        name: config.name,
        description: t.meta.description,
        url: pageUrl,
        operatingSystem: v.os,
        applicationCategory: 'UtilitiesApplication',
        softwareVersion: v.version,
        datePublished: v.dateISO,
        downloadUrl: v.url,
        inLanguage: locale,
      },
      {
        '@type': 'FAQPage',
        mainEntity: t.faq.items.map((item) => ({
          '@type': 'Question',
          name: item.q,
          acceptedAnswer: { '@type': 'Answer', text: item.a.map((p) => plain(p, v)).join(' ') },
        })),
      },
    ],
  };

  const siteData = {
    manifest: manifestUrl,
    locale,
    strings: {
      shareDesktop: t.download.shareDesktop,
      shareMobile: t.download.shareMobile,
      copied: t.download.copied,
      copyManual: t.download.copyManual,
      shareTitle: t.download.shareTitle,
      shareText: t.download.shareText,
    },
  };

  return `<!doctype html>
<html lang="${locale}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="${esc(csp)}">
  <meta name="referrer" content="no-referrer">
  <title>${esc(t.meta.title)}</title>
  <meta name="description" content="${esc(t.meta.description)}">
  <link rel="canonical" href="${esc(pageUrl)}">${alternates}
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="${esc(config.name)}">
  <meta property="og:title" content="${esc(t.meta.title)}">
  <meta property="og:description" content="${esc(t.meta.description)}">
  <meta property="og:url" content="${esc(pageUrl)}">
  <meta property="og:locale" content="${esc(t.meta.ogLocale)}">
  <meta name="color-scheme" content="dark">
  <meta name="theme-color" content="#171a14">
  <link rel="icon" href="${prefix}favicon.svg" type="image/svg+xml">
  <link rel="preload" href="${font('oswald-cyrillic-wght-normal.woff2')}" as="font" type="font/woff2" crossorigin>
  <link rel="preload" href="${font('ibm-plex-sans-cyrillic-wght-normal.woff2')}" as="font" type="font/woff2" crossorigin>
  <link rel="stylesheet" href="${asset('styles.css')}">
  <script type="module" src="${asset('app.js')}"></script>
  <script type="application/ld+json">${jsonBlock(structured)}</script>
</head>
<body>
  <a class="skip" href="#main">${tx(t.nav.skip)}</a>

  <header class="header">
    <div class="container header__inner">
      <a class="brand" href="#top" aria-label="${esc(t.nav.home)}">${logo()}<span class="brand__name">${esc(config.name)}</span></a>
      <nav class="nav" aria-label="${esc(t.nav.label)}"><ul>${navList}</ul></nav>
      <div class="header__actions">
        ${langSwitch}
        <a class="btn btn--primary btn--sm header__cta" href="#download">${tx(t.nav.download)}</a>
        <details class="menu">
          <summary class="menu__toggle">${icon('menu', 'menu__open')}${icon('close', 'menu__close')}<span class="sr-only">${tx(t.nav.menu)}</span></summary>
          <nav class="menu__panel" aria-label="${esc(t.nav.label)}">
            <ul>${navList}</ul>
          </nav>
        </details>
      </div>
    </div>
  </header>

  <main id="main">
    <section class="hero" id="top" aria-labelledby="hero-title">
      <div class="container hero__grid">
        <div class="hero__text">
          <p class="tag"><span class="tag__mark" aria-hidden="true"></span>${tx(t.hero.tag)}</p>
          <h1 class="hero__title" id="hero-title">${esc(config.name)}</h1>
          <p class="hero__lead">${tx(t.hero.lead)}</p>
          <div class="hero__actions">
            <a class="btn btn--primary btn--lg" href="${esc(v.url)}" data-release-link>${tx(t.hero.download)}</a>
            <a class="btn btn--secondary btn--lg" href="#how">${tx(t.hero.how)}</a>
          </div>
          <p class="hero__meta">${withRelease(t.hero.meta, v)}</p>
        </div>
        <div class="hero__dial">
          ${dialSvg(t.hero.dial, t.hero.readout)}
        </div>
      </div>

      <div class="container">
        <figure class="scheme" aria-label="${esc(t.scheme.label)}">
          <div class="scheme__node frame">
            <p class="scheme__title">${tx(t.scheme.siteTitle)}</p>
            <p>${tx(t.scheme.siteText)}</p>
          </div>
          <div class="scheme__link">
            <span class="scheme__label">${tx(t.scheme.link)}</span>
            <span class="scheme__path" aria-hidden="true"><span class="scheme__line"></span>${icon('arrow', 'scheme__arrow')}</span>
          </div>
          <div class="scheme__node scheme__node--phone frame">
            <p class="scheme__title">${tx(t.scheme.phoneTitle)}</p>
            <p>${tx(t.scheme.phoneText)}</p>
          </div>
        </figure>
      </div>
    </section>

    <section class="section" id="how" aria-labelledby="how-title">
      <div class="container section__grid">
        ${head(1, 'how-title', t.how.title)}
        <div class="section__body">
          <ol class="steps">${t.how.steps
            .map(
              (step, i) => `
            <li class="step">
              <span class="step__num" aria-hidden="true">${pad2(i + 1)}</span>
              <h3>${tx(step.title)}</h3>
              <p>${tx(step.text)}</p>
            </li>`,
            )
            .join('')}
          </ol>
          <div class="note">
            <p class="note__label">${tx(t.how.noteLabel)}</p>
            <p><strong>${tx(t.how.noteTitle)}</strong> ${tx(t.how.noteText)}</p>
          </div>
        </div>
      </div>
    </section>

    <section class="section section--alt" id="download" aria-labelledby="download-title">
      <div class="container section__grid">
        ${head(2, 'download-title', t.download.title)}
        <div class="section__body download">
          <div class="download__main frame">
            <p class="status"><span class="status__hatch" aria-hidden="true"></span>${tx(t.download.status)}</p>
            <dl class="specs">
              <div class="specs__row"><dt>${tx(t.download.version)}</dt><dd>${releaseSpan('version', v)}</dd></div>
              <div class="specs__row"><dt>${tx(t.download.system)}</dt><dd>${releaseSpan('system', v)}</dd></div>
              <div class="specs__row"><dt>${tx(t.download.size)}</dt><dd>${releaseSpan('size', v)}</dd></div>
              <div class="specs__row"><dt>${tx(t.download.date)}</dt><dd><time datetime="${esc(v.dateISO)}" data-release="date">${esc(v.date)}</time></dd></div>
              <div class="specs__row" data-requires="sha256"${v.sha256 ? '' : ' hidden'}><dt>${tx(t.download.sha256)}</dt><dd><code class="hash" data-release="sha256">${esc(v.sha256)}</code></dd></div>
            </dl>
            <div class="download__cta">
              <a class="btn btn--primary btn--lg" href="${esc(v.url)}" data-release-link>${tx(t.download.button)}</a>
              <p class="download__file">${withRelease(t.download.file, v)}</p>
            </div>
            <p class="download__note">${tx(t.download.note)} <a href="#faq-verify">${tx(t.download.verify)}</a></p>
          </div>

          <aside class="download__other" id="get-on-phone" aria-labelledby="other-title">
            <h3 id="other-title">${tx(t.download.otherTitle)}</h3>
            <p class="download__ios">${tx(t.download.iosNote)}</p>
            <p>${tx(t.download.otherText)}</p>
            <div class="qr frame">
              ${qrSvg(downloadPage, t.download.qrLabel)}
            </div>
            <p class="qr__url">${esc(qrText)}</p>
            <div class="share">
              <button class="btn btn--secondary btn--sm" type="button" data-share hidden><span data-share-label>${tx(t.download.shareDesktop)}</span></button>
              <p class="share__status" data-share-status role="status" aria-live="polite"></p>
            </div>
          </aside>
        </div>
      </div>
    </section>

    <section class="section" id="about" aria-labelledby="about-title">
      <div class="container section__grid">
        ${head(3, 'about-title', t.about.title)}
        <div class="section__body prose">
          ${t.about.paragraphs.map((p) => `<p>${tx(p)}</p>`).join('\n          ')}
          <h3>${tx(t.about.audienceTitle)}</h3>
          <dl class="audience">${t.about.audience
            .map(
              (a) => `
            <div class="audience__row"><dt>${tx(a.title)}</dt><dd>${tx(a.text)}</dd></div>`,
            )
            .join('')}
          </dl>
          <div class="note note--muted">
            <p class="note__label">${tx(t.about.disclaimerLabel)}</p>
            <p>${tx(t.about.disclaimer)}</p>
          </div>
        </div>
      </div>
    </section>

    <section class="section" id="faq" aria-labelledby="faq-title">
      <div class="container section__grid">
        ${head(4, 'faq-title', t.faq.title)}
        <div class="section__body faq">${faqItems}
        </div>
      </div>
    </section>

    <section class="section" id="contacts" aria-labelledby="contacts-title">
      <div class="container section__grid">
        ${head(5, 'contacts-title', t.contacts.title)}
        <div class="section__body">
          <p class="section__lead">${tx(t.contacts.lead)}</p>
          <dl class="contacts">${
            telegram
              ? `
            <div class="contacts__row"><dt>${tx(t.contacts.telegram)}</dt><dd><a href="${esc(telegram)}" rel="noopener noreferrer">${esc(telegramHandle(telegram))}</a></dd></div>`
              : ''
          }${
            email
              ? `
            <div class="contacts__row"><dt>${tx(t.contacts.email)}</dt><dd><a href="${esc(mailto(email, t.contacts.emailSubject))}">${esc(email)}</a></dd></div>`
              : ''
          }
          </dl>
        </div>
      </div>
    </section>
  </main>

  <footer class="footer">
    <div class="container footer__inner">
      <p class="footer__copy">${fill(t.footer.copyright, { year, name: config.name })}</p>
      <nav class="footer__nav" aria-label="${esc(t.nav.label)}"><ul>${footerList}</ul></nav>
    </div>
  </footer>

  <script type="application/json" id="site-data">${jsonBlock(siteData)}</script>
</body>
</html>
`;
}
