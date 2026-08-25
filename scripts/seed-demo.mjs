#!/usr/bin/env node
/**
 * seed-demo.mjs — writes a representative data/latest.json without calling
 * any API, so you can preview the site design before wiring up keys.
 *
 *   node scripts/seed-demo.mjs && node scripts/build.mjs
 *
 * The content is illustrative. Delete data/latest.json and run the real
 * pipeline once your keys are set.
 */

import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = join(ROOT, 'data');

const now = new Date();
const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', dateStyle: 'short' }).format(now);
const dateLabel = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/London', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
}).format(now);

const q = (key, label, group, unit, value, prev) => {
  const chg = value - prev;
  const pct = (chg / prev) * 100;
  const fmt = unit === 'pct' ? `${value.toFixed(2)}%`
    : unit === 'fx4' ? value.toFixed(4)
    : unit === 'fx2' ? value.toFixed(2)
    : unit === 'usd' ? value.toFixed(2)
    : value.toLocaleString('en-GB', { maximumFractionDigits: value > 1000 ? 0 : 2 });
  return {
    key, label, group, unit, value, display: fmt, change: chg, changePct: pct,
    changeDisplay: unit === 'pct'
      ? `${chg >= 0 ? '+' : ''}${Math.round(chg * 100)}bp`
      : `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`,
    asOf: date, provider: 'demo',
  };
};

const snapshot = {
  fetchedAt: now.toISOString(),
  report: [{ provider: 'demo', ok: true, count: 18, ms: 0, error: null }],
  quotes: [
    q('spx', 'S&P 500', 'equities', 'index', 6842, 6871),
    q('ndx', 'Nasdaq 100', 'equities', 'index', 25310, 25498),
    q('ukx', 'FTSE 100', 'equities', 'index', 9614, 9588),
    q('dax', 'DAX', 'equities', 'index', 24880, 24931),
    q('nkx', 'Nikkei 225', 'equities', 'index', 44120, 44655),
    q('us2y', 'US 2Y', 'rates', 'pct', 3.42, 3.49),
    q('us10y', 'US 10Y', 'rates', 'pct', 4.28, 4.21),
    q('us30y', 'US 30Y', 'rates', 'pct', 4.91, 4.82),
    q('uk10y', 'UK 10Y gilt', 'rates', 'pct', 4.63, 4.58),
    q('de10y', 'German 10Y', 'rates', 'pct', 2.74, 2.71),
    q('jp10y', 'Japan 10Y', 'rates', 'pct', 1.94, 1.88),
    q('eurusd', 'EUR/USD', 'fx', 'fx4', 1.1842, 1.1791),
    q('gbpusd', 'GBP/USD', 'fx', 'fx4', 1.3706, 1.3668),
    q('usdjpy', 'USD/JPY', 'fx', 'fx2', 146.8, 149.2),
    q('dxy', 'Dollar index', 'fx', 'index', 96.42, 97.05),
    q('brent', 'Brent crude', 'commodities', 'usd', 68.4, 72.9),
    q('wti', 'WTI crude', 'commodities', 'usd', 64.8, 69.1),
    q('gold', 'Gold', 'commodities', 'usd', 3985, 3921),
    q('copper', 'Copper', 'commodities', 'usd', 5.12, 5.06),
    q('vix', 'VIX', 'vol', 'index', 18.7, 16.2),
    q('hy_oas', 'US HY OAS', 'credit', 'pct', 3.14, 3.02),
    q('ig_oas', 'US IG OAS', 'credit', 'pct', 0.94, 0.91),
  ],
};

