/**
 * prompt.mjs — the analytical framework.
 *
 * This file is the intellectual core of MarketLens. The code around it is
 * plumbing; this is the method. It encodes a transmission-channel model of how
 * a news event propagates from a first-order, mechanical effect through to the
 * second- and third-order consequences that actually determine where money is
 * made and lost.
 *
 * Design principles:
 *  - Name the channel. "Risk-off" is not analysis; "carry unwind forces JPY
 *    repatriation, which hits USD/JPY and Nikkei exporters together" is.
 *  - Quantify or abstain. Direction without magnitude and horizon is noise.
 *  - State what would falsify the view. A thesis you cannot break is not a
 *    thesis, it is a narrative.
 *  - Separate consensus from edge. The value is in what is *not* priced.
 */

export const TRANSMISSION_CHANNELS = {
  'policy-reaction': 'Changes the central bank reaction function — what policymakers are now more or less likely to do, and how the market reprices the path.',
  'discount-rate': 'Moves real yields or term premium, repricing every long-duration cash flow: growth equities, infrastructure, gold, EM.',
  'earnings': 'Alters revenue, margin, volume or pricing power somewhere in a value chain — including for firms not named in the story.',
  'credit': 'Changes cost or availability of capital: spreads, refinancing walls, covenant pressure, bank willingness to lend.',
  'fx-terms-of-trade': 'Shifts a currency, and with it importer/exporter margins, commodity affordability, and imported inflation.',
  'positioning': 'Interacts with existing crowded positioning, hedging flows, index rebalancing, gamma or forced deleveraging.',
  'correlation': 'Alters the correlation regime itself — stock/bond, dollar/risk, carry/vol — with knock-on effects for leveraged and risk-parity strategies.',
  'substitution': 'Read-across to competitors, suppliers, customers, and analogue assets that trade as substitutes.',
};

const SHARED_DISCIPLINE = `
ANALYTICAL DISCIPLINE — apply to everything you write:
- Be specific. "Bond yields may move" is worthless. "US 10Y +8 to +15bp over 2-5 sessions, led by the belly" is analysis.
- Distinguish what is already priced from what is not. Most headlines are largely discounted by the time they are published; say so when true, and say what the residual repricing is.
- Second-order means the effect on someone *not named in the headline*. If your second-order effect is just the first-order effect restated for the same asset, you have not done the work.
- Never assert a market level, print, or historical figure you are not confident in. Reason about direction, magnitude ranges and mechanisms instead of inventing precise data.
- Write like a desk analyst briefing a trading floor: dense, plain, unhedged where you have conviction, explicitly uncertain where you do not.
- No filler, no throat-clearing, no "it is important to note", no restating the question.
- British English spelling.
`;

/* --------------------------------------------------------------- Triage */

