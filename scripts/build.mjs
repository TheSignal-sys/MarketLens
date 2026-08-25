#!/usr/bin/env node
/**
 * build.mjs — static site generator.
 *
 * Reads data/*.json and writes a complete static site to dist/.
 * No framework, no dependencies, no client-side data fetching: every page is
 * plain HTML that renders instantly and works offline once cached.
 *
 *   node scripts/build.mjs
 */

import { readFile, writeFile, mkdir, cp, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { loadEnv } from './lib/env.mjs';
import {
  esc, attr, layout, renderStoryCard, renderImpact, renderChain,
  renderAskBox, renderGlossary, pricedInLabel, ASSET_LABEL, ASSET_SHORT,
} from './lib/render.mjs';
import { summarise } from './lib/scorecard.mjs';
import { TRANSMISSION_CHANNELS } from './lib/prompt.mjs';

loadEnv();

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = join(ROOT, 'data');
const SITE = join(ROOT, 'site');
const DIST = join(ROOT, 'dist');

const SITE_URL = (process.env.SITE_URL || 'https://marketlens.app').replace(/\/$/, '');

/** Maximum points each materiality component can contribute — see rank.mjs. */
const COMPONENT_MAX = { corroboration: 30, authority: 20, breadth: 20, salience: 20, recency: 10 };

const COMPONENT_LABEL = {
  corroboration: 'How many outlets ran it',
  authority: 'How authoritative the source is',
  breadth: 'How many markets it touches',
  salience: 'How market-relevant the language is',
  recency: 'How fresh it is',
};

async function readJson(path, fallback = null) {
  try { return JSON.parse(await readFile(path, 'utf8')); } catch { return fallback; }
}

async function writePage(route, html) {
  const dir = route === '/' ? DIST : join(DIST, route.replace(/^\/|\/$/g, ''));
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'index.html'), html);
}

/* ============================================================ Today page */

function todayPage(data, { canonical = '/', isArchive = false } = {}) {
  const stories = data.stories || [];
  const read = data.marketRead || {};
  const storyHref = (s) => (isArchive ? `/archive/${data.date}/${s.id}/` : `/story/${s.id}/`);

  const body = `
    ${isArchive ? `<a class="back" href="/archive/">← Archive</a>` : ''}
    <section class="read">
      <div class="read-kicker">Today's read · ${esc(data.dateLabel)}</div>
      <h1>${esc(read.headline || 'Today in markets')}</h1>
      <div class="read-body">${esc(read.body || '')}</div>
      ${read.regime ? `<div class="read-regime">The mood right now · <b>${esc(read.regime)}</b></div>` : ''}
    </section>

    <div class="section-head">
      <h2>Stories that matter</h2>
      <span class="rule"></span>
      <span class="count">${stories.length}</span>
    </div>
    <div class="cards">
      ${stories.map((s) => renderStoryCard(s, { href: storyHref(s) })).join('\n      ')}
    </div>

    ${data.scorecardSummary && data.scorecardSummary.settled ? `
    <div class="section-head">
      <h2>Has it been right?</h2>
      <span class="rule"></span>
      <a class="count" href="/scorecard/">see all →</a>
    </div>
    <div class="stat-grid">
      <div class="stat"><div class="stat-value ${data.scorecardSummary.hitRate >= 50 ? 'up' : 'down'}">${data.scorecardSummary.hitRate ?? '—'}%</div><div class="stat-label">Called right</div></div>
      <div class="stat"><div class="stat-value">${data.scorecardSummary.settled}</div><div class="stat-label">Finished</div></div>
      <div class="stat"><div class="stat-value">${data.scorecardSummary.open}</div><div class="stat-label">Still running</div></div>
    </div>` : ''}
  `;

  return layout({
    title: isArchive ? data.dateLabel : 'MarketLens',
    description: read.body?.slice(0, 175) || 'What today’s financial news actually does to markets, traced step by step.',
    activeTab: isArchive ? 'archive' : 'today',
    body,
    snapshot: data.snapshot,
    dateLabel: data.dateLabel,
    canonical,
    siteUrl: SITE_URL, generatedAt: data.generatedAt,
  });
}

