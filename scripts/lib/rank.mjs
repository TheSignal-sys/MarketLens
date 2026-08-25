/**
 * rank.mjs — deterministic clustering and materiality scoring.
 *
 * Purpose: turn ~300 raw headlines into a defensible shortlist of ~25 candidate
 * stories before any money is spent on LLM tokens. Everything here is
 * transparent and reproducible — the score breakdown is published on the site
 * so the prioritisation can be interrogated rather than taken on trust.
 *
 * Materiality (0–100) = corroboration + authority + breadth + salience + recency
 */

const STOPWORDS = new Set(`a an the and or but of for to in on at by with from as is are was were be been
being it its this that these those he she they we you i his her their our your my has have had will would
can could should may might must do does did not no nor so than then there here what which who whom how
why when where all any both each few more most other some such only own same too very just now get got
says said say new says' after before over under about into out up down off again more most`.split(/\s+/));

/** Words that carry real market signal, with their weight in the salience term. */
const SALIENCE = {
  // monetary policy
  'fed': 9, 'federal reserve': 10, 'fomc': 10, 'ecb': 9, 'bank of england': 9, 'boj': 9,
  'bank of japan': 9, 'pboc': 8, 'rate cut': 10, 'rate hike': 10, 'interest rate': 8,
  'monetary policy': 9, 'quantitative': 8, 'balance sheet': 6, 'powell': 9, 'lagarde': 8,
  'bailey': 7, 'dot plot': 8, 'hawkish': 8, 'dovish': 8, 'yield curve': 8, 'basis points': 7,
  // inflation and macro data
  'inflation': 9, 'cpi': 10, 'pce': 9, 'ppi': 7, 'payrolls': 10, 'nonfarm': 10,
  'unemployment': 8, 'jobless': 7, 'gdp': 9, 'recession': 10, 'pmi': 7, 'retail sales': 6,
  'consumer confidence': 5, 'wage growth': 7, 'stagflation': 9,
  // fiscal / sovereign
  'treasury': 7, 'gilt': 8, 'bund': 7, 'jgb': 7, 'sovereign': 8, 'budget': 7, 'deficit': 8,
  'debt ceiling': 10, 'downgrade': 9, 'auction': 6, 'issuance': 6, 'fiscal': 7, 'default': 10,
  'austerity': 6, 'stimulus': 8, 'bailout': 9,
  // trade and geopolitics
  'tariff': 10, 'sanctions': 9, 'export controls': 9, 'trade war': 9, 'embargo': 8,
  'opec': 9, 'strait': 7, 'war': 8, 'invasion': 9, 'ceasefire': 7, 'election': 7,
  'coup': 8, 'strike': 5, 'blockade': 8, 'nationalis': 8, 'expropriat': 8,
  // credit and financial stability
  'credit': 6, 'spread': 6, 'high yield': 8, 'investment grade': 7, 'cds': 7,
  'liquidity': 8, 'contagion': 10, 'bank run': 10, 'insolvency': 9, 'bankruptcy': 8,
  'restructuring': 7, 'covenant': 6, 'refinanc': 7, 'leverage': 6, 'margin call': 9,
  'private credit': 7, 'repo': 7, 'funding stress': 9,
  // volatility and positioning
  'volatility': 7, 'vix': 8, 'selloff': 8, 'rout': 8, 'crash': 9, 'rally': 5,
  'unwind': 8, 'carry trade': 8, 'deleverag': 8, 'short squeeze': 7, 'capitulation': 8,
  // commodities and energy
  'oil': 7, 'crude': 7, 'brent': 7, 'wti': 7, 'natural gas': 7, 'lng': 6,
  'gold': 6, 'copper': 6, 'lithium': 5, 'uranium': 5, 'wheat': 5, 'supply cut': 8,
  'production cut': 8, 'inventor': 5, 'refinery': 5, 'pipeline': 5,
  // equities / corporate with systemic reach
  'earnings': 6, 'guidance': 6, 'profit warning': 8, 'merger': 6, 'acquisition': 6,
  'ipo': 5, 'buyback': 5, 'capex': 6, 'semiconductor': 7, 'chip': 6, 'ai capex': 8,
  'layoffs': 6, 'antitrust': 6, 'regulat': 5, 'nvidia': 6, 'apple': 4, 'megacap': 6,
  // fx
  'dollar': 7, 'yen': 7, 'euro': 6, 'sterling': 6, 'yuan': 7, 'renminbi': 7,
  'devaluation': 9, 'intervention': 9, 'peg': 8, 'reserves': 6, 'capital controls': 9,
};

