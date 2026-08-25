/**
 * render.mjs — HTML component library.
 *
 * Plain template literals, no framework. Every helper returns an HTML string.
 * Escaping is applied at the point of interpolation, never assumed upstream:
 * all model output is treated as untrusted text.
 */

import { TRANSMISSION_CHANNELS } from './prompt.mjs';

export function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function attr(s) {
  return esc(s).replace(/\n/g, ' ');
}

const ICONS = {
  today: '<path d="M3 5h13a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5Z"/><path d="M18 8h2a1 1 0 0 1 1 1v9a2 2 0 0 1-2 2"/><path d="M7 9h6M7 13h6M7 17h4"/>',
  lenses: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m21 21-5.6-5.6"/><path d="M8 10.5h5M10.5 8v5"/>',
  calls: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1"/>',
  archive: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
  method: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H19v15H6.5A2.5 2.5 0 0 0 4 20.5Z"/><path d="M4 20.5A2.5 2.5 0 0 1 6.5 18H19v3H6.5A2.5 2.5 0 0 1 4 20.5Z"/><path d="M8 8h7M8 12h5"/>',
};

const TABS = [
  { href: '/',           key: 'today',   label: 'Today' },
  { href: '/lens/',      key: 'lenses',  label: 'Lenses' },
  { href: '/scorecard/', key: 'calls',   label: 'Scorecard' },
  { href: '/archive/',   key: 'archive', label: 'Archive' },
  { href: '/method/',    key: 'method',  label: 'Method' },
];

function tabbar(active) {
  return `<nav class="tabbar" aria-label="Primary">
  <div class="tabbar-inner">
    ${TABS.map((t) => `<a class="tab${t.key === active ? ' active' : ''}" href="${t.href}"${t.key === active ? ' aria-current="page"' : ''}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[t.key]}</svg>
      <span>${t.label}</span>
    </a>`).join('\n    ')}
  </div>
</nav>`;
}

export const BRAND_MARK = `<svg class="brand-mark" viewBox="0 0 32 32" fill="none" aria-hidden="true">
  <circle cx="14" cy="14" r="9.5" stroke="#e9a13b" stroke-width="2.4"/>
  <path d="M9.5 16.5 12.5 12l3 3.2L19 8.5" stroke="#e9eef7" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="m21.5 21.5 6 6" stroke="#e9a13b" stroke-width="3" stroke-linecap="round"/>
</svg>`;

/* --------------------------------------------------------------- Tape */

export function renderTape(snapshot) {
  const quotes = snapshot?.quotes || [];
  if (!quotes.length) return '';
  const order = ['equities', 'rates', 'fx', 'commodities', 'vol', 'credit'];
  const sorted = [...quotes].sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group));
  return `<div class="tape" role="region" aria-label="Market levels">
  <div class="tape-inner">
    ${sorted.map((q) => {
      const dir = q.change === null || q.change === undefined ? 'flat' : q.change > 0 ? 'up' : q.change < 0 ? 'down' : 'flat';
      return `<div class="tick">
      <div class="tick-label">${esc(q.label)}</div>
      <div class="tick-value">${esc(q.display)}</div>
      <div class="tick-chg ${dir}">${esc(q.changeDisplay || '—')}</div>
    </div>`;
    }).join('\n    ')}
  </div>
</div>`;
}

/* ------------------------------------------------------------- Layout */

