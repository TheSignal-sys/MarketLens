#!/usr/bin/env node
/**
 * test.mjs — offline tests for the pipeline logic.
 *
 *   node scripts/test.mjs
 *
 * No network, no API keys, no dependencies. Covers the parts that would fail
 * silently and publish nonsense: feed parsing, clustering, materiality
 * scoring, JSON extraction from messy model output, call extraction, and
 * scorecard settlement.
 */

import { readFile } from 'node:fs/promises';

import { parseFeed } from './lib/feeds.mjs';
import { clusterArticles, scoreCluster, shortlist } from './lib/rank.mjs';
import { extractJson } from './lib/llm.mjs';
import { extractCalls, TRANSMISSION_CHANNELS } from './lib/prompt.mjs';
import { settleCalls, summarise, addCalls } from './lib/scorecard.mjs';
import {
  esc, renderImpact, renderChain, renderGlossary, renderAskBox,
  pricedInLabel, ASSET_LABEL,
} from './lib/render.mjs';

let passed = 0;
let failed = 0;

function check(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
  } catch (err) {
    failed += 1;
    console.log(`  \x1b[31m✗\x1b[0m ${name}\n      ${err.message}`);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}

function eq(a, b, msg) {
  if (a !== b) throw new Error(`${msg || 'not equal'}: got ${JSON.stringify(a)}, expected ${JSON.stringify(b)}`);
}

const section = (t) => console.log(`\n\x1b[1m${t}\x1b[0m`);

/* ------------------------------------------------------------ Feed parsing */

section('Feed parsing');

const RSS = `<?xml version="1.0"?>
<rss version="2.0"><channel>
  <title>Test Wire</title>
  <item>
    <title><![CDATA[Fed holds rates, signals two cuts in 2027]]></title>
    <link>https://example.com/a</link>
    <description>The Federal Reserve left the target range unchanged &amp; flagged easing.</description>
    <pubDate>${new Date().toUTCString()}</pubDate>
  </item>
  <item>
    <title>Brent crude slides 6% as sanctions read as de-escalation</title>
    <link>https://example.com/b</link>
    <description>Oil prices fell sharply.</description>
    <pubDate>${new Date().toUTCString()}</pubDate>
  </item>
  <item>
    <title>Short</title>
    <link>https://example.com/c</link>
    <pubDate>${new Date().toUTCString()}</pubDate>
  </item>
</channel></rss>`;

const ATOM = `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Central Bank</title>
  <entry>
    <title>ECB keeps deposit rate at 2.00% and revises inflation forecast</title>
    <link rel="alternate" href="https://ecb.example/x"/>
    <summary>Governing Council decision.</summary>
    <published>${new Date().toISOString()}</published>
  </entry>
</feed>`;

const src = { id: 'test', name: 'Test Wire', tier: 2, tags: ['macro'] };
const rssItems = parseFeed(RSS, src);
const atomItems = parseFeed(ATOM, { ...src, id: 'cb', tier: 1 });

check('parses RSS 2.0 items', () => eq(rssItems.length, 2, 'item count'));
check('drops headlines shorter than 12 chars', () => assert(!rssItems.some((i) => i.title === 'Short')));
check('unwraps CDATA', () => assert(rssItems[0].title.startsWith('Fed holds rates'), rssItems[0].title));
check('decodes entities', () => assert(rssItems[0].summary.includes('unchanged & flagged'), rssItems[0].summary));
check('extracts links', () => eq(rssItems[0].link, 'https://example.com/a'));
check('parses dates to ISO', () => assert(!Number.isNaN(Date.parse(rssItems[0].publishedAt))));
check('parses Atom entries', () => eq(atomItems.length, 1));
check('extracts Atom href attribute links', () => eq(atomItems[0].link, 'https://ecb.example/x'));
check('survives malformed XML without throwing', () => {
  const junk = parseFeed('<rss><item><title>Broken headline about inflation<title></item>', src);
  assert(Array.isArray(junk));
});
check('returns empty array for HTML error pages', () => {
  eq(parseFeed('<html><body>403 Forbidden</body></html>', src).length, 0);
});

/* -------------------------------------------------------------- Clustering */

section('Clustering');

const now = Date.now();
const iso = (hoursAgo) => new Date(now - hoursAgo * 3.6e6).toISOString();