const stories = [
  {
    id: `${date}-iran-sanctions-oil-de-escalation`,
    rank: 1,
    editorNote: 'Broadest cross-asset reach of the day: an energy shock that resolved to the downside repricing inflation expectations, the policy path and the dollar simultaneously.',
    materiality: { score: 84.2, components: { corroboration: 26.1, authority: 20, breadth: 18, salience: 17.2, recency: 9.4 }, distinctSources: 7, salienceTerms: ['sanctions', 'oil', 'crude', 'brent', 'inflation', 'dollar'] },
    sources: ['MarketWatch', 'Investing.com Commodities', 'Financial Times', 'CNBC', 'Yahoo Finance', 'Guardian Business', 'Reuters'],
    links: [{ name: 'MarketWatch', url: 'https://www.marketwatch.com/', title: 'Sweeping new sanctions on Iran send oil prices to their biggest drop in three weeks' }],
    headlines: ['Sweeping new sanctions on Iran send oil prices to their biggest drop in three weeks, while fuelling hopes of de-escalation'],
    newestAt: now.toISOString(),
    headline: 'Oil falls on a sanctions headline — and takes the front end of the curve with it',
    standfirst: 'A new sanctions package on Iran was read by the market as the price of a negotiated settlement rather than an escalation, and Brent fell more than 6%.',
    classification: {
      eventType: 'geopolitical', pricedIn: 'surprise',
      pricedInRationale: 'Positioning was long energy into the announcement on an escalation premise; the reflexive move lower shows the market had the sign of the trade wrong, not merely the magnitude.',
      persistence: 'weeks', regionFocus: ['Global', 'US', 'Europe'],
    },
    firstOrder: 'Brent and WTI fell roughly 6% as traders concluded that a formalised sanctions regime removes the tail risk of unilateral military action and creates a defined negotiating framework. Energy equities underperformed the broad index by a wide margin. This much is consensus and was traded within the hour.',
    transmission: [
      {
        channel: 'policy-reaction',
        chain: ['Crude down 6% mechanically lowers headline CPI forecasts for the next two prints', 'Front-end rates reprice a faster easing path as the inflation constraint loosens', 'But the long end sells off as the market prices a lower-for-longer policy rate against unchanged fiscal supply'],
        endpoint: 'US 2s30s curve',
        strength: 'strong',
        note: 'The tell is the curve, not the level: 2s down 7bp while 30s sold off 9bp is a growth-and-supply story dressed as an oil story.',
      },
      {
        channel: 'fx-terms-of-trade',
        chain: ['Lower crude improves the terms of trade for large net energy importers — the euro area, Japan, India', 'Reduced dollar demand for energy invoicing at the margin', 'Dollar index softens against importer currencies while commodity exporters (NOK, CAD, COP) underperform'],
        endpoint: 'EUR/USD and the commodity-currency complex',
        strength: 'moderate',
        note: 'This is the cleanest second-order expression: the dollar leg is a consequence of the oil move, not a parallel reaction to it.',
      },
      {
        channel: 'earnings',
        chain: ['Lower crude compresses upstream cash flows and the marginal barrel economics of US shale', 'Capex guidance for 2027 is cut at the next reporting round', 'Oilfield services order books, industrial gas demand and specialist steel volumes are hit with a two-to-three-quarter lag'],
        endpoint: 'Oilfield services and energy-levered industrials',
        strength: 'moderate',
        note: 'The producers move today; their supply chain moves at the next set of capex guides. That lag is the tradeable window.',
      },
      {
        channel: 'positioning',
        chain: ['Systematic and CTA strategies were carrying long energy as a persistent trend signal', 'A 6% single-session move flips the medium-term trend signal', 'Mechanical selling extends the move beyond fundamental fair value over the following three to five sessions'],
        endpoint: 'Crude term structure and energy equity beta',
        strength: 'speculative',
        note: 'If this is right, the overshoot creates the entry point rather than confirming the thesis.',
      },
    ],
    assetImpacts: [
      { assetClass: 'commodities', instrument: 'Brent crude', direction: 'down', magnitude: '5-8%', horizon: 'days', conviction: 4, order: 1, rationale: 'Direct repricing of the geopolitical risk premium as the sanctions framework is read as de-escalatory.' },
      { assetClass: 'rates', instrument: 'US 2Y', direction: 'down', magnitude: '6-12bp', horizon: 'days', conviction: 4, order: 2, rationale: 'Lower energy input costs relax the near-term inflation constraint and pull forward the expected easing path.' },
      { assetClass: 'rates', instrument: 'US 2s30s', direction: 'steeper', magnitude: '12-20bp', horizon: 'weeks', conviction: 3, order: 2, rationale: 'Front end rallies on the disinflation impulse while the long end is anchored by unchanged issuance and a term premium that energy prices do not touch.' },
      { assetClass: 'fx', instrument: 'EUR/USD', direction: 'up', magnitude: '0.6-1.2%', horizon: 'days', conviction: 3, order: 2, rationale: 'Terms-of-trade improvement for a large net energy importer, amplified by narrowing front-end rate differentials.' },
      { assetClass: 'equities', instrument: 'European autos and airlines', direction: 'up', magnitude: '1.5-3%', horizon: 'weeks', conviction: 3, order: 2, rationale: 'Fuel is a direct and unhedged input for airlines and a demand-elasticity driver for autos; both are net beneficiaries of a sustained move lower.' },
      { assetClass: 'credit', instrument: 'US HY energy spreads', direction: 'wider', magnitude: '25-45bp', horizon: 'weeks', conviction: 3, order: 2, rationale: 'Energy remains a large HY index constituent; sub-$65 WTI pressures coverage ratios for the leveraged shale cohort into a 2027 refinancing window.' },
      { assetClass: 'vol', instrument: 'Crude implied vol', direction: 'down', magnitude: '3-6 vol points', horizon: 'weeks', conviction: 2, order: 2, rationale: 'A defined sanctions framework narrows the distribution of outcomes, though realised vol will stay elevated while positioning clears.' },
    ],
    nonConsensus: 'The market is treating this as a clean disinflationary impulse, and on a two-month horizon it probably is. What it is under-pricing is the credit consequence. US high yield still carries meaningful energy exposure, and a substantial share of the leveraged shale cohort has coverage covenants calibrated to a WTI band comfortably above $60. Those issuers were relying on a 2027 refinancing window that a benign rate path was supposed to open. This move gives them the lower rates and simultaneously removes the cash flow that made them financeable. HY energy spreads should widen even as the index rallies on duration — a divergence within credit that the top-line spread will hide for several weeks.',
    falsifiers: [
      'Brent recovers above $74 within five sessions, implying the market has re-read the sanctions package as supply-restrictive after all',
      'US 2s10s flattens rather than steepens, indicating this is being traded as a demand-destruction signal rather than a supply story',
      'HY energy spreads tighten alongside the index, which would falsify the credit divergence thesis directly',
      'OPEC+ announces a compensating production cut, restoring the risk premium and neutralising the terms-of-trade channel',
    ],
    tradeExpression: [
      { idea: 'Curve steepener over outright duration', instrument: 'US 2s30s steepener via futures (long TU, short UB, DV01-neutral)', rationale: 'Expresses the disinflation impulse without taking a view on the long end, where fiscal supply is the dominant driver and energy prices are close to irrelevant.', risk: 'A genuine growth scare pulls the entire curve lower in parallel and the steepener bleeds carry while being directionally right on the front end.' },
      { idea: 'Credit divergence within high yield', instrument: 'Long HY index CDX, short single-name protection basket in levered E&P', rationale: 'Isolates the energy-specific credit deterioration from the index-level duration rally, which are being conflated in the current spread print.', risk: 'Idiosyncratic single-name headlines — an asset sale or an equity raise — resolve the funding question for a constituent before the thesis plays out.' },
      { idea: 'Importer terms-of-trade basket', instrument: 'Long EUR and JPY against a NOK/CAD basket, equal-weighted', rationale: 'A cleaner expression of the energy transmission than outright EUR/USD, which carries substantial unrelated Fed-path risk.', risk: 'Divergent central bank meetings inside the horizon swamp the terms-of-trade signal with a rate-differential move.' },
    ],
    watchNext: [
      'US CPI print — the first read on whether the energy pass-through is showing up in headline',
      'OPEC+ monitoring committee — any compensating supply response',
      'Q3 energy earnings and 2027 capex guidance, the transmission point to the services complex',
      'Weekly EIA inventory builds as the physical confirmation of the demand read',
    ],
    confidence: 4,
  },
  {
    id: `${date}-fed-credibility-dollar-outlook`,
    rank: 2,
    editorNote: 'A structural story rather than a headline: the dollar is increasingly trading off institutional credibility rather than rate differentials, which changes the correlation regime.',
    materiality: { score: 71.6, components: { corroboration: 20.6, authority: 13, breadth: 18, salience: 14.8, recency: 8.2 }, distinctSources: 4, salienceTerms: ['dollar', 'fed', 'treasury', 'monetary policy', 'reserves'] },
    sources: ['Investing.com FX', 'Financial Times', 'MarketWatch', 'CNBC Economy'],
    links: [{ name: 'Investing.com', url: 'https://www.investing.com/', title: 'Why does the USD outlook depend on UST and Fed policy credibility?' }],
    headlines: ['Why does the USD outlook depend on UST and Fed policy credibility?', 'Sell the US dollar versus these currencies, strategists say'],
    newestAt: now.toISOString(),
    headline: 'The dollar has stopped trading on rate differentials — that is the story',
    standfirst: 'Multiple strategy desks are arguing the dollar’s direction now depends on perceived Treasury and Fed policy credibility rather than the front-end rate spread.',
    classification: {
      eventType: 'monetary-policy', pricedIn: 'partially-priced',
      pricedInRationale: 'The level of the dollar reflects the view; the correlation structure does not. Cross-asset hedge ratios are still being set off rate differentials that have stopped explaining the move.',
      persistence: 'structural', regionFocus: ['US', 'Global'],
    },
    firstOrder: 'The dollar has weakened materially against G10 despite a front-end spread that would historically have supported it. Sell-side strategy is converging on an explanation: a credibility discount rather than a cyclical one. The immediate trade — short dollar against EUR, JPY and CHF — is well populated and increasingly crowded.',
    transmission: [
      {
        channel: 'correlation',
        chain: ['If the dollar is trading on institutional credibility, it decouples from the two-year spread', 'Risk models calibrated on the historical dollar/rates correlation systematically mis-hedge', 'Multi-asset portfolios discover their FX hedge is no longer offsetting their duration position'],
        endpoint: 'Cross-asset hedge ratios and risk-parity leverage',
        strength: 'strong',
        note: 'Correlation breaks are the most under-priced risk in markets because they are invisible until a position is stressed.',
      },
      {
        channel: 'discount-rate',
        chain: ['A credibility discount raises the term premium demanded on long-dated Treasuries', 'The long end steepens independently of the policy path', 'Every long-duration asset priced off the US risk-free curve reprices — growth equity, infrastructure, and notably gold'],
        endpoint: 'US 30Y term premium and gold',
        strength: 'strong',
        note: 'Gold above $3,900 with real yields elevated is the market already voting on this; it is a monetary-credibility hedge, not an inflation hedge, at these levels.',
      },
      {
        channel: 'positioning',
        chain: ['Short-dollar is now a consensus position across macro funds and real money', 'Crowding reduces the marginal buyer of the next dollar leg lower', 'Any credibility-restoring event triggers a violent squeeze disproportionate to its fundamental content'],
        endpoint: 'Dollar index short base',
        strength: 'moderate',
        note: 'Being right on direction and wrong on entry is the dominant failure mode in a crowded structural trade.',
      },
    ],
    assetImpacts: [
      { assetClass: 'fx', instrument: 'Dollar index', direction: 'down', magnitude: '1.5-3%', horizon: 'quarters', conviction: 3, order: 1, rationale: 'Structural credibility discount, partially offset by extremely crowded positioning that caps the pace of the move.' },
      { assetClass: 'rates', instrument: 'US 30Y term premium', direction: 'up', magnitude: '15-30bp', horizon: 'quarters', conviction: 3, order: 2, rationale: 'A credibility discount is compensated at the long end, independent of where the policy rate settles.' },
      { assetClass: 'commodities', instrument: 'Gold', direction: 'up', magnitude: '4-9%', horizon: 'quarters', conviction: 4, order: 2, rationale: 'The clearest available expression of a monetary-credibility hedge, and the one least dependent on the timing of the dollar move.' },
      { assetClass: 'vol', instrument: 'FX implied vol', direction: 'up', magnitude: '1.5-3 vol points', horizon: 'weeks', conviction: 3, order: 2, rationale: 'A correlation regime change raises realised vol before it raises implied; the gap is where the value sits.' },
      { assetClass: 'equities', instrument: 'US large-cap exporters', direction: 'up', magnitude: '1-2.5%', horizon: 'quarters', conviction: 2, order: 2, rationale: 'Translation tailwind on overseas earnings, though partly offset by the higher discount rate applied to those same cash flows.' },
    ],
    nonConsensus: 'Almost every participant now agrees the dollar goes lower, which makes the direction close to worthless as a source of return. The under-appreciated consequence is what a credibility-driven dollar does to correlation. If the dollar no longer responds to rate differentials, then the standard multi-asset hedge — long duration, hedged FX — stops working, and it stops working precisely when both legs are stressed together. Risk-parity and volatility-targeting strategies size their leverage off trailing correlation matrices that have not yet registered this. The trade is not short dollar. The trade is long FX volatility and long the correlation break, because the eventual unwind will be a mechanical deleveraging rather than a fundamental repricing.',
    falsifiers: [
      'The dollar re-establishes a stable beta to the two-year spread over a full quarter, indicating the correlation break was noise',
      'Gold fails to make a new high while the dollar falls, which would sever the credibility interpretation',
      'FX implied vol compresses to the bottom of its two-year range despite a continued dollar decline',
      'A credible fiscal consolidation or an unambiguous demonstration of policy independence removes the discount at source',
    ],
    tradeExpression: [
      { idea: 'Own the correlation break, not the direction', instrument: 'Long 6M EUR/USD strangles funded by selling short-dated wings', rationale: 'The consensus is already short spot; the mis-priced asset is the volatility of the path, not the level.', risk: 'A grinding trend with no realised volatility bleeds the structure to expiry — right thesis, wrong instrument.' },
      { idea: 'Gold as the credibility hedge', instrument: 'Long gold versus short a G10 short-dollar basket', rationale: 'Isolates the monetary-credibility premium from the crowded dollar trade, so the position survives a positioning squeeze.', risk: 'A genuine liquidity event forces indiscriminate gold liquidation regardless of the thesis.' },
    ],
    watchNext: [
      'The next FOMC statement and press conference, read for institutional signalling rather than the rate decision',
      'Long-end Treasury auction tails as the direct measure of the term premium demanded',
      'Foreign official custody holdings in the weekly Fed data',
      'Trailing 60-day dollar/rate-spread correlation as the falsification test',
    ],
    confidence: 3,
  },
  {
    id: `${date}-sp500-dividend-yield-record-low`,
    rank: 3,
    editorNote: 'A valuation-structure story with a real second-order consequence for who owns the index and what forces them to sell.',
    materiality: { score: 63.4, components: { corroboration: 16.4, authority: 13, breadth: 13.5, salience: 12.1, recency: 8.4 }, distinctSources: 3, salienceTerms: ['earnings', 'valuation', 'buyback', 'megacap'] },
    sources: ['Yahoo Finance', 'MarketWatch', 'CNBC'],
    links: [{ name: 'Yahoo Finance', url: 'https://finance.yahoo.com/', title: 'S&P 500 dividend yield hits record low near 1% and it has some retirees rethinking their strategies' }],
    headlines: ['S&P 500 dividend yield hits record low near 1% and it has some retirees rethinking their strategies'],
    newestAt: now.toISOString(),
    headline: 'A 1% index yield changes who can own equities, not just what they cost',
    standfirst: 'The S&P 500 dividend yield has fallen to a record low near 1%, well below cash and short-dated government paper.',
    classification: {
      eventType: 'flows', pricedIn: 'anticipated',
      pricedInRationale: 'The level is a mechanical consequence of index concentration and the shift from dividends to buybacks; it is widely reported and correctly priced as a valuation datapoint. The ownership consequence is not priced at all.',
      persistence: 'structural', regionFocus: ['US'],
    },
    firstOrder: 'Index concentration in low-payout technology names, combined with the long-run substitution of buybacks for dividends, has pushed the aggregate yield to a record low. As a valuation signal in isolation it is close to meaningless — total shareholder yield is a far better measure and is nowhere near a record.',
    transmission: [
      {
        channel: 'substitution',
        chain: ['Income-mandated investors cannot meet distribution requirements from index equity', 'They rotate into credit, high-dividend factor strategies and infrastructure', 'The marginal buyer of the index becomes exclusively total-return oriented and more price-sensitive'],
        endpoint: 'Index ownership structure and downside convexity',
        strength: 'moderate',
        note: 'Changing who owns an asset changes how it behaves in a drawdown, which is a risk property rather than a valuation one.',
      },
      {
        channel: 'earnings',
        chain: ['Buybacks substitute for dividends but are discretionary and pro-cyclical', 'A cash flow shock cuts buybacks immediately, where dividends are cut only reluctantly', 'The index has quietly traded a sticky return component for a cyclical one'],
        endpoint: 'Realised equity drawdown depth',
        strength: 'strong',
        note: 'This is the whole point: the return has not disappeared, it has become far more procyclical.',
      },
      {
        channel: 'credit',
        chain: ['Income mandates rotating out of equity land in IG and private credit', 'Spread compression from a non-economic buyer', 'IG spreads decouple from fundamentals while the flow persists'],
        endpoint: 'IG spread levels',
        strength: 'speculative',
        note: 'Explains part of why IG spreads look expensive relative to leverage metrics.',
      },
    ],
    assetImpacts: [
      { assetClass: 'equities', instrument: 'S&P 500 high-dividend factor', direction: 'up', magnitude: '1-3% relative', horizon: 'quarters', conviction: 3, order: 2, rationale: 'Persistent flow from income-mandated investors unable to source yield from the cap-weighted index.' },
      { assetClass: 'credit', instrument: 'US IG spreads', direction: 'tighter', magnitude: '5-15bp', horizon: 'quarters', conviction: 2, order: 2, rationale: 'Substitution demand from displaced equity income mandates acts as a non-economic bid.' },
      { assetClass: 'vol', instrument: 'S&P 500 skew', direction: 'up', magnitude: '1-3 points', horizon: 'quarters', conviction: 3, order: 2, rationale: 'A shareholder base without an income anchor has a lower pain threshold, deepening the left tail without changing at-the-money vol.' },
      { assetClass: 'equities', instrument: 'S&P 500', direction: 'mixed', magnitude: 'n/a', horizon: 'quarters', conviction: 2, order: 1, rationale: 'The yield level itself carries almost no directional information; total shareholder yield is unremarkable.' },
    ],
    nonConsensus: 'The commentary treats this as a valuation warning, which is the wrong frame — total shareholder yield including buybacks is nowhere near a record. The consequence that matters is structural: buybacks are discretionary and dividends are sticky, so an index that has substituted one for the other has converted a stable return component into a procyclical one. In the next genuine earnings contraction, the buyback bid disappears in the same quarter the fundamentals deteriorate, where a dividend would have been defended for several quarters. The index has not become more expensive. It has become more convex to the downside, and that belongs in the skew rather than in the multiple.',
    falsifiers: [
      'Total shareholder yield including buybacks also reaches a record low, which would restore the simple valuation interpretation',
      'High-dividend factor strategies underperform over two consecutive quarters despite the yield gap',
      'S&P 500 skew flattens over a six-month horizon, falsifying the ownership-composition argument',
      'Buyback authorisations prove resilient through the next earnings contraction',
    ],
    tradeExpression: [
      { idea: 'Own the convexity, not the level', instrument: 'S&P 500 put spread collars, financed by selling upside calls', rationale: 'Expresses a view on the shape of the return distribution rather than its direction, which is where the ownership change actually shows up.', risk: 'A persistent melt-up caps returns on the short call leg while the puts expire worthless.' },
      { idea: 'Income substitution basket', instrument: 'Long high-dividend factor versus short equal-weight S&P', rationale: 'Captures the persistent mandate-driven flow while neutralising broad market beta.', risk: 'High-dividend baskets carry an unintended rates and value factor exposure that can dominate the flow signal.' },
    ],
    watchNext: [
      'Quarterly buyback authorisation totals as the direct measure of the discretionary component',
      'High-dividend ETF net flows',
      'S&P 500 three-month skew relative to its five-year range',
      'IG spread behaviour relative to underlying leverage metrics',
    ],
    confidence: 3,
  },
];