export function layout({ title, description, activeTab, body, snapshot, dateLabel, canonical, siteUrl, showTape = true, generatedAt = '' }) {
  const fullTitle = title === 'MarketLens' ? 'MarketLens — what today’s news does to markets' : `${title} · MarketLens`;
  const url = canonical ? `${siteUrl}${canonical}` : siteUrl;
  return `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${attr(description)}">
<meta name="theme-color" content="#080b11">
<meta name="color-scheme" content="dark">
<link rel="canonical" href="${attr(url)}">
<link rel="stylesheet" href="/styles.css">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="icon" href="/icons/icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/icons/icon-180.png">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="MarketLens">
<meta property="og:type" content="website">
<meta property="og:site_name" content="MarketLens">
<meta property="og:title" content="${attr(fullTitle)}">
<meta property="og:description" content="${attr(description)}">
<meta property="og:url" content="${attr(url)}">
<meta property="og:image" content="${attr(siteUrl)}/icons/og.png">
<meta name="twitter:card" content="summary_large_image">
</head>
<body>
<header class="masthead">
  <div class="masthead-inner">
    <a class="brand" href="/">${BRAND_MARK}<span>Market<em>Lens</em></span></a>
    <div class="masthead-meta">
      <div><span class="live-dot"></span>${esc(dateLabel || '')}</div>
      <div>what the news does to markets</div>
    </div>
  </div>
</header>
${showTape ? renderTape(snapshot) : ''}
<main>
  <div class="wrap">
${body}
    <footer class="foot">
      <p>MarketLens is an independent research project built by Jonathan Savill. Stories are picked by a transparent scoring model and analysed against a fixed framework for tracing knock-on effects. <a href="/method/">How it works</a>.</p>
      <p class="disclaimer">Not investment advice. Nothing here is a recommendation to buy or sell anything. Analysis is model-generated and may contain errors. Market data is delayed and shown for context only.</p>
    </footer>
  </div>
</main>
${tabbar(activeTab)}
<script>window.__ML_GENERATED__=${JSON.stringify(generatedAt || '')};</script>
<script src="/app.js" defer></script>
</body>
</html>`;
}

/* --------------------------------------------------------- Story pieces */

const DIRECTION = {
  up:      { arrow: '▲', cls: 'up',   word: 'higher' },
  down:    { arrow: '▼', cls: 'down', word: 'lower' },
  wider:   { arrow: '▲', cls: 'down', word: 'wider' },
  tighter: { arrow: '▼', cls: 'up',   word: 'tighter' },
  steeper: { arrow: '◤', cls: 'up',   word: 'steeper' },
  flatter: { arrow: '◣', cls: 'down', word: 'flatter' },
  mixed:   { arrow: '◆', cls: 'flat', word: 'mixed' },
};

export function directionMeta(d) {
  return DIRECTION[String(d || '').toLowerCase()] || DIRECTION.mixed;
}

export const ASSET_LABEL = {
  rates: 'Government bonds', fx: 'Currencies', equities: 'Shares',
  credit: 'Corporate debt', commodities: 'Commodities', vol: 'Market volatility',
};

/** Short form for chips and tabs where the long name will not fit. */
export const ASSET_SHORT = {
  rates: 'Bonds', fx: 'Currencies', equities: 'Shares',
  credit: 'Credit', commodities: 'Commodities', vol: 'Volatility',
};

const PRICED_IN_LABEL = {
  expected: 'Market expected this',
  'partly-priced': 'Partly expected',
  'partially-priced': 'Partly expected',
  anticipated: 'Market expected this',
  surprise: 'Caught the market out',
};

export function pricedInLabel(v) {
  return PRICED_IN_LABEL[String(v || '').toLowerCase()] || v || '';
}

function convictionDots(n) {
  const v = Math.max(0, Math.min(5, Number(n) || 0));
  return `<span class="conviction" title="Confidence ${v} out of 5" aria-label="Confidence ${v} out of 5">${
    Array.from({ length: 5 }, (_, i) => `<i class="${i < v ? 'on' : ''}"></i>`).join('')
  }</span>`;
}

/**
 * One asset impact. Plain sentence leads; the desk-language mechanism sits
 * underneath in smaller type for readers who want it.
 */
export function renderImpact(impact, { showClass = true } = {}) {
  const d = directionMeta(impact.direction);
  return `<div class="impact">
  <div class="impact-top">
    <span class="impact-instrument">${esc(impact.instrument)}</span>
    <span class="impact-move ${d.cls}"><span class="arrow">${d.arrow}</span>${esc(impact.magnitude || d.word)}</span>
  </div>
  ${impact.plain ? `<p class="impact-plain">${esc(impact.plain)}</p>` : ''}
  ${impact.detail ? `<p class="impact-detail"><b>Mechanism</b> ${esc(impact.detail)}</p>` : ''}
  <div class="impact-foot">
    <span class="chip${impact.order === 2 ? ' chip--accent' : ''}">${impact.order === 2 ? 'Knock-on effect' : 'Direct effect'}</span>
    ${showClass ? `<span class="chip chip--mono">${esc(ASSET_SHORT[impact.assetClass] || impact.assetClass)}</span>` : ''}
    <span class="chip chip--mono">${esc(impact.horizon || '')}</span>
    ${convictionDots(impact.conviction)}
  </div>
</div>`;
}