/** Lexicons used to measure how many asset classes a story plausibly reaches. */
const ASSET_LEXICON = {
  rates: ['fed', 'fomc', 'ecb', 'boe', 'boj', 'rate', 'yield', 'treasury', 'gilt', 'bund', 'jgb',
    'bond', 'duration', 'curve', 'inflation', 'cpi', 'pce', 'monetary', 'hawkish', 'dovish',
    'basis points', 'auction', 'issuance', 'term premium'],
  fx: ['dollar', 'euro', 'yen', 'sterling', 'pound', 'yuan', 'renminbi', 'franc', 'currency',
    'fx', 'exchange rate', 'devaluation', 'intervention', 'carry trade', 'peg', 'reserves',
    'usd', 'eur', 'gbp', 'jpy', 'cny', 'emerging market'],
  equities: ['stock', 'equity', 'equities', 'shares', 'index', 's&p', 'nasdaq', 'ftse', 'dax',
    'nikkei', 'earnings', 'guidance', 'buyback', 'ipo', 'merger', 'acquisition', 'sector',
    'valuation', 'multiple', 'megacap', 'semiconductor', 'bank stocks'],
  credit: ['credit', 'spread', 'high yield', 'investment grade', 'cds', 'default', 'downgrade',
    'bankruptcy', 'restructuring', 'covenant', 'leverage', 'loan', 'refinanc', 'private credit',
    'issuer', 'bondholder', 'contagion', 'insolvency'],
  commodities: ['oil', 'crude', 'brent', 'wti', 'gas', 'lng', 'gold', 'silver', 'copper',
    'aluminium', 'aluminum', 'iron ore', 'wheat', 'corn', 'soy', 'opec', 'barrel', 'commodity',
    'energy', 'metal', 'mining', 'harvest', 'lithium', 'uranium'],
  vol: ['volatility', 'vix', 'move index', 'hedge', 'option', 'convexity', 'gamma', 'skew',
    'selloff', 'crash', 'rout', 'unwind', 'margin call', 'risk-off', 'risk off', 'capitulation'],
};

export const ASSET_CLASSES = Object.keys(ASSET_LEXICON);

function tokenise(text) {
  return (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9%$£€\s.-]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOPWORDS.has(t) && !/^\d+$/.test(t));
}

function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const t of a) if (b.has(t)) shared += 1;
  return shared / (a.size + b.size - shared);
}

/**
 * Greedy single-pass clustering on headline token overlap.
 * Deliberately conservative: better to leave two versions of one story apart
 * than to merge two genuinely different stories.
 */
export function clusterArticles(articles, threshold = 0.34) {
  const prepared = articles
    .filter((a) => a.title)
    .map((a) => ({ ...a, tokens: new Set(tokenise(a.title)) }));

  const clusters = [];
  for (const article of prepared) {
    let best = null;
    let bestScore = threshold;
    for (const c of clusters) {
      const score = jaccard(article.tokens, c.tokens);
      if (score > bestScore) { bestScore = score; best = c; }
    }
    if (best) {
      best.articles.push(article);
      for (const t of article.tokens) best.tokens.add(t);
    } else {
      clusters.push({ tokens: new Set(article.tokens), articles: [article] });
    }
  }
  return clusters;
}