const articles = [
  { title: 'Brent crude slides 6% as new Iran sanctions read as de-escalation', summary: 'Oil prices fell as traders priced a negotiated settlement.', publishedAt: iso(2), sourceId: 'mw', sourceName: 'MarketWatch', tier: 2, sourceTags: ['equities'], link: 'https://a' },
  { title: 'Oil slides as Iran sanctions package read as de-escalation by crude traders', summary: 'Brent down sharply.', publishedAt: iso(3), sourceId: 'ft', sourceName: 'FT', tier: 2, sourceTags: ['macro'], link: 'https://b' },
  { title: 'Crude falls: Iran sanctions read as de-escalation, Brent slides', summary: 'Energy complex lower.', publishedAt: iso(3), sourceId: 'cnbc', sourceName: 'CNBC', tier: 2, sourceTags: ['macro'], link: 'https://c' },
  { title: 'Federal Reserve holds rates steady, dot plot signals two cuts', summary: 'FOMC statement unchanged; inflation forecast trimmed.', publishedAt: iso(5), sourceId: 'fed', sourceName: 'Federal Reserve', tier: 1, sourceTags: ['rates'], link: 'https://d' },
  { title: 'Celebrity chef opens third restaurant in Shoreditch', summary: 'Local dining news.', publishedAt: iso(6), sourceId: 'bbc', sourceName: 'BBC', tier: 2, sourceTags: ['macro'], link: 'https://e' },
];

const clusters = clusterArticles(articles);
check('merges near-duplicate headlines', () => {
  const oil = clusters.find((c) => c.articles.some((a) => a.title.includes('Brent crude slides')));
  assert(oil.articles.length === 3, `expected 3 in oil cluster, got ${oil.articles.length}`);
});
check('keeps distinct stories apart', () => {
  assert(clusters.length >= 3, `expected >=3 clusters, got ${clusters.length}`);
});

/* ------------------------------------------------------ Materiality scoring */

section('Materiality scoring');

const scored = clusters.map((c) => scoreCluster(c, now));
const oilScore = scored.find((s) => s.lead.title.toLowerCase().includes('crude') || s.lead.title.toLowerCase().includes('oil'));
const fedScore = scored.find((s) => s.lead.title.includes('Federal Reserve'));
const noise = scored.find((s) => s.lead.title.includes('Celebrity chef'));

check('scores are bounded 0-100', () => {
  for (const s of scored) assert(s.score >= 0 && s.score <= 100, `${s.score} out of range`);
});
check('corroboration rewards multiple sources', () => {
  assert(oilScore.components.corroboration > fedScore.components.corroboration,
    `oil ${oilScore.components.corroboration} vs fed ${fedScore.components.corroboration}`);
});
check('authority rewards a tier-1 primary source', () => eq(fedScore.components.authority, 20));
check('market stories outrank noise', () => {
  assert(oilScore.score > noise.score && fedScore.score > noise.score,
    `oil ${oilScore.score}, fed ${fedScore.score}, noise ${noise.score}`);
});
check('detects asset classes touched', () => {
  assert(oilScore.assetClasses.includes('commodities'), oilScore.assetClasses.join(','));
  assert(fedScore.assetClasses.includes('rates'), fedScore.assetClasses.join(','));
});
check('components sum to the total score', () => {
  const sum = Object.values(oilScore.components).reduce((a, b) => a + b, 0);
  assert(Math.abs(sum - oilScore.score) < 0.5, `${sum} vs ${oilScore.score}`);
});
check('shortlist filters pure noise', () => {
  const list = shortlist(articles, { limit: 25, now });
  assert(!list.some((s) => s.lead.title.includes('Celebrity chef')), 'noise survived the prefilter');
});
check('shortlist returns highest score first', () => {
  const list = shortlist(articles, { limit: 25, now });
  for (let i = 1; i < list.length; i += 1) assert(list[i - 1].score >= list[i].score, 'not sorted');
});

/* --------------------------------------------------------- JSON extraction */

section('Model output parsing');