export function buildTriagePrompt({ candidates, marketText, count, dateLabel }) {
  const list = candidates
    .map((c, i) => {
      const heads = c.headlines.slice(0, 4).map((h) => `      - ${h}`).join('\n');
      return `  [${i}] materiality ${c.score} | ${c.distinctSources} source(s): ${c.sources.slice(0, 5).join(', ')}
      asset classes touched: ${c.assetClasses.join(', ') || 'none detected'}
      newest: ${c.newestAt}
${heads}`;
    })
    .join('\n\n');

  return `You are the senior editor of MarketLens, a markets research tool. It is ${dateLabel}.

Below are candidate news clusters from the last 36 hours, pre-scored by a deterministic materiality model (cross-source corroboration, source authority, asset-class breadth, market-vocabulary salience, recency). The score is a prior, not an answer — override it where your judgement differs, and say why.

CURRENT MARKET LEVELS:
${marketText}

CANDIDATE CLUSTERS:
${list}

TASK
Select the ${count} stories that most deserve a full second-order analysis today, ranked by how much they should change a multi-asset investor's positioning.

Judge on:
1. Breadth — how many asset classes are genuinely affected, not just mentioned.
2. Novelty — is there information here the market has not already discounted?
3. Persistence — does this change a structural variable, or is it a one-day headline?
4. Non-obviousness — is there a real second-order chain worth mapping, or is the effect purely direct?

Deliberately avoid: near-duplicates of a story you have already picked; single-stock news with no read-across; personal-finance and consumer-lifestyle content; opinion columns with no new information.

Also write the day's top-level market read: what actually matters today, in three sentences, connecting the selected stories to the market levels above.
${SHARED_DISCIPLINE}
Respond with ONLY a JSON object, no markdown fence, in exactly this shape:
{
  "marketRead": {
    "headline": "six to ten words capturing the day's dominant theme",
    "body": "three sentences of connected analysis",
    "regime": "one short phrase for the prevailing regime, e.g. 'disinflation trade under pressure'"
  },
  "selected": [
    {
      "index": <integer index from the candidate list>,
      "rank": <1 = most important>,
      "why": "one sentence: why this ranks here",
      "expectedBreadth": ["rates","fx","equities","credit","commodities","vol"]
    }
  ],
  "rejected": [
    { "index": <integer>, "why": "brief reason it did not make the cut" }
  ]
}`;
}

/* -------------------------------------------------------- Deep analysis */

export function buildAnalysisPrompt({ cluster, marketText, dateLabel, editorNote }) {
  const heads = cluster.headlines.map((h) => `  - ${h}`).join('\n');
  const channels = Object.entries(TRANSMISSION_CHANNELS)
    .map(([k, v]) => `  - ${k}: ${v}`)
    .join('\n');

  return `You are a senior cross-asset strategist writing for MarketLens. It is ${dateLabel}.

THE STORY (as reported across ${cluster.distinctSources} source(s): ${cluster.sources.slice(0, 6).join(', ')}):
${heads}

${cluster.lead?.summary ? `LEAD SUMMARY: ${cluster.lead.summary.slice(0, 500)}\n` : ''}
EDITOR'S NOTE ON WHY THIS WAS SELECTED: ${editorNote}

CURRENT MARKET LEVELS:
${marketText}

TRANSMISSION CHANNELS — every second-order effect you claim must run through one of these, named explicitly:
${channels}

TASK
Produce a full second-order analysis. The first-order effect is the easy part and the market has already traded it. Your value is entirely in the transmission chains: which assets move *because* other assets moved, which participants are forced to act, and what the market is under-appreciating.

Rules on asset impacts:
- Cover only asset classes with a real, arguable effect. Three well-argued impacts beat eight padded ones.
- Mark each impact as order 1 (direct) or order 2 (transmitted). You must produce at least three order-2 impacts.
- Yields and credit spreads in basis points; equities, FX and commodities in percent.
- Conviction 1-5, where 5 means you would size a position on it and 1 means it is a flag to watch.
${SHARED_DISCIPLINE}
Respond with ONLY a JSON object, no markdown fence, in exactly this shape:
{
  "headline": "punchy analytical headline, max 90 characters, states the implication not the event",
  "standfirst": "one plain-English sentence: what happened",
  "classification": {
    "eventType": "monetary-policy|fiscal|geopolitical|macro-data|corporate|regulatory|supply-shock|flows",
    "pricedIn": "anticipated|partially-priced|surprise",
    "pricedInRationale": "one sentence on how much is already discounted and how you can tell",
    "persistence": "transient|weeks|structural",
    "regionFocus": ["e.g. US","Europe","Japan","China","Global"]
  },
  "firstOrder": "two or three sentences: the direct mechanical effect, and why it is largely consensus",
  "transmission": [
    {
      "channel": "one of the channel keys above",
      "chain": ["first link", "second link", "third link"],
      "endpoint": "the asset or participant this ultimately lands on",
      "strength": "strong|moderate|speculative",
      "note": "one sentence of colour on the mechanism"
    }
  ],
  "assetImpacts": [
    {
      "assetClass": "rates|fx|equities|credit|commodities|vol",
      "instrument": "specific instrument, e.g. 'US 2s10s' or 'European autos'",
      "direction": "up|down|steeper|flatter|wider|tighter|mixed",
      "magnitude": "range with units, e.g. '8-15bp' or '1.5-3%'",
      "horizon": "intraday|days|weeks|quarters",
      "conviction": 1,
      "order": 2,
      "rationale": "one or two sentences, naming the mechanism"
    }
  ],
  "nonConsensus": "the strongest thing you can say that most participants have not yet worked through — one paragraph, and it must be genuinely contestable",
  "falsifiers": ["specific, observable developments that would kill this thesis"],
  "tradeExpression": [
    {
      "idea": "short name for the expression",
      "instrument": "how it is actually put on: cash, futures, options, spread, RV",
      "rationale": "why this expresses the view better than the obvious alternative",
      "risk": "the main way this loses money"
    }
  ],
  "watchNext": ["dated or specific upcoming catalysts that resolve this"],
  "confidence": 3
}`;
}