function assetTouch(text) {
  const lower = (text || '').toLowerCase();
  const hits = {};
  for (const [cls, words] of Object.entries(ASSET_LEXICON)) {
    let n = 0;
    for (const w of words) if (lower.includes(w)) n += 1;
    if (n > 0) hits[cls] = n;
  }
  return hits;
}

function salienceScore(text) {
  const lower = (text || '').toLowerCase();
  let total = 0;
  const matched = [];
  for (const [term, weight] of Object.entries(SALIENCE)) {
    if (lower.includes(term)) { total += weight; matched.push(term); }
  }
  return { total, matched };
}

/**
 * Score a cluster 0–100. Every component is reported so the site can show
 * *why* a story was prioritised — the reasoning is the product.
 */
export function scoreCluster(cluster, now = Date.now()) {
  const arts = cluster.articles;
  const text = arts.map((a) => `${a.title}. ${a.summary || ''}`).join(' ');
  const titleText = arts.map((a) => a.title).join(' . ');

  // 1. Cross-source corroboration (0–30): independent outlets running the story.
  const distinctSources = new Set(arts.map((a) => a.sourceId)).size;
  const corroboration = Math.min(30, Math.round(13 * Math.log2(distinctSources + 1)));

  // 2. Source authority (0–20): a central bank release outranks an aggregator.
  const bestTier = Math.min(...arts.map((a) => a.tier));
  const authority = bestTier === 1 ? 20 : bestTier === 2 ? 13 : 7;

  // 3. Breadth (0–20): how many asset classes the story plausibly reaches.
  const touch = assetTouch(text);
  const classes = Object.keys(touch);
  const breadth = Math.min(20, classes.length * 4.5);

  // 4. Salience (0–20): density of high-impact market vocabulary.
  const sal = salienceScore(titleText + ' ' + text.slice(0, 1200));
  const salience = Math.min(20, sal.total * 0.85);

  // 5. Recency (0–10): linear decay across a 36h window.
  const stamps = arts.map((a) => (a.publishedAt ? new Date(a.publishedAt).getTime() : now - 18 * 3.6e6));
  const newest = Math.max(...stamps);
  const ageHours = Math.max(0, (now - newest) / 3.6e6);
  const recency = Math.max(0, 10 - (ageHours / 36) * 10);

  const total = corroboration + authority + breadth + salience + recency;

  // Longest, most specific headline is usually the most informative one.
  const lead = [...arts].sort(
    (a, b) => a.tier - b.tier || b.title.length - a.title.length,
  )[0];

  return {
    score: Math.round(total * 10) / 10,
    components: {
      corroboration: Math.round(corroboration * 10) / 10,
      authority,
      breadth: Math.round(breadth * 10) / 10,
      salience: Math.round(salience * 10) / 10,
      recency: Math.round(recency * 10) / 10,
    },
    distinctSources,
    assetTouch: touch,
    assetClasses: classes,
    salienceTerms: sal.matched.slice(0, 12),
    lead,
    headlines: [...new Set(arts.map((a) => a.title))].slice(0, 8),
    sources: [...new Set(arts.map((a) => a.sourceName))],
    links: arts.filter((a) => a.link).slice(0, 6).map((a) => ({ name: a.sourceName, url: a.link, title: a.title })),
    newestAt: new Date(newest).toISOString(),
  };
}

/** Full prefilter: cluster, score, drop noise, return the top N candidates. */
export function shortlist(articles, { limit = 25, now = Date.now() } = {}) {
  const clusters = clusterArticles(articles);
  const scored = clusters
    .map((c) => scoreCluster(c, now))
    .filter((s) => s.assetClasses.length > 0 || s.components.authority === 20)
    .sort((a, b) => b.score - a.score);

  // Keep the field broad enough that the LLM triage has real choices to make.
  return scored.slice(0, limit);
}
