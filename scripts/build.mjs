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
  esc, attr, layout, renderStoryCard, renderImpact, renderChain, ASSET_LABEL,
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
      <div class="read-kicker">The read · ${esc(data.dateLabel)}</div>
      <h1>${esc(read.headline || 'Today in markets')}</h1>
      <div class="read-body">${esc(read.body || '')}</div>
      ${read.regime ? `<div class="read-regime">Regime · <b>${esc(read.regime)}</b></div>` : ''}
    </section>

    <div class="section-head">
      <h2>Stories that matter</h2>
      <span class="rule"></span>
      <span class="count">${stories.length}</span>
    </div>
    <div class="cards">
      ${stories.map((s) => renderStoryCard(s, { href: storyHref(s) })).join('\n      ')}
    </div>

    ${(data.rejected || []).length ? `
    <div class="section-head">
      <h2>Considered and rejected</h2>
      <span class="rule"></span>
    </div>
    <div class="panel">
      <div class="panel-title">Why these did not make the cut</div>
      ${data.rejected.slice(0, 6).map((r) => `<div class="source-link">
        <span class="name">${esc(String(r.score))}</span>
        <span class="t"><strong style="color:var(--text)">${esc(r.title)}</strong><br>${esc(r.why)}</span>
      </div>`).join('\n      ')}
    </div>` : ''}

    ${data.scorecardSummary && data.scorecardSummary.settled ? `
    <div class="section-head">
      <h2>Track record</h2>
      <span class="rule"></span>
      <a class="count" href="/scorecard/">view all →</a>
    </div>
    <div class="stat-grid">
      <div class="stat"><div class="stat-value ${data.scorecardSummary.hitRate >= 50 ? 'up' : 'down'}">${data.scorecardSummary.hitRate ?? '—'}%</div><div class="stat-label">Hit rate</div></div>
      <div class="stat"><div class="stat-value">${data.scorecardSummary.settled}</div><div class="stat-label">Settled</div></div>
      <div class="stat"><div class="stat-value">${data.scorecardSummary.open}</div><div class="stat-label">Open</div></div>
    </div>` : ''}
  `;

  return layout({
    title: isArchive ? data.dateLabel : 'MarketLens',
    description: read.body?.slice(0, 175) || 'Second-order analysis of the financial news that moves markets.',
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
  const impacts = [...(story.assetImpacts || [])].sort(
    (a, b) => (a.order || 1) - (b.order || 1) || (b.conviction || 0) - (a.conviction || 0),
  );
  const firstOrder = impacts.filter((i) => i.order !== 2);
  const secondOrder = impacts.filter((i) => i.order === 2);
  const c = story.classification || {};
  const m = story.materiality || {};

  const body = `
    <a class="back" href="${attr(basePath)}">← ${esc(data.dateLabel)}</a>

    <div class="story-head">
      <div class="chips">
        <span class="chip chip--accent">#${esc(story.rank)} today</span>
        <span class="chip chip--mono">${esc(String(c.eventType || '').replace(/-/g, ' '))}</span>
        <span class="chip chip--mono">${esc(String(c.pricedIn || '').replace(/-/g, ' '))}</span>
        <span class="chip chip--mono">${esc(c.persistence || '')}</span>
      </div>
      <h1>${esc(story.headline)}</h1>
      <div class="standfirst">${esc(story.standfirst)}</div>
    </div>

    <div class="panel">
      <div class="panel-title"><span class="num">01</span> First order — what the market already knows</div>
      <div class="prose">${esc(story.firstOrder)}</div>
      ${c.pricedInRationale ? `<div class="chain-note" style="margin-top:11px">${esc(c.pricedInRationale)}</div>` : ''}
    </div>

    ${(story.transmission || []).length ? `
    <div class="panel">
      <div class="panel-title"><span class="num">02</span> Transmission — how it propagates</div>
      ${story.transmission.map(renderChain).join('\n      ')}
    </div>` : ''}

    ${secondOrder.length ? `
    <div class="panel">
      <div class="panel-title"><span class="num">03</span> Second-order impacts</div>
      ${secondOrder.map(renderImpact).join('\n      ')}
    </div>` : ''}

    ${firstOrder.length ? `
    <div class="panel">
      <div class="panel-title"><span class="num">04</span> Direct impacts</div>
      ${firstOrder.map(renderImpact).join('\n      ')}
    </div>` : ''}

    ${story.nonConsensus ? `
    <div class="callout callout-edge">
      <h4>Where the edge is</h4>
      <p>${esc(story.nonConsensus)}</p>
    </div>` : ''}

    ${(story.tradeExpression || []).length ? `
    <div class="panel">
      <div class="panel-title"><span class="num">05</span> How you would express it</div>
      ${story.tradeExpression.map((t) => `<div class="trade">
        <h5>${esc(t.idea)}</h5>
        <div class="instrument">${esc(t.instrument)}</div>
        <p>${esc(t.rationale)}</p>
        <div class="risk"><b>Risk:</b> ${esc(t.risk)}</div>
      </div>`).join('\n      ')}
    </div>` : ''}

    ${(story.falsifiers || []).length ? `
    <div class="callout callout-falsify">
      <h4>What would prove this wrong</h4>
      <ul class="tick-list">${story.falsifiers.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>
    </div>` : ''}

    ${(story.watchNext || []).length ? `
    <div class="panel">
      <div class="panel-title">Catalysts to watch</div>
      <ul class="tick-list watch">${story.watchNext.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>
    </div>` : ''}

    <div class="panel">
      <div class="panel-title">Why this story was prioritised</div>
      <div class="prose" style="margin-bottom:13px">${esc(story.editorNote || '')}</div>
      ${m.components ? `
      <div class="stat-grid" style="margin-bottom:6px">
        <div class="stat"><div class="stat-value" style="font-size:19px">${esc(m.score)}</div><div class="stat-label">Materiality</div></div>
        <div class="stat"><div class="stat-value" style="font-size:19px">${esc(m.distinctSources)}</div><div class="stat-label">Sources</div></div>
        <div class="stat"><div class="stat-value" style="font-size:19px">${esc(story.confidence ?? '—')}/5</div><div class="stat-label">Confidence</div></div>
      </div>
      ${Object.entries(m.components).map(([k, v]) => `<div class="bar-row">
        <div class="bar-top"><span class="k">${esc(k)}</span><span class="v">${esc(v)} / ${COMPONENT_MAX[k] ?? 20}</span></div>
        <div class="bar"><i style="width:${Math.min(100, (Number(v) / (COMPONENT_MAX[k] ?? 20)) * 100).toFixed(0)}%"></i></div>
      </div>`).join('\n      ')}` : ''}
    </div>

    ${(story.links || []).length ? `
    <div class="panel">
      <div class="panel-title">Sources</div>
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
    for (const i of s.assetImpacts || []) {
      counts[i.assetClass] = (counts[i.assetClass] || 0) + 1;
    }
  }
  const body = `
    <div class="section-head"><h2>Lenses</h2><span class="rule"></span></div>
    <p class="prose" style="margin-bottom:16px">Every impact identified today, regrouped by asset class rather than by story — the view a desk actually needs.</p>
    <div class="cards">
      ${classes.map((c) => `<a class="card" href="/lens/${c}/">
        <div class="card-top"><span class="chip chip--accent">${esc(ASSET_LABEL[c])}</span></div>
        <h3 style="font-size:15px">${counts[c] || 0} impact${counts[c] === 1 ? '' : 's'} today</h3>
      </a>`).join('\n      ')}
    </div>`;
  return layout({
    title: 'Lenses',
    description: 'Today’s market impacts grouped by asset class: rates, FX, equities, credit, commodities and volatility.',
    activeTab: 'lenses', body, snapshot: data.snapshot, dateLabel: data.dateLabel,
    canonical: '/lens/', siteUrl: SITE_URL, generatedAt: data.generatedAt,
  });
}

function lensPage(cls, data) {
  const rows = [];
  for (const s of data.stories || []) {
    for (const i of s.assetImpacts || []) {
      if (i.assetClass === cls) rows.push({ impact: i, story: s });
    }
  }
  rows.sort((a, b) => (b.impact.conviction || 0) - (a.impact.conviction || 0));

  const body = `
    <a class="back" href="/lens/">← All lenses</a>
    <div class="section-head"><h2>${esc(ASSET_LABEL[cls])}</h2><span class="rule"></span><span class="count">${rows.length}</span></div>
    ${rows.length ? rows.map(({ impact, story }) => `
      <div class="panel">
        ${renderImpact(impact)}
        <a class="source-link" href="/story/${attr(story.id)}/" style="border-bottom:none;padding-bottom:0">
          <span class="name">#${esc(story.rank)}</span><span class="t">${esc(story.headline)}</span>
        </a>
      </div>`).join('\n')
      : '<div class="empty">No impacts flagged for this asset class today.</div>'}
  `;
  return layout({
    title: ASSET_LABEL[cls],
    description: `Second-order ${ASSET_LABEL[cls].toLowerCase()} impacts identified from today's market news.`,
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

  const callRow = (c) => {
    const good = c.status === 'hit';
    const moveCls = c.moveAbs === undefined ? 'flat' : (c.moveAbs > 0) === (c.direction === 'up') ? 'up' : 'down';
    return `<div class="call">
      <span class="status ${esc(c.status)}"></span>
      <span class="body">
        <span class="l">${esc(c.instrumentLabel)} <span class="${c.direction === 'up' ? 'up' : 'down'}">${c.direction === 'up' ? '▲' : '▼'}</span> <span class="muted" style="font-weight:400">${esc(c.magnitude || '')}</span></span>
        <span class="s">${esc(c.horizon)} · conviction ${esc(c.conviction)} · from ${esc(c.entryDisplay)}${c.settledAt ? ` · ${good ? 'hit' : c.status}` : ''}</span>
      </span>
      <span class="move ${moveCls}">${esc(c.moveDisplay || '—')}</span>
    </div>`;
  };

  const body = `
    <div class="section-head"><h2>Track record</h2><span class="rule"></span></div>
    <p class="prose" style="margin-bottom:16px">Every directional call made with conviction of 3 or higher is logged at the prevailing market level and settled once its stated horizon elapses. Moves smaller than 3bp (rates and spreads) or 0.3% (everything else) settle as flat and are excluded from the hit rate.</p>

    <div class="stat-grid">
      <div class="stat"><div class="stat-value ${(stats.hitRate ?? 0) >= 50 ? 'up' : 'down'}">${stats.hitRate ?? '—'}${stats.hitRate === null ? '' : '%'}</div><div class="stat-label">Hit rate</div></div>
      <div class="stat"><div class="stat-value up">${stats.hits}</div><div class="stat-label">Hits</div></div>
      <div class="stat"><div class="stat-value down">${stats.misses}</div><div class="stat-label">Misses</div></div>
      <div class="stat"><div class="stat-value">${stats.open}</div><div class="stat-label">Open</div></div>
      <div class="stat"><div class="stat-value muted">${stats.flat}</div><div class="stat-label">Flat</div></div>
    </div>

    ${Object.keys(stats.byClass).length ? `
    <div class="panel">
      <div class="panel-title">By asset class</div>
      ${Object.entries(stats.byClass).map(([k, v]) => `<div class="bar-row">
        <div class="bar-top"><span class="k">${esc(ASSET_LABEL[k] || k)}</span><span class="v">${v.hits}/${v.total} · ${v.rate}%</span></div>
        <div class="bar"><i style="width:${v.rate}%"></i></div>
      </div>`).join('\n      ')}
    </div>` : ''}

    ${Object.keys(stats.byConviction).length ? `
    <div class="panel">
      <div class="panel-title">By stated conviction</div>
      ${Object.entries(stats.byConviction).sort((a, b) => b[0] - a[0]).map(([k, v]) => `<div class="bar-row">
        <div class="bar-top"><span class="k">Conviction ${esc(k)}/5</span><span class="v">${v.hits}/${v.total} · ${v.rate}%</span></div>
        <div class="bar"><i style="width:${v.rate}%"></i></div>
      </div>`).join('\n      ')}
      <div class="chain-note">A tool with genuine signal should show a higher hit rate at higher stated conviction. If it does not, the conviction scale is not calibrated.</div>
    </div>` : ''}

    ${open.length ? `
    <div class="section-head"><h2>Open calls</h2><span class="rule"></span><span class="count">${open.length}</span></div>
    <div class="panel">${open.slice(0, 40).map(callRow).join('\n')}</div>` : ''}

    ${settled.length ? `
    <div class="section-head"><h2>Settled</h2><span class="rule"></span><span class="count">${settled.length}</span></div>
    <div class="panel">${settled.slice(0, 60).map(callRow).join('\n')}</div>`
    : '<div class="empty">No calls have settled yet. Check back once the first horizons elapse.</div>'}
  `;

  return layout({
    title: 'Scorecard',
    description: 'Track record of every directional call MarketLens has made, settled against realised market moves.',
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
      </a>`).join('\n      ') : '<div class="empty">No archived editions yet.</div>'}
    </div>`;
  return layout({
    title: 'Archive',
    description: 'Every previous edition of MarketLens, with the day’s market read and full second-order analysis.',
    activeTab: 'archive', body, snapshot: data.snapshot, dateLabel: data.dateLabel,
    canonical: '/archive/', siteUrl: SITE_URL, generatedAt: data.generatedAt,
  });
}

/* =========================================================== Method page */

function methodPage(data) {
  const channels = Object.entries(TRANSMISSION_CHANNELS);
  const body = `
    <div class="section-head"><h2>Method</h2><span class="rule"></span></div>
    <div class="prose">
      <p>MarketLens exists to answer one question that most financial news fails to address: <strong>who else is affected, and how?</strong> A headline tells you an event happened. A first-order read tells you the obvious asset that moves. Neither is where returns come from, because both are priced within minutes. The second-order effect — the supplier three steps down a value chain, the currency that becomes the funding leg, the leveraged strategy forced to delever because a correlation broke — is where the analytical work actually lies.</p>

      <h3>1. Ingestion</h3>
      <p>Every morning before the London open, the system pulls headlines from ${esc((data.diagnostics?.feeds || []).length)} sources spanning central banks and statistical agencies, wire services and financial newsrooms, and asset-class specialist feeds. Roughly ${esc(data.diagnostics?.articlesIngested || 300)} articles enter the funnel on a typical day.</p>

      <h3>2. Clustering and materiality scoring</h3>
      <p>Near-duplicate headlines are clustered by token overlap, so a story carried by eight outlets is treated as one event with eight corroborating sources rather than eight events. Each cluster is then scored 0–100 on five components:</p>
      <div class="table-scroll"><table>
        <tr><th>Component</th><th>Max</th><th>What it measures</th></tr>
        <tr><td><code>corroboration</code></td><td>30</td><td>Independent outlets carrying the story — the strongest available proxy for importance</td></tr>
        <tr><td><code>authority</code></td><td>20</td><td>Best source tier in the cluster; a central bank release outranks an aggregator</td></tr>
        <tr><td><code>breadth</code></td><td>20</td><td>Number of asset-class lexicons the story touches</td></tr>
        <tr><td><code>salience</code></td><td>20</td><td>Density of high-impact market vocabulary, individually weighted</td></tr>
        <tr><td><code>recency</code></td><td>10</td><td>Linear decay across a 36-hour window</td></tr>
      </table></div>
      <p>This stage is deliberately deterministic and cheap. It reduces several hundred headlines to about 25 candidates before a single token is spent on a language model, and its output is published on every story page so the prioritisation can be interrogated rather than taken on trust.</p>

      <h3>3. Editorial triage</h3>
      <p>The shortlist goes to a language model acting as editor, with the score presented explicitly as a prior it is expected to override where its judgement differs. It selects the day's stories on breadth, novelty, persistence and non-obviousness, and must publish its reasons for rejection alongside its selections. Rejections appear on the front page.</p>

      <h3>4. Transmission mapping</h3>
      <p>Each selected story is analysed against a fixed set of transmission channels. Every second-order claim must run through a named channel — this is what stops the output collapsing into "markets may be volatile".</p>
      <div class="table-scroll"><table>
        <tr><th>Channel</th><th>Mechanism</th></tr>
        ${channels.map(([k, v]) => `<tr><td><code>${esc(k)}</code></td><td>${esc(v)}</td></tr>`).join('\n        ')}
      </table></div>
      <p>Each impact carries a direction, a magnitude range in the correct units, a time horizon, a conviction score from 1 to 5, and a flag marking it first- or second-order. Analyses must produce at least three second-order impacts or they are not doing their job.</p>

      <h3>5. Falsification and expression</h3>
      <p>Every analysis states what would prove it wrong, and how the view would actually be expressed — cash, futures, options, or relative value — together with the main way that expression loses money. A thesis with no falsifier is a narrative, and a view with no expression is a comment.</p>

      <h3>6. Accountability</h3>
      <p>Every call made with conviction of 3 or higher is logged at the prevailing market level and settled against the realised move once its horizon elapses. The <a href="/scorecard/">scorecard</a> is published in full, including the misses, and breaks the hit rate down by asset class and by stated conviction. A tool whose high-conviction calls do not outperform its low-conviction calls has an uncalibrated conviction scale, and that should be visible.</p>

      <h3>Honest limitations</h3>
      <ul>
        <li>The analysis is generated by a language model. It reasons well about mechanisms and poorly about precise numbers, which is why magnitudes are expressed as ranges and no figure is presented as a data point.</li>
        <li>Source coverage is limited to freely available feeds. Paywalled primary reporting and real-time wire services are absent.</li>
        <li>Market data is delayed and used for context and call settlement, not for execution.</li>
        <li>The system runs once a day. It is a framework for thinking about propagation, not a live trading signal.</li>
      </ul>

      <h3>Built by</h3>
      <p>Jonathan Savill. MarketLens is an independent project built to develop and demonstrate a structured approach to cross-asset news analysis. The full pipeline — ingestion, scoring, prompting, settlement and this site — is custom-built with no third-party dependencies.</p>
    </div>`;
  return layout({
    title: 'Method',
    description: 'How MarketLens selects, prioritises and analyses market news: materiality scoring, transmission channels, and a published track record.',
    activeTab: 'method', body, snapshot: data.snapshot, dateLabel: data.dateLabel,
    canonical: '/method/', siteUrl: SITE_URL, generatedAt: data.generatedAt,
  });
}

/* ================================================================= Build */

async function main() {
  const started = Date.now();
  const data = await readJson(join(DATA, 'latest.json'));
  if (!data) {
    console.error('No data/latest.json found. Run: node scripts/pipeline.mjs');
    process.exit(1);
  }
  const scorecard = await readJson(join(DATA, 'scorecard.json'), { calls: [] });
  const archiveIndex = await readJson(join(DATA, 'archive', 'index.json'), []);

  await mkdir(DIST, { recursive: true });

  // Static assets
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

  // Machine-readable data for anyone who wants it (and for the service worker)
  await mkdir(join(DIST, 'api'), { recursive: true });
  await writeFile(join(DIST, 'api', 'latest.json'), JSON.stringify(data));
  await writeFile(join(DIST, 'api', 'scorecard.json'), JSON.stringify(scorecard));

  // robots + sitemap
  await writeFile(join(DIST, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`);
  await writeFile(
    join(DIST, 'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${
      [...new Set(routes)].map((r) => `  <url><loc>${SITE_URL}${r}</loc><lastmod>${data.date}</lastmod></url>`).join('\n')
    }\n</urlset>\n`,
  );

  // 404
  await writeFile(join(DIST, '404.html'), layout({
    title: 'Not found', description: 'Page not found.', activeTab: 'today',
    body: '<div class="empty">That page does not exist.<br><br><a class="chip chip--accent" href="/">Back to today</a></div>',
    snapshot: data.snapshot, dateLabel: data.dateLabel, canonical: '/404', siteUrl: SITE_URL, generatedAt: data.generatedAt, showTape: false,
  }));

  console.log(`Built ${routes.length} routes (+${archived} archived editions) in ${Date.now() - started}ms → dist/`);
}

main().catch((err) => { console.error(err); process.exit(1); });