check('parses clean JSON', () => eq(extractJson('{"a":1}').a, 1));
check('strips markdown code fences', () => eq(extractJson('```json\n{"a":2}\n```').a, 2));
check('finds JSON after leading prose', () => eq(extractJson('Here is the analysis:\n\n{"a":3}').a, 3));
check('ignores trailing prose', () => eq(extractJson('{"a":4}\n\nLet me know if you need more.').a, 4));
check('handles braces inside strings', () => {
  eq(extractJson('{"note":"use {this} carefully","a":5}').a, 5);
});
check('handles escaped quotes inside strings', () => {
  eq(extractJson('{"note":"he said \\"buy\\"","a":6}').a, 6);
});
check('handles nested objects and arrays', () => {
  const o = extractJson('prose {"x":{"y":[1,2,{"z":7}]}} more');
  eq(o.x.y[2].z, 7);
});
check('throws on empty response', () => {
  let threw = false;
  try { extractJson(''); } catch { threw = true; }
  assert(threw, 'should have thrown');
});

/* ------------------------------------------------------------- Rendering */

section('Rendering');

const sampleImpact = {
  assetClass: 'rates', instrument: 'US 2Y', direction: 'down',
  magnitude: '6 to 12 basis points', horizon: 'days', conviction: 4, order: 2,
  plain: 'Short-term bond yields fall because cheaper energy means lower inflation.',
  detail: 'The front end prices a faster easing path.',
};

check('impact renders the plain sentence first', () => {
  const html = renderImpact(sampleImpact);
  const plainAt = html.indexOf('Short-term bond yields fall');
  const detailAt = html.indexOf('The front end prices');
  assert(plainAt > -1 && detailAt > -1, 'both versions must render');
  assert(plainAt < detailAt, 'plain must come before detail');
});

check('impact labels knock-on effects for a lay reader', () => {
  assert(renderImpact(sampleImpact).includes('Knock-on effect'));
  assert(renderImpact({ ...sampleImpact, order: 1 }).includes('Direct effect'));
});

check('chain renders the plain channel name, not the key', () => {
  const html = renderChain({
    channel: 'policy-reaction',
    links: [{ plain: 'Cheaper oil lowers inflation.', detail: 'Energy CPI contribution turns negative.' }],
    endpoint: 'the yield curve', strength: 'strong',
  }, 0);
  assert(html.includes('What central banks do next'), 'plain channel name missing');
  assert(!html.includes('policy-reaction'), 'raw channel key leaked into the page');
});

check('every channel key has a plain name and explanation', () => {
  for (const [key, v] of Object.entries(TRANSMISSION_CHANNELS)) {
    assert(v.name && v.name.length > 3, `${key} has no name`);
    assert(v.plain && v.plain.length > 20, `${key} has no plain explanation`);
    assert(!/-/.test(v.name) || v.name !== key, `${key} name is just the key`);
  }
});

check('priced-in states read as plain English', () => {
  eq(pricedInLabel('surprise'), 'Caught the market out');
  eq(pricedInLabel('partly-priced'), 'Partly expected');
  eq(pricedInLabel('expected'), 'Market expected this');
});

check('asset class labels avoid jargon', () => {
  eq(ASSET_LABEL.rates, 'Government bonds');
  eq(ASSET_LABEL.equities, 'Shares');
  eq(ASSET_LABEL.credit, 'Corporate debt');
});

check('glossary renders term and definition', () => {
  const html = renderGlossary([{ term: 'Basis point', plain: 'One hundredth of a percentage point.' }]);
  assert(html.includes('Basis point') && html.includes('One hundredth'));
});

check('glossary is omitted when empty', () => {
  eq(renderGlossary([]), '');
  eq(renderGlossary(undefined), '');
});

check('ask box carries the story id for the API call', () => {
  const html = renderAskBox({ id: '2026-08-25-example' });
  assert(html.includes('data-story="2026-08-25-example"'), 'story id missing');
});

check('model output is escaped everywhere it renders', () => {
  const nasty = '<img src=x onerror=alert(1)>';
  const html = renderImpact({ ...sampleImpact, instrument: nasty, plain: nasty, detail: nasty });
  assert(!html.includes('<img'), 'unescaped HTML reached the page');
  assert(html.includes('&lt;img'), 'escaped form missing');
});

/* --------------------------------------------------------- Prose quality */

section('Prose quality of the shipped demo copy');

const BANNED_PHRASES = [
  'the tell is', 'that is the whole point', 'which is precisely why',
  'it is worth noting', 'in other words', 'make no mistake', 'at the end of the day',
];
const BANNED_WORDS = /\b(crucially|notably|importantly|fundamentally|genuinely|robust|nuanced|landscape|delve|underscore|testament)\b/i;

