/**
 * prompt.mjs — the analytical framework.
 *
 * This file is the intellectual core of MarketLens. Everything around it is
 * plumbing; this is the method.
 *
 * The output follows one spine, and the site renders it in that order:
 *
 *     1. WHAT HAPPENED    the event, in plain English
 *     2. HOW IT SPREADS   the chain of consequences, link by link
 *     3. WHAT IT MEANS    the effect on each asset class
 *
 * Every claim is written twice: once in plain English that a smart person
 * outside finance can follow, and once in the technical language a desk would
 * actually use. The plain version leads. The technical version sits underneath
 * it. That serves both readers without patronising either.
 */

/**
 * Transmission channels. Each has a plain-English name shown on the site and a
 * key used in the data. Every second-order claim must run through one of them
 * — that constraint is what stops the analysis collapsing into "markets may be
 * volatile".
 */
export const TRANSMISSION_CHANNELS = {
  'policy-reaction': {
    name: 'What central banks do next',
    plain: 'Changes how likely it is that central banks cut or raise interest rates, and how quickly.',
  },
  'discount-rate': {
    name: 'The cost of money',
    plain: 'Moves government bond yields, which set the baseline return every other investment is judged against. When that baseline moves, everything reprices.',
  },
  'earnings': {
    name: 'Company profits',
    plain: 'Changes revenue, costs or pricing power somewhere in a supply chain, including for companies not mentioned in the story.',
  },
  'credit': {
    name: 'Borrowing costs',
    plain: 'Changes how expensive or how easy it is for companies to borrow, which matters most for those already carrying a lot of debt.',
  },
  'fx-terms-of-trade': {
    name: 'Currencies and trade',
    plain: 'Moves an exchange rate, which changes what importers pay and what exporters earn.',
  },
  'positioning': {
    name: 'Who is forced to trade',
    plain: 'Interacts with bets investors already hold. When a crowded position goes wrong, forced selling pushes the move further than the news alone justifies.',
  },
  'correlation': {
    name: 'How assets move together',
    plain: 'Changes whether assets that normally offset each other still do. When those relationships break, hedges stop working and leveraged funds are forced to cut risk.',
  },
  'substitution': {
    name: 'Knock-on to similar assets',
    plain: 'Read-across to competitors, suppliers, customers and assets that investors treat as alternatives.',
  },
};

/**
 * Prose rules. Language models have a recognisable house style, and a reader
 * spots it immediately. These rules exist to kill it.
 */
const VOICE = `
HOW TO WRITE — this matters as much as the analysis itself:

Write like a person explaining something clearly to a colleague. Not like an essay, not like a pitch, not like a language model.

BANNED, without exception:
- Em dashes. Use a comma, a full stop, or brackets.
- "Not X, but Y" and "X is not Y. It is Z." constructions.
- "The tell is", "that is the whole point", "which is precisely why", "make no mistake", "it is worth noting", "in other words", "at the end of the day".
- The words: crucially, notably, importantly, fundamentally, genuinely, arguably, robust, nuanced, landscape, delve, leverage (as a verb), underscore, testament.
- Rhetorical questions.
- One-sentence paragraphs used for dramatic effect.
- Three-item lists used for rhythm rather than because there are three things.
- Starting a sentence with "And" or "But" for emphasis.
- Ending a paragraph with a short punchy restatement of what you just said.

REQUIRED:
- Plain, direct sentences. Aim for an average under twenty words.
- Concrete nouns. "Oil companies" beats "the energy complex" unless precision demands the jargon.
- Say each thing once.
- Active voice. "The Fed cut rates", not "rates were cut".
- British English spelling.
- If you use a term a bright graduate outside finance would not know, add it to the glossary.

ANALYTICAL DISCIPLINE:
- Be specific. "Bond yields may move" is worthless. "The US 10-year yield rises 8 to 15 basis points over the next week" is analysis.
- Say what is already priced in. Most headlines are largely discounted by the time they are published. Say so when that is true, and say what repricing is left.
- Second-order means the effect on someone NOT named in the headline. If your second-order effect is the first-order effect restated for the same asset, you have not done the work.
- Never assert a market level, data print or historical figure you are not confident in. Reason about direction, size ranges and mechanisms instead of inventing numbers.
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

  return `You are the editor of MarketLens, a daily markets analysis tool. It is ${dateLabel}.

Below are candidate news clusters from the last 36 hours, pre-scored by a deterministic model (cross-source corroboration, source authority, asset-class breadth, market-vocabulary salience, recency). Treat the score as a starting point you can override.

CURRENT MARKET LEVELS:
${marketText}

CANDIDATE CLUSTERS:
${list}

TASK
Pick the ${count} stories that most deserve a full analysis today, ranked by how much they should change where an investor puts money.

Judge on:
1. Breadth. How many asset classes are really affected, not just mentioned.
2. Novelty. Is there information here the market has not already absorbed?
3. Persistence. Does this change something lasting, or is it a one-day headline?
4. Non-obviousness. Is there a real chain of knock-on effects worth mapping?