const scorecard = {
  updatedAt: now.toISOString(),
  calls: [
    { id: 'demo-1', storyId: stories[0].id, instrumentKey: 'us2y', instrumentLabel: 'US 2Y', assetClass: 'rates', direction: 'down', statedDirection: 'down', magnitude: '6-12bp', horizon: 'days', conviction: 4, rationale: 'Disinflation impulse from energy.', entryValue: 3.55, entryDisplay: '3.55%', openedAt: new Date(now - 6 * 864e5).toISOString(), status: 'hit', markValue: 3.42, markDisplay: '3.42%', moveAbs: -0.13, movePct: -3.66, moveDisplay: '-13bp', settledAt: new Date(now - 3 * 864e5).toISOString(), outcome: 'US 2Y down -13bp vs called down' },
    { id: 'demo-2', storyId: stories[1].id, instrumentKey: 'gold', instrumentLabel: 'Gold', assetClass: 'commodities', direction: 'up', statedDirection: 'up', magnitude: '4-9%', horizon: 'weeks', conviction: 4, rationale: 'Monetary credibility hedge.', entryValue: 3810, entryDisplay: '3,810', openedAt: new Date(now - 20 * 864e5).toISOString(), status: 'hit', markValue: 3985, markDisplay: '3,985', moveAbs: 175, movePct: 4.59, moveDisplay: '+4.59%', settledAt: new Date(now - 6 * 864e5).toISOString(), outcome: 'Gold up +4.59% vs called up' },
    { id: 'demo-3', storyId: stories[1].id, instrumentKey: 'dxy', instrumentLabel: 'Dollar index', assetClass: 'fx', direction: 'down', statedDirection: 'down', magnitude: '1.5-3%', horizon: 'weeks', conviction: 3, rationale: 'Credibility discount.', entryValue: 96.1, entryDisplay: '96.10', openedAt: new Date(now - 18 * 864e5).toISOString(), status: 'miss', markValue: 96.42, markDisplay: '96.42', moveAbs: 0.32, movePct: 0.33, moveDisplay: '+0.33%', settledAt: new Date(now - 4 * 864e5).toISOString(), outcome: 'Dollar index up +0.33% vs called down' },
    { id: 'demo-4', storyId: stories[0].id, instrumentKey: 'brent', instrumentLabel: 'Brent crude', assetClass: 'commodities', direction: 'down', statedDirection: 'down', magnitude: '5-8%', horizon: 'days', conviction: 4, rationale: 'Risk premium unwind.', entryValue: 72.9, entryDisplay: '72.90', openedAt: now.toISOString(), status: 'open', markValue: 68.4, markDisplay: '68.40', moveAbs: -4.5, movePct: -6.17, moveDisplay: '-6.17%' },
    { id: 'demo-5', storyId: stories[0].id, instrumentKey: 'eurusd', instrumentLabel: 'EUR/USD', assetClass: 'fx', direction: 'up', statedDirection: 'up', magnitude: '0.6-1.2%', horizon: 'days', conviction: 3, rationale: 'Terms of trade.', entryValue: 1.1791, entryDisplay: '1.1791', openedAt: now.toISOString(), status: 'open', markValue: 1.1842, markDisplay: '1.1842', moveAbs: 0.0051, movePct: 0.43, moveDisplay: '+0.43%' },
    { id: 'demo-6', storyId: stories[2].id, instrumentKey: 'vix', instrumentLabel: 'VIX', assetClass: 'vol', direction: 'up', statedDirection: 'up', magnitude: '2-4 points', horizon: 'weeks', conviction: 3, rationale: 'Correlation regime.', entryValue: 15.8, entryDisplay: '15.80', openedAt: new Date(now - 16 * 864e5).toISOString(), status: 'hit', markValue: 18.7, markDisplay: '18.70', moveAbs: 2.9, movePct: 18.35, moveDisplay: '+18.35%', settledAt: new Date(now - 2 * 864e5).toISOString(), outcome: 'VIX up +18.35% vs called up' },
    { id: 'demo-7', storyId: stories[2].id, instrumentKey: 'ig_oas', instrumentLabel: 'US IG OAS', assetClass: 'credit', direction: 'down', statedDirection: 'tighter', magnitude: '5-15bp', horizon: 'weeks', conviction: 3, rationale: 'Substitution flow.', entryValue: 0.99, entryDisplay: '0.99%', openedAt: new Date(now - 15 * 864e5).toISOString(), status: 'hit', markValue: 0.94, markDisplay: '0.94%', moveAbs: -0.05, movePct: -5.05, moveDisplay: '-5bp', settledAt: new Date(now - 1 * 864e5).toISOString(), outcome: 'US IG OAS down -5bp vs called down' },
    { id: 'demo-8', storyId: stories[0].id, instrumentKey: 'spx', instrumentLabel: 'S&P 500', assetClass: 'equities', direction: 'up', statedDirection: 'up', magnitude: '1-2%', horizon: 'days', conviction: 3, rationale: 'Disinflation relief.', entryValue: 6855, entryDisplay: '6,855', openedAt: new Date(now - 9 * 864e5).toISOString(), status: 'miss', markValue: 6842, markDisplay: '6,842', moveAbs: -13, movePct: -0.19, moveDisplay: '-0.19%', settledAt: new Date(now - 6 * 864e5).toISOString(), outcome: 'S&P 500 down -0.19% vs called up' },
  ],
};