function collectProse(story) {
  const out = [];
  const push = (s) => { if (typeof s === 'string' && s.length) out.push(s); };
  push(story.headline); push(story.standfirst);
  push(story.whatHappened?.plain); push(story.whatHappened?.whyItMatters); push(story.whatHappened?.detail);
  push(story.whatMarketMisses?.plain); push(story.whatMarketMisses?.detail);
  for (const c of story.chains || []) for (const l of c.links || []) { push(l.plain); push(l.detail); }
  for (const i of story.assetImpacts || []) { push(i.plain); push(i.detail); }
  for (const t of story.tradeExpression || []) { push(t.plain); push(t.risk); }
  for (const f of story.falsifiers || []) push(f);
  return out;
}

let demoStories = [];
try {
  const demo = JSON.parse(await readFile(new URL('../data/latest.json', import.meta.url), 'utf8'));
  demoStories = demo.stories || [];
} catch { /* no data yet; these checks are skipped */ }

if (demoStories.length) {
  const prose = demoStories.flatMap(collectProse);

  check('no em dashes in shipped copy', () => {
    const bad = prose.filter((p) => p.includes('—'));
    assert(bad.length === 0, `${bad.length} passage(s) contain em dashes: "${(bad[0] || '').slice(0, 70)}"`);
  });

  check('no banned filler phrases', () => {
    for (const phrase of BANNED_PHRASES) {
      const bad = prose.find((p) => p.toLowerCase().includes(phrase));
      assert(!bad, `found "${phrase}" in: "${(bad || '').slice(0, 70)}"`);
    }
  });

  check('no banned filler words', () => {
    const bad = prose.find((p) => BANNED_WORDS.test(p));
    assert(!bad, `banned word in: "${(bad || '').slice(0, 80)}"`);
  });

  check('every story has a glossary', () => {
    for (const s of demoStories) {
      assert((s.glossary || []).length >= 3, `${s.id} has ${(s.glossary || []).length} glossary terms`);
    }
  });

  check('every chain link has both a plain and a detail version', () => {
    for (const s of demoStories) {
      for (const c of s.chains || []) {
        for (const l of c.links || []) {
          assert(l.plain && l.plain.length > 10, `${s.id}: link missing plain text`);
          assert(l.detail && l.detail.length > 10, `${s.id}: link missing detail text`);
        }
      }
    }
  });

  check('every story produces at least three knock-on effects', () => {
    for (const s of demoStories) {
      const second = (s.assetImpacts || []).filter((i) => i.order === 2).length;
      assert(second >= 3, `${s.id} has only ${second} second-order impacts`);
    }
  });

  check('plain text avoids unexplained jargon density', () => {
    // A crude proxy: the plain fields should not be denser in jargon than the detail fields.
    const jargon = /\b(basis points?|term premium|carry|OAS|DV01|CDX|skew|beta|duration|convexity|front end|curve)\b/gi;
    for (const s of demoStories) {
      for (const i of s.assetImpacts || []) {
        const plainHits = (i.plain.match(jargon) || []).length;
        assert(plainHits <= 2, `${s.id} / ${i.instrument}: plain text has ${plainHits} jargon terms`);
      }
    }
  });
} else {
  console.log('  (skipped — run npm run seed first)');
}

/* ------------------------------------------------------------ Call extraction */

section('Call extraction');

const snapshot = {
  quotes: [
    { key: 'us10y', label: 'US 10Y', group: 'rates', unit: 'pct', value: 4.20, display: '4.20%' },
    { key: 'brent', label: 'Brent crude', group: 'commodities', unit: 'usd', value: 70.0, display: '70.00' },
    { key: 'hy_oas', label: 'US HY OAS', group: 'credit', unit: 'pct', value: 3.00, display: '3.00%' },
  ],
};

const analysis = {
  assetImpacts: [
    { assetClass: 'rates', instrument: 'US 10Y', direction: 'up', magnitude: '8-15bp', horizon: 'days', conviction: 4, order: 2, rationale: 'x' },
    { assetClass: 'commodities', instrument: 'Brent crude', direction: 'down', magnitude: '5%', horizon: 'days', conviction: 2, order: 1, rationale: 'y' },
    { assetClass: 'credit', instrument: 'US HY OAS', direction: 'wider', magnitude: '30bp', horizon: 'weeks', conviction: 4, order: 2, rationale: 'z' },
    { assetClass: 'equities', instrument: 'Peruvian small caps', direction: 'up', magnitude: '2%', horizon: 'weeks', conviction: 5, order: 2, rationale: 'untracked' },
    { assetClass: 'rates', instrument: 'US 10Y', direction: 'mixed', magnitude: 'n/a', horizon: 'days', conviction: 5, order: 1, rationale: 'no direction' },
  ],
};