/**
 * One chain of consequence. This is the "flow": event, then each link caused
 * by the one before it, then where it lands.
 */
export function renderChain(chain, index) {
  const meta = TRANSMISSION_CHANNELS[chain.channel] || { name: String(chain.channel || '').replace(/-/g, ' '), plain: '' };
  return `<div class="chain">
  <div class="chain-head">
    <span class="chain-index">${index + 1}</span>
    <span class="chain-name">${esc(meta.name)}</span>
    <span class="chip chip--mono">${esc(chain.strength || '')}</span>
  </div>
  ${meta.plain ? `<p class="chain-what">${esc(meta.plain)}</p>` : ''}
  <ol class="chain-steps">
    ${(chain.links || []).map((l) => `<li>
      <span class="link-plain">${esc(l.plain)}</span>
      ${l.detail ? `<span class="link-detail">${esc(l.detail)}</span>` : ''}
    </li>`).join('\n    ')}
  </ol>
  ${chain.endpoint ? `<div class="chain-endpoint"><b>Ends up hitting</b>${esc(chain.endpoint)}</div>` : ''}
</div>`;
}

export function renderStoryCard(story, { href }) {
  const impacts = story.assetImpacts || [];
  const classes = [...new Set(impacts.map((i) => i.assetClass))];
  const second = impacts.filter((i) => i.order === 2).length;
  const priced = String(story.classification?.pricedIn || '').toLowerCase();
  return `<a class="card" href="${attr(href)}">
  <div class="card-top">
    <span class="rank">${esc(story.rank)}</span>
    ${priced === 'surprise' ? '<span class="chip chip--accent">Caught the market out</span>'
      : priced.startsWith('part') ? '<span class="chip">Partly expected</span>'
      : '<span class="chip">Market expected this</span>'}
  </div>
  <h3>${esc(story.headline)}</h3>
  <div class="standfirst">${esc(story.standfirst)}</div>
  <div class="card-foot">
    <div class="chips">${classes.map((c) => `<span class="chip chip--mono">${esc(ASSET_SHORT[c] || c)}</span>`).join('')}</div>
    <span class="meta" style="margin-left:auto">${second} knock-on</span>
  </div>
</a>`;
}

/* ------------------------------------------------------------ Ask box */

/**
 * Per-story question box. Progressive enhancement: without JavaScript it is a
 * plain form that explains itself; with JavaScript it posts to /api/ask.
 */
export function renderAskBox(story) {
  const suggestions = [
    'Explain this like I know nothing about markets',
    'Why does this affect bonds?',
    'What is the simplest way to think about this?',
    'What would make this analysis wrong?',
  ];
  return `<section class="ask" id="ask" data-story="${attr(story.id)}">
  <div class="ask-head">
    <h3>Ask about this story</h3>
    <p>Questions are answered from this story's analysis. Ask for a simpler explanation, or push on anything that does not add up.</p>
  </div>
  <div class="ask-suggest">
    ${suggestions.map((s) => `<button type="button" class="ask-chip">${esc(s)}</button>`).join('\n    ')}
  </div>
  <form class="ask-form" autocomplete="off">
    <label class="visually-hidden" for="ask-input-${attr(story.id)}">Your question</label>
    <textarea id="ask-input-${attr(story.id)}" class="ask-input" rows="2" maxlength="500"
      placeholder="e.g. why would cheaper oil push bond yields down?"></textarea>
    <div class="ask-actions">
      <span class="ask-count"><span class="n">0</span>/500</span>
      <button type="submit" class="ask-send">Ask</button>
    </div>
  </form>
  <div class="ask-answer" hidden aria-live="polite"></div>
</section>`;
}

/* --------------------------------------------------------------- Glossary */

export function renderGlossary(terms) {
  if (!terms || !terms.length) return '';
  return `<details class="glossary">
  <summary><span>Jargon buster</span><span class="g-count">${terms.length} terms</span></summary>
  <dl>
    ${terms.map((t) => `<dt>${esc(t.term)}</dt><dd>${esc(t.plain)}</dd>`).join('\n    ')}
  </dl>
</details>`;
}