/* ============================================================ Story page */

function storyPage(story, data, { basePath }) {
  const impacts = story.assetImpacts || [];
  const c = story.classification || {};
  const m = story.materiality || {};
  const wh = story.whatHappened || {};
  const miss = story.whatMarketMisses || {};

  // Stage 3 reads far better grouped by asset class than as one long list.
  const grouped = {};
  for (const i of impacts) (grouped[i.assetClass] ||= []).push(i);
  for (const list of Object.values(grouped)) {
    list.sort((a, b) => (a.order || 1) - (b.order || 1) || (b.conviction || 0) - (a.conviction || 0));
  }
  const groupOrder = ['rates', 'fx', 'equities', 'credit', 'commodities', 'vol']
    .filter((k) => grouped[k]);

  const body = `
    <a class="back" href="${attr(basePath)}">← ${esc(data.dateLabel)}</a>

    <div class="story-head">
      <div class="chips">
        <span class="chip chip--accent">#${esc(story.rank)} today</span>
        <span class="chip">${esc(pricedInLabel(c.pricedIn))}</span>
        <span class="chip chip--mono">${esc(String(c.eventType || '').replace(/-/g, ' '))}</span>
      </div>
      <h1>${esc(story.headline)}</h1>
      <div class="standfirst">${esc(story.standfirst)}</div>
    </div>

    <!-- The three-stage flow. The numbered spine is the product. -->
    <ol class="flow-nav" aria-label="How this analysis is structured">
      <li><a href="#stage-1"><b>1</b> What happened</a></li>
      <li><a href="#stage-2"><b>2</b> How it spreads</a></li>
      <li><a href="#stage-3"><b>3</b> What it means</a></li>
    </ol>

    <section class="stage" id="stage-1">
      <div class="stage-head"><span class="stage-num">1</span><h2>What happened</h2></div>
      <div class="panel">
        <p class="lead-text">${esc(wh.plain || '')}</p>
        ${wh.whyItMatters ? `<div class="why-matters"><b>Why it matters</b>${esc(wh.whyItMatters)}</div>` : ''}
        ${wh.detail ? `<p class="impact-detail"><b>Market context</b> ${esc(wh.detail)}</p>` : ''}
        ${c.pricedInRationale ? `<p class="impact-detail"><b>Already priced in?</b> ${esc(c.pricedInRationale)}</p>` : ''}
      </div>
    </section>

    ${(story.chains || []).length ? `
    <section class="stage" id="stage-2">
      <div class="stage-head"><span class="stage-num">2</span><h2>How it spreads</h2></div>
      <p class="stage-intro">Each step below is caused by the step above it. The first effect is obvious and already reflected in prices. The ones after it usually are not.</p>
      <div class="panel">
        ${story.chains.map(renderChain).join('\n        ')}
      </div>
    </section>` : ''}

    ${groupOrder.length ? `
    <section class="stage" id="stage-3">
      <div class="stage-head"><span class="stage-num">3</span><h2>What it means for each market</h2></div>
      ${groupOrder.map((k) => `
      <div class="panel">
        <div class="panel-title">${esc(ASSET_LABEL[k] || k)}</div>
        ${grouped[k].map((i) => renderImpact(i, { showClass: false })).join('\n        ')}
      </div>`).join('\n      ')}
    </section>` : ''}

    ${miss.plain ? `
    <div class="callout callout-edge">
      <h4>What the market may be missing</h4>
      <p>${esc(miss.plain)}</p>
      ${miss.detail ? `<p class="impact-detail" style="margin-top:10px">${esc(miss.detail)}</p>` : ''}
    </div>` : ''}

    ${(story.tradeExpression || []).length ? `
    <div class="panel">
      <div class="panel-title">How you would act on it</div>
      ${story.tradeExpression.map((t) => `<div class="trade">
        <h5>${esc(t.idea)}</h5>
        <p>${esc(t.plain || '')}</p>
        ${t.instrument ? `<div class="instrument">${esc(t.instrument)}</div>` : ''}
        <div class="risk"><b>How it loses money:</b> ${esc(t.risk)}</div>
      </div>`).join('\n      ')}
    </div>` : ''}

    ${(story.falsifiers || []).length ? `
    <div class="callout callout-falsify">
      <h4>What would prove this wrong</h4>
      <ul class="tick-list">${story.falsifiers.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>
    </div>` : ''}

    ${(story.watchNext || []).length ? `
    <div class="panel">
      <div class="panel-title">What to watch next</div>
      <ul class="tick-list watch">${story.watchNext.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>
    </div>` : ''}

    ${renderGlossary(story.glossary)}

    ${renderAskBox(story)}

    <details class="glossary">
      <summary><span>Why this story was picked</span><span class="g-count">score ${esc(m.score ?? '—')}</span></summary>
      <div style="padding-top:6px">
        <p class="impact-plain" style="margin-bottom:14px">${esc(story.editorNote || '')}</p>
        ${m.components ? Object.entries(m.components).map(([k, v]) => `<div class="bar-row">
          <div class="bar-top"><span class="k">${esc(COMPONENT_LABEL[k] || k)}</span><span class="v">${esc(v)} / ${COMPONENT_MAX[k] ?? 20}</span></div>
          <div class="bar"><i style="width:${Math.min(100, (Number(v) / (COMPONENT_MAX[k] ?? 20)) * 100).toFixed(0)}%"></i></div>
        </div>`).join('\n        ') : ''}
      </div>
    </details>

    ${(story.links || []).length ? `
    <div class="panel">
      <div class="panel-title">Where this came from</div>
      ${story.links.map((l) => `<a class="source-link" href="${attr(l.url)}" target="_blank" rel="noopener noreferrer nofollow">
        <span class="name">${esc(l.name)}</span><span class="t">${esc(l.title)}</span>
      </a>`).join('\n      ')}
    </div>` : ''}
  `;

  return layout({
    title: story.headline,
    description: story.standfirst || '',
    activeTab: basePath === '/' ? 'today' : 'archive',
    body,
    snapshot: data.snapshot,
    dateLabel: data.dateLabel,
    canonical: basePath === '/' ? `/story/${story.id}/` : `${basePath}${story.id}/`,
    siteUrl: SITE_URL, generatedAt: data.generatedAt,
  });
}

/* ============================================================= Lens pages */

function lensIndexPage(data) {
  const classes = Object.keys(ASSET_LABEL);
  const counts = {};
  for (const s of data.stories || []) {
    for (const i of s.assetImpacts || []) counts[i.assetClass] = (counts[i.assetClass] || 0) + 1;
  }
  const body = `
    <div class="section-head"><h2>By market</h2><span class="rule"></span></div>
    <p class="stage-intro">Every effect identified today, regrouped by the market it lands in rather than by the story it came from.</p>
    <div class="cards">
      ${classes.map((c) => `<a class="card" href="/lens/${c}/">
        <div class="card-top"><span class="chip chip--accent">${esc(ASSET_LABEL[c])}</span></div>
        <h3 style="font-size:15px">${counts[c] || 0} effect${counts[c] === 1 ? '' : 's'} today</h3>
      </a>`).join('\n      ')}
    </div>`;
  return layout({
    title: 'By market',
    description: 'Today’s market effects grouped by asset class: bonds, currencies, shares, corporate debt, commodities and volatility.',
    activeTab: 'lenses', body, snapshot: data.snapshot, dateLabel: data.dateLabel,
    canonical: '/lens/', siteUrl: SITE_URL, generatedAt: data.generatedAt,
  });
}

function lensPage(cls, data) {
  const rows = [];
  for (const s of data.stories || []) {
    for (const i of s.assetImpacts || []) if (i.assetClass === cls) rows.push({ impact: i, story: s });
  }
  rows.sort((a, b) => (b.impact.conviction || 0) - (a.impact.conviction || 0));

  const body = `
    <a class="back" href="/lens/">← All markets</a>
    <div class="section-head"><h2>${esc(ASSET_LABEL[cls])}</h2><span class="rule"></span><span class="count">${rows.length}</span></div>
    ${rows.length ? rows.map(({ impact, story }) => `
      <div class="panel">
        ${renderImpact(impact, { showClass: false })}
        <a class="source-link" href="/story/${attr(story.id)}/" style="border-bottom:none;padding-bottom:0">
          <span class="name">#${esc(story.rank)}</span><span class="t">${esc(story.headline)}</span>
        </a>
      </div>`).join('\n')
      : '<div class="empty">Nothing flagged for this market today.</div>'}
  `;
  return layout({
    title: ASSET_LABEL[cls],
    description: `How today's news affects ${ASSET_LABEL[cls].toLowerCase()}.`,
    activeTab: 'lenses', body, snapshot: data.snapshot, dateLabel: data.dateLabel,
    canonical: `/lens/${cls}/`, siteUrl: SITE_URL, generatedAt: data.generatedAt,
  });
}

/* ======================================================== Scorecard page */

function scorecardPage(scorecard, data) {
  const stats = summarise(scorecard);
  const calls = [...(scorecard.calls || [])].reverse();
  const open = calls.filter((c) => c.status === 'open');
  const settled = calls.filter((c) => c.status !== 'open');

  // A worked example makes the page self-explanatory to a first-time visitor.
  const example = settled.find((c) => c.status === 'hit') || settled[0] || null;

  const callRow = (c) => {
    const moveCls = c.moveAbs === undefined ? 'flat' : (c.moveAbs > 0) === (c.direction === 'up') ? 'up' : 'down';
    const verdict = { hit: 'Right', miss: 'Wrong', flat: 'Barely moved', open: 'Running' }[c.status] || c.status;
    return `<div class="call">
      <span class="status ${esc(c.status)}" aria-hidden="true"></span>
      <span class="body">
        <span class="l">${esc(c.instrumentLabel)} to go ${esc(c.direction === 'up' ? 'up' : 'down')} <span class="muted" style="font-weight:400">${esc(c.magnitude || '')}</span></span>
        <span class="s">${esc(verdict)} · from ${esc(c.entryDisplay)} · ${esc(c.horizon)} view · confidence ${esc(c.conviction)}/5</span>
      </span>
      <span class="move ${moveCls}">${esc(c.moveDisplay || '—')}</span>
    </div>`;
  };

  const body = `
    <div class="section-head"><h2>Scorecard</h2><span class="rule"></span></div>

    <section class="explainer">
      <h3>What this page is</h3>
      <p>Most market commentary never gets marked. This does. Whenever the analysis says a market should move in a particular direction with reasonable confidence, that prediction is written down along with the price at the time. When its time is up, it gets compared against what actually happened and scored right or wrong.</p>
      <p>Nothing here is edited afterwards. The misses stay on the page.</p>
      ${example ? `
      <div class="worked">
        <div class="worked-label">For example</div>
        <ol class="worked-steps">
          <li><b>The call.</b> A story predicted <b>${esc(example.instrumentLabel)}</b> would go <b>${esc(example.direction)}</b> by ${esc(example.magnitude || 'some amount')} over ${esc(example.horizon)}.</li>
          <li><b>The starting point.</b> It was at ${esc(example.entryDisplay)} when the call was made.</li>
          <li><b>What happened.</b> It moved ${esc(example.moveDisplay || '—')}.</li>
          <li><b>The verdict.</b> ${example.status === 'hit' ? 'Right direction, so it counts as a hit.' : example.status === 'miss' ? 'Wrong direction, so it counts as a miss.' : 'Too small a move to count either way.'}</li>
        </ol>
      </div>` : ''}
      <p class="fineprint">Moves smaller than 3 basis points (bonds and credit) or 0.3% (everything else) count as "barely moved" and are left out of the percentage, so the score is not flattered by noise.</p>
    </section>

    <div class="stat-grid">
      <div class="stat"><div class="stat-value ${(stats.hitRate ?? 0) >= 50 ? 'up' : 'down'}">${stats.hitRate ?? '—'}${stats.hitRate === null ? '' : '%'}</div><div class="stat-label">Called right</div></div>
      <div class="stat"><div class="stat-value up">${stats.hits}</div><div class="stat-label">Right</div></div>
      <div class="stat"><div class="stat-value down">${stats.misses}</div><div class="stat-label">Wrong</div></div>
      <div class="stat"><div class="stat-value">${stats.open}</div><div class="stat-label">Running</div></div>
      <div class="stat"><div class="stat-value muted">${stats.flat}</div><div class="stat-label">Flat</div></div>
    </div>

    ${Object.keys(stats.byClass).length ? `
    <div class="panel">
      <div class="panel-title">Which markets it reads best</div>
      ${Object.entries(stats.byClass).map(([k, v]) => `<div class="bar-row">
        <div class="bar-top"><span class="k">${esc(ASSET_SHORT[k] || k)}</span><span class="v">${v.hits}/${v.total} · ${v.rate}%</span></div>
        <div class="bar"><i style="width:${v.rate}%"></i></div>
      </div>`).join('\n      ')}
    </div>` : ''}

    ${Object.keys(stats.byConviction).length ? `
    <div class="panel">
      <div class="panel-title">Does confidence mean anything?</div>
      ${Object.entries(stats.byConviction).sort((a, b) => b[0] - a[0]).map(([k, v]) => `<div class="bar-row">
        <div class="bar-top"><span class="k">Confidence ${esc(k)}/5</span><span class="v">${v.hits}/${v.total} · ${v.rate}%</span></div>
        <div class="bar"><i style="width:${v.rate}%"></i></div>
      </div>`).join('\n      ')}
      <p class="fineprint">If the tool has real signal, the calls it was most confident about should be right more often than the ones it hedged on. If they are not, the confidence scale means nothing and this chart will show it.</p>
    </div>` : ''}

    ${open.length ? `
    <div class="section-head"><h2>Still running</h2><span class="rule"></span><span class="count">${open.length}</span></div>
    <div class="panel">${open.slice(0, 40).map(callRow).join('\n')}</div>` : ''}

    ${settled.length ? `
    <div class="section-head"><h2>Finished</h2><span class="rule"></span><span class="count">${settled.length}</span></div>
    <div class="panel">${settled.slice(0, 60).map(callRow).join('\n')}</div>`
    : '<div class="empty">No calls have finished yet. Check back once the first ones run their course.</div>'}
  `;

  return layout({
    title: 'Scorecard',
    description: 'Every market call MarketLens has made, scored against what actually happened. Including the ones it got wrong.',
    activeTab: 'calls', body, snapshot: data.snapshot, dateLabel: data.dateLabel,
    canonical: '/scorecard/', siteUrl: SITE_URL, generatedAt: data.generatedAt,
  });
}

/* ========================================================== Archive page */

function archivePage(index, data) {
  const body = `
    <div class="section-head"><h2>Archive</h2><span class="rule"></span><span class="count">${index.length}</span></div>
    <div class="panel">
      ${index.length ? index.map((e) => `<a class="archive-row" href="/archive/${attr(e.date)}/">
        <span class="date">${esc(e.date.slice(8))} ${esc(new Date(e.date + 'T12:00:00Z').toLocaleDateString('en-GB', { month: 'short' }))}<br><span class="muted">${esc(e.date.slice(0, 4))}</span></span>
        <span class="h">${esc(e.headline)}<span class="r">${esc(e.regime)} · ${esc(e.storyCount)} stories</span></span>
        <span class="arrow-r">→</span>
      </a>`).join('\n      ') : '<div class="empty">No past editions yet.</div>'}
    </div>`;
  return layout({
    title: 'Archive',
    description: 'Every previous edition of MarketLens.',
    activeTab: 'archive', body, snapshot: data.snapshot, dateLabel: data.dateLabel,
    canonical: '/archive/', siteUrl: SITE_URL, generatedAt: data.generatedAt,
  });
}

/* =========================================================== Method page */

function methodPage(data) {
  const channels = Object.entries(TRANSMISSION_CHANNELS);
  const body = `
    <div class="section-head"><h2>How it works</h2><span class="rule"></span></div>
    <div class="prose">
      <p>Financial news tells you an event happened. It rarely tells you the thing that matters: <strong>who else is affected, and how?</strong> The obvious effect is priced within minutes of the headline. The interesting one is two or three steps down the chain, hitting a company nobody has mentioned, or a currency, or a fund forced to sell something unrelated.</p>
      <p>MarketLens traces those chains, every weekday morning, in the same three stages.</p>

      <h3>The three stages</h3>
      <div class="table-scroll"><table>
        <tr><th>Stage</th><th>Question it answers</th></tr>
        <tr><td><b>1. What happened</b></td><td>The event in plain English, and whether the market had already expected it.</td></tr>
        <tr><td><b>2. How it spreads</b></td><td>Each consequence, link by link, with each link caused by the one before it.</td></tr>
        <tr><td><b>3. What it means</b></td><td>The effect on each market, with a direction, a size, a timeframe and a confidence score.</td></tr>
      </table></div>

      <h3>Picking the stories</h3>
      <p>Every morning before the London open, the system reads headlines from ${esc((data.diagnostics?.feeds || []).length)} sources: central banks and statistical agencies, wire services and financial newsrooms, and specialist feeds for each asset class. Around ${esc(data.diagnostics?.articlesIngested || 300)} articles come in on a normal day.</p>
      <p>Near-identical headlines are grouped, so a story carried by eight outlets counts as one event with eight sources rather than eight events. Each group is then scored out of 100:</p>
      <div class="table-scroll"><table>
        <tr><th>What is measured</th><th>Max</th><th>Why it counts</th></tr>
        <tr><td>How many outlets ran it</td><td>30</td><td>The best available signal that something is genuinely important</td></tr>
        <tr><td>How authoritative the source is</td><td>20</td><td>A central bank announcement outranks an aggregator</td></tr>
        <tr><td>How many markets it touches</td><td>20</td><td>Breadth is what makes a story worth a full analysis</td></tr>
        <tr><td>How market-relevant the language is</td><td>20</td><td>Weighted vocabulary, so "tariff" counts for more than "quarterly"</td></tr>
        <tr><td>How fresh it is</td><td>10</td><td>Decays over a 36-hour window</td></tr>
      </table></div>
      <p>This step is deliberately mechanical and cheap. It cuts several hundred headlines down to about 25 before any expensive analysis begins. The score for each published story is shown on its own page, so you can check the working.</p>

      <h3>Tracing the chain</h3>
      <p>Every knock-on effect has to travel through one of eight named routes. That constraint is the whole design. Without it, this kind of analysis drifts into saying markets might be volatile, which is true every day and useful never.</p>
      <div class="table-scroll"><table>
        <tr><th>Route</th><th>What it means</th></tr>
        ${channels.map(([, v]) => `<tr><td><b>${esc(v.name)}</b></td><td>${esc(v.plain)}</td></tr>`).join('\n        ')}
      </table></div>

      <h3>Two versions of everything</h3>
      <p>Each claim is written twice. The plain version explains what it means to someone who reads the news but does not work in markets. Underneath sits the same point in the language a trading desk would use, with the exact mechanism. Neither reader has to put up with the other's version.</p>

      <h3>Being marked</h3>
      <p>Whenever the analysis makes a confident directional call, it is logged with the market price at that moment and scored against what actually happened once its timeframe is up. The <a href="/scorecard/">scorecard</a> shows the record, including every miss, broken down by market and by how confident the call was. If the confident calls are not more accurate than the hedged ones, the confidence scale is meaningless, and that will be visible on the page rather than hidden.</p>

      <h3>What it cannot do</h3>
      <ul>
        <li>The analysis is generated by a language model. It reasons well about how things connect and badly about precise numbers, which is why every size is a range and no figure is presented as a data point.</li>
        <li>It reads only freely available sources. Paywalled reporting and real-time wire services are not included.</li>
        <li>Market data is delayed. It is used for context and for scoring, never for trading.</li>
        <li>It runs once a day. This is a way of thinking about how news travels, not a live trading signal.</li>
      </ul>

      <h3>Who built it</h3>
      <p>Jonathan Savill. MarketLens is an independent project, built to develop and demonstrate a structured way of reading cross-asset news. The whole pipeline, from reading the feeds to scoring the calls to rendering this page, is custom-built with no third-party code.</p>
    </div>`;
  return layout({
    title: 'How it works',
    description: 'How MarketLens picks stories, traces knock-on effects through eight named routes, and scores its own record.',
    activeTab: 'method', body, snapshot: data.snapshot, dateLabel: data.dateLabel,
    canonical: '/method/', siteUrl: SITE_URL, generatedAt: data.generatedAt,
  });
}

/* ================================================================= Build */

async function main() {
  const started = Date.now();
  const data = await readJson(join(DATA, 'latest.json'));
  if (!data) {
    console.error('No data/latest.json found. Run: node scripts/pipeline.mjs  (or npm run seed for demo data)');
    process.exit(1);
  }
  const scorecard = await readJson(join(DATA, 'scorecard.json'), { calls: [] });
  const archiveIndex = await readJson(join(DATA, 'archive', 'index.json'), []);

  await mkdir(DIST, { recursive: true });
  await cp(SITE, DIST, { recursive: true });

  const routes = ['/'];

  await writePage('/', todayPage(data));
  for (const story of data.stories || []) {
    await writePage(`/story/${story.id}/`, storyPage(story, data, { basePath: '/' }));
    routes.push(`/story/${story.id}/`);
  }

  await writePage('/lens/', lensIndexPage(data));
  routes.push('/lens/');
  for (const cls of Object.keys(ASSET_LABEL)) {
    await writePage(`/lens/${cls}/`, lensPage(cls, data));
    routes.push(`/lens/${cls}/`);
  }

  await writePage('/scorecard/', scorecardPage(scorecard, data));
  await writePage('/archive/', archivePage(archiveIndex, data));
  await writePage('/method/', methodPage(data));
  routes.push('/scorecard/', '/archive/', '/method/');

  // Archived editions
  const archiveDir = join(DATA, 'archive');
  let archived = 0;
  if (existsSync(archiveDir)) {
    const files = (await readdir(archiveDir)).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f));
    for (const file of files.sort().reverse().slice(0, 120)) {
      const day = await readJson(join(archiveDir, file));
      if (!day) continue;
      const base = `/archive/${day.date}/`;
      await writePage(base, todayPage(day, { canonical: base, isArchive: true }));
      routes.push(base);
      for (const story of day.stories || []) {
        await writePage(`${base}${story.id}/`, storyPage(story, day, { basePath: base }));
      }
      archived += 1;
    }
  }

  // Machine-readable data, served statically at /data/. The /api/ask function
  // fetches these to ground its answers, so they must ship with the site.
  await cp(DATA, join(DIST, 'data'), { recursive: true });

  await writeFile(join(DIST, 'robots.txt'), `User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /data/\n\nSitemap: ${SITE_URL}/sitemap.xml\n`);
  await writeFile(
    join(DIST, 'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${
      [...new Set(routes)].map((r) => `  <url><loc>${SITE_URL}${r}</loc><lastmod>${data.date}</lastmod></url>`).join('\n')
    }\n</urlset>\n`,
  );

  await writeFile(join(DIST, '404.html'), layout({
    title: 'Not found', description: 'Page not found.', activeTab: 'today',
    body: '<div class="empty">That page does not exist.<br><br><a class="chip chip--accent" href="/">Back to today</a></div>',
    snapshot: data.snapshot, dateLabel: data.dateLabel, canonical: '/404', siteUrl: SITE_URL,
    generatedAt: data.generatedAt, showTape: false,
  }));

  console.log(`Built ${routes.length} routes (+${archived} archived editions) in ${Date.now() - started}ms → dist/`);
}

main().catch((err) => { console.error(err); process.exit(1); });