const calls = extractCalls(analysis, 'story-1', snapshot);
check('ignores conviction below 3', () => assert(!calls.some((c) => c.instrumentKey === 'brent'), 'low-conviction call tracked'));
check('ignores untracked instruments', () => assert(!calls.some((c) => /peru/i.test(c.instrumentLabel))));
check('ignores non-directional calls', () => assert(!calls.some((c) => c.statedDirection === 'mixed')));
check('maps "wider" to a directional up call', () => {
  const hy = calls.find((c) => c.instrumentKey === 'hy_oas');
  eq(hy.direction, 'up');
  eq(hy.statedDirection, 'wider');
});
check('records the entry level at call time', () => {
  eq(calls.find((c) => c.instrumentKey === 'us10y').entryValue, 4.20);
});
check('extracts exactly the tracked, high-conviction calls', () => eq(calls.length, 2));

/* ---------------------------------------------------------------- Scorecard */

section('Scorecard settlement');

const day = 86400000;
const scorecard = { calls: [], updatedAt: null };
addCalls(scorecard, [
  { id: 'a', storyId: 's', instrumentKey: 'us10y', instrumentLabel: 'US 10Y', assetClass: 'rates', direction: 'up', magnitude: '10bp', horizon: 'days', conviction: 4, entryValue: 4.10, entryDisplay: '4.10%', openedAt: new Date(now - 5 * day).toISOString(), status: 'open' },
  { id: 'b', storyId: 's', instrumentKey: 'brent', instrumentLabel: 'Brent crude', assetClass: 'commodities', direction: 'up', magnitude: '5%', horizon: 'days', conviction: 3, entryValue: 75.0, entryDisplay: '75.00', openedAt: new Date(now - 5 * day).toISOString(), status: 'open' },
  { id: 'c', storyId: 's', instrumentKey: 'hy_oas', instrumentLabel: 'US HY OAS', assetClass: 'credit', direction: 'up', magnitude: '20bp', horizon: 'days', conviction: 3, entryValue: 3.005, entryDisplay: '3.01%', openedAt: new Date(now - 5 * day).toISOString(), status: 'open' },
  { id: 'd', storyId: 's', instrumentKey: 'us10y', instrumentLabel: 'US 10Y', assetClass: 'rates', direction: 'down', magnitude: '10bp', horizon: 'quarters', conviction: 4, entryValue: 4.10, entryDisplay: '4.10%', openedAt: new Date(now - 5 * day).toISOString(), status: 'open' },
]);

const settled = settleCalls(scorecard, snapshot, now);
const byId = Object.fromEntries(scorecard.calls.map((c) => [c.id, c]));

check('settles calls past their horizon', () => eq(settled, 3));
check('leaves long-horizon calls open', () => eq(byId.d.status, 'open'));
check('marks a correct direction as a hit', () => eq(byId.a.status, 'hit'));   // 4.10 → 4.20, called up
check('marks a wrong direction as a miss', () => eq(byId.b.status, 'miss'));   // 75 → 70, called up
check('marks sub-threshold moves as flat', () => eq(byId.c.status, 'flat'));   // 3.005 → 3.00, 0.5bp
check('excludes flat from the hit rate', () => {
  const s = summarise(scorecard);
  eq(s.settled, 2);
  eq(s.hits, 1);
  eq(s.hitRate, 50);
});
check('marks open calls to market', () => {
  assert(byId.d.markValue === 4.20, 'open call not marked');
  eq(byId.d.moveDisplay, '+10bp');
});
check('formats rate moves in basis points', () => eq(byId.a.moveDisplay, '+10bp'));
check('formats price moves in percent', () => assert(byId.b.moveDisplay.endsWith('%'), byId.b.moveDisplay));
check('does not duplicate an open call', () => {
  const before = scorecard.calls.length;
  addCalls(scorecard, [{ id: 'd', status: 'open' }]);
  eq(scorecard.calls.length, before);
});

/* ------------------------------------------------------------------ Escaping */

section('Output escaping');