/* ------------------------------------------------------- Scorecard calls */

/**
 * Directional calls are extracted from the analysis so they can be scored
 * against realised market moves. Only impacts with conviction >= 3 and a
 * tracked instrument become calls — the tool is held to its convictions,
 * not to every passing observation.
 */
export const TRACKABLE = {
  'us 2y': 'us2y', 'us 10y': 'us10y', 'us 30y': 'us30y', '10-year': 'us10y',
  'uk 10y': 'uk10y', 'gilt': 'uk10y', 'german 10y': 'de10y', 'bund': 'de10y',
  'japan 10y': 'jp10y', 'jgb': 'jp10y',
  'eur/usd': 'eurusd', 'eurusd': 'eurusd', 'gbp/usd': 'gbpusd', 'gbpusd': 'gbpusd',
  'usd/jpy': 'usdjpy', 'usdjpy': 'usdjpy', 'dollar index': 'dxy', 'dxy': 'dxy',
  's&p 500': 'spx', 's&p': 'spx', 'spx': 'spx', 'nasdaq': 'ndx', 'nasdaq 100': 'ndx',
  'ftse': 'ukx', 'ftse 100': 'ukx', 'dax': 'dax', 'nikkei': 'nkx',
  'brent': 'brent', 'wti': 'wti', 'crude': 'brent', 'gold': 'gold', 'copper': 'copper',
  'natural gas': 'gas', 'nat gas': 'gas',
  'vix': 'vix', 'hy oas': 'hy_oas', 'high yield': 'hy_oas', 'ig oas': 'ig_oas',
  'investment grade': 'ig_oas',
};

export function extractCalls(analysis, storyId, snapshot) {
  const byKey = Object.fromEntries((snapshot?.quotes || []).map((q) => [q.key, q]));
  const calls = [];
  for (const impact of analysis.assetImpacts || []) {
    if ((impact.conviction || 0) < 3) continue;
    if (!['up', 'down', 'wider', 'tighter'].includes(impact.direction)) continue;

    const needle = String(impact.instrument || '').toLowerCase();
    const match = Object.entries(TRACKABLE).find(([label]) => needle.includes(label));
    if (!match) continue;

    const quote = byKey[match[1]];
    if (!quote) continue;

    calls.push({
      id: `${storyId}:${match[1]}`,
      storyId,
      instrumentKey: match[1],
      instrumentLabel: quote.label,
      assetClass: impact.assetClass,
      direction: ['up', 'wider'].includes(impact.direction) ? 'up' : 'down',
      statedDirection: impact.direction,
      magnitude: impact.magnitude,
      horizon: impact.horizon,
      conviction: impact.conviction,
      rationale: impact.rationale,
      entryValue: quote.value,
      entryDisplay: quote.display,
      openedAt: new Date().toISOString(),
      status: 'open',
    });
  }
  return calls;
}