const payload = {
  version: 1,
  date,
  dateLabel,
  generatedAt: now.toISOString(),
  model: 'demo/seed',
  demo: true,
  marketRead: {
    headline: 'An energy unwind is doing the work of a policy pivot',
    body: 'A sanctions package read as de-escalatory took six percent off Brent and pulled the US front end with it, while the long end sold off on unchanged supply — a steepening that says more about fiscal credibility than about oil. The dollar fell against importer currencies on terms of trade rather than on rate differentials, which is the same signal a different way round. Gold near record highs with real yields elevated is the market pricing a monetary-credibility discount that neither the curve nor the equity multiple has fully absorbed.',
    regime: 'credibility discount, not a growth scare',
  },
  snapshot,
  stories,
  rejected: [
    { title: 'SpaceX plans to put Nvidia-powered AI satellites in orbit next year', why: 'Genuine capex signal but no near-term transmission beyond a single supply chain already trading on it.', score: 58.1 },
    { title: 'Iconic fast-food fried chicken chain closes over 300 restaurants', why: 'Single-name consumer story with no read-across to a tradeable asset class.', score: 31.4 },
    { title: 'My father-in-law passed away, leaving a house with tenants. Do I evict them?', why: 'Personal finance content, not market news.', score: 12.0 },
    { title: 'Billionaire investor says today’s AI boom echoes the Nifty Fifty', why: 'Opinion with no new information; the analogy has been in circulation for eighteen months.', score: 44.7 },
  ],
  diagnostics: {
    articlesIngested: 287,
    clustersConsidered: 25,
    feeds: Array.from({ length: 22 }, (_, i) => ({ id: `feed-${i}`, name: `Source ${i}`, ok: i < 19, parsed: 20, fresh: 13, ms: 300, error: i < 19 ? null : 'HTTP 403' })),
    marketProviders: snapshot.report,
    usage: { calls: 4, inputTokens: 28400, outputTokens: 14900, estimatedCostUsd: 0.2058 },
    runtimeMs: 41200,
  },
  scorecardSummary: {
    total: 8, open: 2, flat: 0, hits: 4, misses: 2, settled: 6, hitRate: 66.7,
    byClass: {
      rates: { hits: 1, total: 1, rate: 100 },
      commodities: { hits: 1, total: 1, rate: 100 },
      fx: { hits: 0, total: 1, rate: 0 },
      vol: { hits: 1, total: 1, rate: 100 },
      credit: { hits: 1, total: 1, rate: 100 },
      equities: { hits: 0, total: 1, rate: 0 },
    },
    byConviction: { 3: { hits: 2, total: 4, rate: 50 }, 4: { hits: 2, total: 2, rate: 100 } },
  },
};

await mkdir(join(DATA, 'archive'), { recursive: true });
await writeFile(join(DATA, 'latest.json'), JSON.stringify(payload, null, 2) + '\n');
await writeFile(join(DATA, 'archive', `${date}.json`), JSON.stringify(payload, null, 2) + '\n');
await writeFile(join(DATA, 'scorecard.json'), JSON.stringify(scorecard, null, 2) + '\n');

let index = [];
try { index = JSON.parse(await readFile(join(DATA, 'archive', 'index.json'), 'utf8')); } catch { /* first run */ }
index = index.filter((e) => e.date !== date);
index.push({ date, dateLabel, headline: payload.marketRead.headline, regime: payload.marketRead.regime, storyCount: stories.length });
index.sort((a, b) => b.date.localeCompare(a.date));
await writeFile(join(DATA, 'archive', 'index.json'), JSON.stringify(index, null, 2) + '\n');

console.log(`Seeded demo data for ${date} (${stories.length} stories, ${scorecard.calls.length} calls).`);
console.log('Next: node scripts/build.mjs');
