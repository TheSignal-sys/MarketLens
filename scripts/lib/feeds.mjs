/**
 * feeds.mjs — news ingestion layer.
 *
 * Zero dependencies: uses Node's built-in fetch and a tolerant regex XML reader.
 * Every feed is independent; a dead feed degrades the run, it never fails it.
 *
 * `tier` drives the source-authority component of the materiality score:
 *   1 = primary source (central banks, statistical agencies, regulators)
 *   2 = wire / major financial newsroom
 *   3 = secondary commentary and aggregation
 */

export const FEEDS = [
  // --- Tier 1: primary policy sources -------------------------------------
  { id: 'fed',        name: 'Federal Reserve',      tier: 1, tags: ['rates', 'macro'],
    url: 'https://www.federalreserve.gov/feeds/press_all.xml' },
  { id: 'fed-fomc',   name: 'Federal Reserve (Monetary)', tier: 1, tags: ['rates', 'macro'],
    url: 'https://www.federalreserve.gov/feeds/press_monetary.xml' },
  { id: 'ecb',        name: 'European Central Bank', tier: 1, tags: ['rates', 'fx', 'macro'],
    url: 'https://www.ecb.europa.eu/rss/press.html' },
  { id: 'boe',        name: 'Bank of England',       tier: 1, tags: ['rates', 'fx', 'macro'],
    url: 'https://www.bankofengland.co.uk/boeapps/rss/feeds.aspx?feed=News' },
  { id: 'imf',        name: 'IMF',                   tier: 1, tags: ['macro'],
    url: 'https://www.imf.org/en/News/RSS?Language=ENG' },
  { id: 'bls',        name: 'US Bureau of Labor Statistics', tier: 1, tags: ['macro'],
    url: 'https://www.bls.gov/feed/bls_latest.rss' },
  { id: 'eia',        name: 'US EIA',                tier: 1, tags: ['commodities'],
    url: 'https://www.eia.gov/rss/todayinenergy.xml' },

  // --- Tier 2: wires and major financial newsrooms ------------------------
  { id: 'mw-top',     name: 'MarketWatch',           tier: 2, tags: ['equities', 'macro'],
    url: 'https://feeds.content.dowjones.io/public/rss/mw_topstories' },
  { id: 'mw-pulse',   name: 'MarketWatch Market Pulse', tier: 2, tags: ['equities', 'macro'],
    url: 'https://feeds.content.dowjones.io/public/rss/mw_marketpulse' },
  { id: 'mw-rt',      name: 'MarketWatch Real-time', tier: 2, tags: ['equities'],
    url: 'https://feeds.content.dowjones.io/public/rss/mw_realtimeheadlines' },
  { id: 'wsj-markets', name: 'WSJ Markets',          tier: 2, tags: ['equities', 'credit'],
    url: 'https://feeds.content.dowjones.io/public/rss/RSSMarketsMain' },
  { id: 'wsj-world',  name: 'WSJ World',             tier: 2, tags: ['macro'],
    url: 'https://feeds.content.dowjones.io/public/rss/RSSWorldNews' },
  { id: 'yahoo-fin',  name: 'Yahoo Finance',         tier: 2, tags: ['equities'],
    url: 'https://finance.yahoo.com/news/rssindex' },
  { id: 'cnbc-top',   name: 'CNBC',                  tier: 2, tags: ['equities', 'macro'],
    url: 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100003114' },
  { id: 'cnbc-econ',  name: 'CNBC Economy',          tier: 2, tags: ['macro', 'rates'],
    url: 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=20910258' },
  { id: 'ft',         name: 'Financial Times',       tier: 2, tags: ['macro', 'equities'],
    url: 'https://www.ft.com/rss/home' },
  { id: 'bbc-biz',    name: 'BBC Business',          tier: 2, tags: ['macro'],
    url: 'https://feeds.bbci.co.uk/news/business/rss.xml' },
  { id: 'guardian-biz', name: 'Guardian Business',   tier: 2, tags: ['macro'],
    url: 'https://www.theguardian.com/uk/business/rss' },

  // --- Tier 2/3: asset-class specific -------------------------------------
  { id: 'inv-fx',     name: 'Investing.com FX',      tier: 3, tags: ['fx'],
    url: 'https://www.investing.com/rss/news_1.rss' },
  { id: 'inv-cmdty',  name: 'Investing.com Commodities', tier: 3, tags: ['commodities'],
    url: 'https://www.investing.com/rss/news_11.rss' },
  { id: 'inv-econ',   name: 'Investing.com Economy', tier: 3, tags: ['macro', 'rates'],
    url: 'https://www.investing.com/rss/news_14.rss' },
  { id: 'inv-bonds',  name: 'Investing.com Bonds',   tier: 3, tags: ['rates', 'credit'],
    url: 'https://www.investing.com/rss/news_286.rss' },
  { id: 'inv-stock',  name: 'Investing.com Equities', tier: 3, tags: ['equities'],
    url: 'https://www.investing.com/rss/news_25.rss' },
];

const UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/125.0.0.0 Safari/537.36 MarketLens/1.0 (+https://github.com/)';

/** Decode the handful of XML entities that actually show up in headlines. */
function decode(s = '') {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#0?39;/g, "'")
    .replace(/&#0?34;/g, '"')
    .replace(/&#x27;/gi, "'")
    .replace(/&#x2019;/gi, '’')
    .replace(/&#8217;/g, '’')
    .replace(/&#8216;/g, '‘')
    .replace(/&#8220;/g, '“')
    .replace(/&#8221;/g, '”')
    .replace(/&#8211;/g, '–')
    .replace(/&#8212;/g, '—')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function firstTag(block, ...names) {
  for (const n of names) {
    const m = block.match(new RegExp(`<${n}[^>]*>([\\s\\S]*?)</${n}>`, 'i'));
    if (m) return decode(m[1]);
  }
  return '';
}

/** Atom links carry the URL in an attribute rather than as text. */
function extractLink(block) {
  const text = firstTag(block, 'link');
  if (text && /^https?:\/\//i.test(text)) return text;
  const attr = block.match(/<link[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["']/i)
    || block.match(/<link[^>]*href=["']([^"']+)["']/i);
  if (attr) return decode(attr[1]);
  const guid = firstTag(block, 'guid', 'id');
  return /^https?:\/\//i.test(guid) ? guid : '';
}

function parseDate(block) {
  const raw = firstTag(block, 'pubDate', 'published', 'updated', 'dc:date', 'date');
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Split a feed body into <item> / <entry> blocks and normalise each one. */
export function parseFeed(xml, source) {
  const blocks = [
    ...xml.matchAll(/<item[\s>][\s\S]*?<\/item>/gi),
    ...xml.matchAll(/<entry[\s>][\s\S]*?<\/entry>/gi),
  ].map((m) => m[0]);

  const out = [];
  for (const b of blocks) {
    const title = firstTag(b, 'title');
    if (!title || title.length < 12) continue;
    const link = extractLink(b);
    const published = parseDate(b);
    out.push({
      title,
      link,
      summary: firstTag(b, 'description', 'summary', 'content:encoded', 'content').slice(0, 600),
      publishedAt: published ? published.toISOString() : null,
      sourceId: source.id,
      sourceName: source.name,
      tier: source.tier,
      sourceTags: source.tags,
    });
  }
  return out;
}

async function fetchWithTimeout(url, ms = 15000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, {
      redirect: 'follow',
      signal: ctrl.signal,
      headers: {
        'user-agent': UA,
        accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
        'accept-language': 'en-GB,en;q=0.9',
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Pull every feed in parallel. Returns { articles, report } where `report`
 * records per-feed outcome so `npm run diagnose` can show what is healthy.
 */
export async function fetchAllFeeds({ feeds = FEEDS, maxAgeHours = 36, log = () => {} } = {}) {
  const cutoff = Date.now() - maxAgeHours * 3600 * 1000;

  const results = await Promise.all(
    feeds.map(async (source) => {
      const started = Date.now();
      try {
        const res = await fetchWithTimeout(source.url);
        if (!res.ok) {
          return { source, ok: false, error: `HTTP ${res.status}`, ms: Date.now() - started, items: [] };
        }
        const xml = await res.text();
        const items = parseFeed(xml, source);
        const fresh = items.filter(
          (a) => !a.publishedAt || new Date(a.publishedAt).getTime() >= cutoff,
        );
        return {
          source, ok: items.length > 0, ms: Date.now() - started,
          parsed: items.length, items: fresh,
          error: items.length ? null : 'parsed 0 items',
        };
      } catch (err) {
        return { source, ok: false, error: `${err.name}: ${err.message}`, ms: Date.now() - started, items: [] };
      }
    }),
  );

  const articles = [];
  const report = [];
  for (const r of results) {
    report.push({
      id: r.source.id, name: r.source.name, ok: r.ok,
      parsed: r.parsed ?? 0, fresh: r.items.length, ms: r.ms, error: r.error ?? null,
    });
    log(
      `${r.ok ? 'ok  ' : 'FAIL'} ${String(r.source.id).padEnd(14)} ` +
      `${String(r.items.length).padStart(3)} fresh / ${String(r.parsed ?? 0).padStart(3)} parsed ` +
      `${String(r.ms + 'ms').padStart(7)}${r.error ? '  ' + r.error : ''}`,
    );
    articles.push(...r.items);
  }

  const healthy = report.filter((r) => r.ok).length;
  log(`\n${healthy}/${report.length} feeds healthy, ${articles.length} articles inside ${maxAgeHours}h window`);

  return { articles, report };
}