Skip: near-duplicates of a story you have already picked, single-company news with no read-across, personal finance and consumer content, and opinion columns with no new information.

Then write the day's summary: what actually matters today, in three plain sentences, connecting your picks to the market levels above.
${VOICE}
Respond with ONLY a JSON object, no markdown fence, in exactly this shape:
{
  "marketRead": {
    "headline": "six to ten words capturing the day's main theme",
    "body": "three plain sentences of connected analysis",
    "regime": "a short phrase for what kind of market this is, e.g. 'growth fears returning'"
  },
  "selected": [
    { "index": <integer from the list above>, "rank": <1 = most important>, "why": "one sentence on why it ranks here" }
  ]
}`;
}

/* -------------------------------------------------------- Deep analysis */

export function buildAnalysisPrompt({ cluster, marketText, dateLabel, editorNote }) {
  const heads = cluster.headlines.map((h) => `  - ${h}`).join('\n');
  const channels = Object.entries(TRANSMISSION_CHANNELS)
    .map(([k, v]) => `  - ${k} ("${v.name}"): ${v.plain}`)
    .join('\n');

  return `You are a markets analyst writing for MarketLens. It is ${dateLabel}.

THE STORY (reported across ${cluster.distinctSources} source(s): ${cluster.sources.slice(0, 6).join(', ')}):
${heads}

${cluster.lead?.summary ? `LEAD SUMMARY: ${cluster.lead.summary.slice(0, 500)}\n` : ''}
WHY IT WAS SELECTED: ${editorNote}

CURRENT MARKET LEVELS:
${marketText}

TRANSMISSION CHANNELS. Every knock-on effect you claim must run through one of these, named explicitly:
${channels}

TASK
Follow one spine, in this order.

STAGE 1 — WHAT HAPPENED. The event itself, in plain English, as if explaining it to someone who reads the news but does not work in finance. Then say why it matters in one or two sentences.

STAGE 2 — HOW IT SPREADS. Two or three chains of consequence. Each chain is a sequence of links, each link caused by the one before it. Write each link as a short plain sentence. Name the channel it runs through. The first-order effect is the easy part and the market has already traded it; your value is in the links after that.

STAGE 3 — WHAT IT MEANS FOR EACH ASSET CLASS. For each affected asset class, give the direction, a size range, a timeframe, and your conviction.

THE DOUBLE WRITE. Every chain link and every asset impact gets two versions:
- "plain": what it means, in everyday language. No jargon. This is what most readers see.
- "detail": the same point in the language a trading desk would use, with the precise mechanism. One or two sentences.
Do not simply restate the plain version in the detail field. The detail adds precision the plain version deliberately leaves out.

RULES ON ASSET IMPACTS:
- Only include asset classes with a real, arguable effect. Three well-argued impacts beat eight padded ones.
- Mark each as order 1 (direct) or order 2 (knock-on). You must produce at least three order-2 impacts.
- Bond yields and credit spreads in basis points. Shares, currencies and commodities in percent.
- Conviction 1 to 5. Five means you would put money on it. One means it is a flag to watch.

GLOSSARY. List every term you used that a bright graduate outside finance would not know, with a one-sentence plain definition. Be generous: basis point, yield curve, spread, term premium, carry trade, and similar all qualify.
${VOICE}
Respond with ONLY a JSON object, no markdown fence, in exactly this shape:
{
  "headline": "clear headline stating the consequence, max 90 characters, no jargon",
  "standfirst": "one plain sentence saying what happened",
  "classification": {
    "eventType": "monetary-policy|fiscal|geopolitical|macro-data|corporate|regulatory|supply-shock|flows",
    "pricedIn": "expected|partly-priced|surprise",
    "pricedInRationale": "one plain sentence on how much the market had already absorbed and how you can tell",
    "persistence": "days|weeks|lasting",
    "regionFocus": ["e.g. US","Europe","Japan","China","Global"]
  },
  "whatHappened": {
    "plain": "two or three plain sentences describing the event",
    "whyItMatters": "one or two plain sentences on why anyone with money at stake should care",
    "detail": "one or two sentences of the precise market context a desk would add"
  },
  "chains": [
    {
      "channel": "one of the channel keys above",
      "links": [
        { "plain": "short plain sentence", "detail": "the same link in desk language, with the mechanism" }
      ],
      "endpoint": "the asset or group of people this ultimately lands on",
      "strength": "strong|moderate|speculative"
    }
  ],
  "assetImpacts": [
    {
      "assetClass": "rates|fx|equities|credit|commodities|vol",
      "instrument": "specific, e.g. 'US 10-year Treasury yield' or 'European car makers'",
      "direction": "up|down|steeper|flatter|wider|tighter|mixed",
      "magnitude": "range with units, e.g. '8 to 15 basis points' or '1.5 to 3%'",
      "horizon": "intraday|days|weeks|quarters",
      "conviction": 3,
      "order": 2,
      "plain": "one plain sentence on what this means and why",
      "detail": "one or two sentences naming the precise mechanism"
    }
  ],
  "whatMarketMisses": {
    "plain": "one paragraph in plain English on what most investors have not worked through yet. It must be contestable, not a truism.",
    "detail": "one or two sentences putting the same point in desk language"
  },
  "falsifiers": ["specific things that would happen if this analysis is wrong"],
  "tradeExpression": [
    {
      "idea": "short name for the trade",
      "plain": "one plain sentence on what you would actually buy or sell, and why",
      "instrument": "how a desk would put it on: cash, futures, options, spread",
      "risk": "the main way this loses money, in plain English"
    }
  ],
  "watchNext": ["specific upcoming events that will resolve this"],
  "glossary": [ { "term": "basis point", "plain": "One hundredth of a percentage point. A move from 4.00% to 4.10% is ten basis points." } ],
  "confidence": 3
}`;
}

/* ---------------------------------------------------- Ask-a-question mode */

/**
 * Used by the /api/ask endpoint. Answers reader questions about one story,
 * grounded strictly in that story's published analysis.
 */
export function buildAskPrompt({ story, marketText, question, dateLabel }) {
  const impacts = (story.assetImpacts || [])
    .map((i) => `- ${i.instrument} (${i.assetClass}): ${i.direction} ${i.magnitude} over ${i.horizon}, conviction ${i.conviction}/5. ${i.plain || ''} ${i.detail || ''}`)
    .join('\n');
  const chains = (story.chains || [])
    .map((c) => `- via ${c.channel}: ${(c.links || []).map((l) => l.plain).join(' → ')} → lands on ${c.endpoint}`)
    .join('\n');

  return `You are MarketLens, answering a reader's question about one story you published on ${dateLabel}.