check('escapes HTML in model output', () => {
  eq(esc('<script>alert(1)</script>'), '&lt;script&gt;alert(1)&lt;/script&gt;');
});
check('escapes quotes for attribute context', () => {
  eq(esc('a"b\'c'), 'a&quot;b&#39;c');
});
check('handles null and undefined', () => {
  eq(esc(null), '');
  eq(esc(undefined), '');
});

/* ------------------------------------------------------------ Ask endpoint */

section('Ask endpoint');

if (demoStories.length) {
  // Stub both the site fetch (for story lookup) and the model call, so this
  // runs offline with no server and no API key.
  const realFetch = globalThis.fetch;
  let lastPrompt = '';
  let lastMaxTokens = 0;

  const latest = JSON.parse(await readFile(new URL('../data/latest.json', import.meta.url), 'utf8'));

  globalThis.fetch = async (url, opts = {}) => {
    const u = String(url);
    if (u.includes('api.anthropic.com')) {
      const b = JSON.parse(opts.body);
      lastPrompt = b.messages[0].content;
      lastMaxTokens = b.max_tokens;
      return new Response(
        JSON.stringify({ content: [{ type: 'text', text: 'Cheaper oil lowers inflation, so rate cuts look more likely and short-term yields fall.' }] }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    if (u.includes('/data/latest.json')) {
      return new Response(JSON.stringify(latest), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return new Response('not found', { status: 404 });
  };

  process.env.SITE_URL = 'https://example.test';
  const savedKey = process.env.ANTHROPIC_API_KEY;
  process.env.ANTHROPIC_API_KEY = 'test-key';

  const { default: handler } = await import('../api/ask.js');

  const mkRes = () => {
    const r = { statusCode: 0, body: null };
    r.setHeader = () => {};
    r.status = (c) => { r.statusCode = c; return r; };
    r.json = (o) => { r.body = o; return r; };
    return r;
  };
  const call = async (method, body, ip = '1.2.3.4') => {
    const res = mkRes();
    await handler({ method, body, headers: { 'x-forwarded-for': ip, host: 'example.test' } }, res);
    return res;
  };

  const storyId = demoStories[0].id;

  // Each case is awaited up front, then reported through the normal checker.
  const results = [];
  results.push(['rejects non-POST requests', (await call('GET', {})).statusCode === 405]);
  results.push(['requires a story id', (await call('POST', { question: 'hi' })).statusCode === 400]);
  results.push(['requires a question', (await call('POST', { storyId, question: '  ' })).statusCode === 400]);
  results.push(['caps question length', (await call('POST', { storyId, question: 'a'.repeat(501) })).statusCode === 400]);
  results.push(['404s an unknown story', (await call('POST', { storyId: '2020-01-01-nope', question: 'what?' })).statusCode === 404]);

  const good = await call('POST', { storyId, question: 'Why does cheaper oil push bond yields down?' }, '5.5.5.5');
  results.push(['answers a valid question', good.statusCode === 200 && (good.body.answer || '').length > 20]);
  results.push(['grounds the prompt in the story', lastPrompt.includes(demoStories[0].headline)]);
  results.push(['passes the chains into the prompt', lastPrompt.includes('HOW IT SPREADS')]);
  results.push(['caps the answer length', lastMaxTokens === 500]);
  results.push(['forbids investment advice', /Never give investment advice/.test(lastPrompt)]);
  results.push(['forbids inventing facts', /Never invent facts/.test(lastPrompt)]);

  for (let i = 0; i < 12; i += 1) await call('POST', { storyId, question: `q${i}` }, '9.9.9.9');
  results.push(['rate limits one IP', (await call('POST', { storyId, question: 'more' }, '9.9.9.9')).statusCode === 429]);
  results.push(['leaves other IPs alone', (await call('POST', { storyId, question: 'fine?' }, '7.7.7.7')).statusCode === 200]);

  for (const [name, ok] of results) check(name, () => assert(ok));

  globalThis.fetch = realFetch;
  if (savedKey) process.env.ANTHROPIC_API_KEY = savedKey; else delete process.env.ANTHROPIC_API_KEY;
} else {
  console.log('  (skipped — run npm run seed first)');
}

/* -------------------------------------------------------------------- Result */

console.log(`\n\x1b[1m${passed} passed, ${failed} failed\x1b[0m\n`);
process.exit(failed ? 1 : 0);