THE STORY
Headline: ${story.headline}
Summary: ${story.standfirst}
What happened: ${story.whatHappened?.plain || ''}
Why it matters: ${story.whatHappened?.whyItMatters || ''}

CHAINS OF EFFECT
${chains || 'none recorded'}

ASSET IMPACTS
${impacts || 'none recorded'}

WHAT THE MARKET MAY BE MISSING
${story.whatMarketMisses?.plain || ''}

WHAT WOULD PROVE IT WRONG
${(story.falsifiers || []).map((f) => `- ${f}`).join('\n')}

MARKET LEVELS AT PUBLICATION
${marketText}

READER'S QUESTION
${question}

RULES
- Answer in plain English. Assume the reader is intelligent but does not work in finance.
- Ground your answer in the analysis above. You may explain and expand on it, and you may explain general financial concepts.
- If the question cannot be answered from this story, say so plainly and say what the story does cover. Do not invent facts, prices or events.
- Do not give investment advice or tell anyone what to buy. Explain mechanisms instead.
- Three short paragraphs at most. Often one is enough.
- No em dashes. No bullet points unless the question genuinely asks for a list.
- British English.

Answer the question directly. Do not restate it first.`;
}

/* ------------------------------------------------------- Scorecard calls */

/**
 * Directional calls are extracted so they can be scored against realised
 * market moves. Only impacts with conviction >= 3 on a tracked instrument
 * become calls, so the tool is held to its convictions rather than to every
 * passing observation.
 */
export const TRACKABLE = {
  'us 2y': 'us2y', 'us 2-year': 'us2y', 'us 10y': 'us10y', 'us 10-year': 'us10y',
  '10-year treasury': 'us10y', 'us 30y': 'us30y', 'us 30-year': 'us30y',
  'uk 10y': 'uk10y', 'gilt': 'uk10y', 'german 10y': 'de10y', 'bund': 'de10y',
  'japan 10y': 'jp10y', 'jgb': 'jp10y',
  'eur/usd': 'eurusd', 'eurusd': 'eurusd', 'euro against the dollar': 'eurusd',
  'gbp/usd': 'gbpusd', 'gbpusd': 'gbpusd', 'sterling': 'gbpusd',
  'usd/jpy': 'usdjpy', 'usdjpy': 'usdjpy', 'dollar index': 'dxy', 'dxy': 'dxy',
  's&p 500': 'spx', 's&p': 'spx', 'spx': 'spx', 'nasdaq': 'ndx', 'nasdaq 100': 'ndx',
  'ftse': 'ukx', 'ftse 100': 'ukx', 'dax': 'dax', 'nikkei': 'nkx',
  'brent': 'brent', 'wti': 'wti', 'crude': 'brent', 'gold': 'gold', 'copper': 'copper',
  'natural gas': 'gas', 'nat gas': 'gas',
  'vix': 'vix', 'hy oas': 'hy_oas', 'high yield': 'hy_oas', 'high-yield': 'hy_oas',
  'ig oas': 'ig_oas', 'investment grade': 'ig_oas', 'investment-grade': 'ig_oas',
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
      rationale: impact.plain || impact.detail || '',
      entryValue: quote.value,
      entryDisplay: quote.display,
      openedAt: new Date().toISOString(),
      status: 'open',
    });
  }
  return calls;
}
