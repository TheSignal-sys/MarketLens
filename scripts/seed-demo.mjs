#!/usr/bin/env node
/**
 * seed-demo.mjs — writes a representative data/latest.json without calling
 * any API, so you can preview the site before wiring up keys.
 *
 *   node scripts/seed-demo.mjs && node scripts/build.mjs
 *
 * The content is illustrative but written to the standard the real prompt
 * asks for: plain English first, desk language underneath, no jargon left
 * unexplained. Use it as the benchmark when judging real output.
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
  report: [{ provider: 'demo', ok: true, count: 22, ms: 0, error: null }],
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
    id: `${date}-oil-falls-sanctions-de-escalation`,
    rank: 1,
    editorNote: 'Widest reach of any story today. A big move in the oil price feeds straight into inflation, which changes what central banks are expected to do, which moves almost everything else.',
    materiality: { score: 84.2, components: { corroboration: 26.1, authority: 20, breadth: 18, salience: 17.2, recency: 9.4 }, distinctSources: 7, salienceTerms: ['sanctions', 'oil', 'crude', 'brent', 'inflation', 'dollar'] },
    sources: ['MarketWatch', 'Investing.com Commodities', 'Financial Times', 'CNBC', 'Yahoo Finance', 'Guardian Business', 'BBC Business'],
    links: [{ name: 'MarketWatch', url: 'https://www.marketwatch.com/', title: 'New sanctions on Iran send oil prices to their biggest drop in three weeks' }],
    headlines: ['New sanctions on Iran send oil prices to their biggest drop in three weeks, while raising hopes of a settlement'],
    newestAt: now.toISOString(),
    headline: 'Oil drops 6% and drags interest rate expectations down with it',
    standfirst: 'New sanctions on Iran were read as a step towards a deal rather than a step towards conflict, and the oil price fell sharply.',
    classification: {
      eventType: 'geopolitical', pricedIn: 'surprise',
      pricedInRationale: 'Investors were positioned for oil to rise on this news. It fell instead. That tells you the market had the direction wrong, not just the size.',
      persistence: 'weeks', regionFocus: ['Global', 'US', 'Europe'],
    },
    whatHappened: {
      plain: 'The US announced a wide package of sanctions on Iran. Sanctions normally restrict oil supply and push prices up. This time the market read them differently. Because the package sets out formal terms and a negotiating process, traders concluded that the chance of military action just fell, and that mattered more than the supply restrictions. Brent crude fell about 6%, its biggest one-day drop in three weeks.',
      whyItMatters: 'Oil is one of the few prices that feeds into almost everything else. It affects what you pay for petrol and heating, which affects inflation, which affects whether central banks cut interest rates, which affects the price of nearly every investment.',
      detail: 'The move removes an embedded geopolitical risk premium rather than repricing physical supply. Energy equities underperformed the index materially on the session.',
    },
    chains: [
      {
        channel: 'policy-reaction',
        links: [
          { plain: 'Cheaper oil means cheaper petrol and cheaper energy bills over the next few months.', detail: 'A 6% fall in crude takes roughly 0.1 to 0.2 percentage points off headline inflation over the following two prints, via the energy component.' },
          { plain: 'That pulls measured inflation down, which removes one reason for central banks to keep interest rates high.', detail: 'The energy contribution to headline CPI turns negative, loosening the near-term constraint on the easing path.' },
          { plain: 'Investors therefore expect rate cuts sooner, and short-term government bond yields fall.', detail: 'The front end of the curve rallies as the market prices a faster cutting cycle. US 2-year yields fell 7 basis points.' },
          { plain: 'But long-term yields went the other way, because governments still need to borrow just as much money.', detail: 'The long end sold off on unchanged issuance and an unchanged term premium, which energy prices do not touch. The result is a steeper curve.' },
        ],
        endpoint: 'The gap between short and long-term US government bond yields',
        strength: 'strong',
      },
      {
        channel: 'fx-terms-of-trade',
        links: [
          { plain: 'Countries that import most of their oil, like Germany and Japan, suddenly have a smaller bill to pay.', detail: 'Terms of trade improve for large net energy importers, reducing the current account drag.' },
          { plain: 'They need fewer dollars to buy that oil, because oil is priced in dollars worldwide.', detail: 'Marginal dollar demand for energy invoicing falls.' },
          { plain: 'So their currencies strengthen against the dollar, while currencies of oil-exporting countries weaken.', detail: 'EUR and JPY outperform; commodity currencies such as NOK, CAD and COP underperform on the same signal.' },
        ],
        endpoint: 'The euro, the yen, and oil-exporter currencies',
        strength: 'moderate',
      },
      {
        channel: 'earnings',
        links: [
          { plain: 'Oil companies earn less per barrel, so the money they had planned to spend next year gets cut.', detail: 'Lower realised prices compress upstream cash flow and pressure marginal barrel economics, particularly in US shale.' },
          { plain: 'The companies that supply the oil industry lose orders as a result. That includes drilling contractors, specialist steel makers and industrial gas suppliers.', detail: 'Oilfield services order books, OCTG demand and industrial gas volumes are affected with a two to three quarter lag.' },
          { plain: 'This shows up months later, when those companies report, not today.', detail: 'The lag between the producer move and the supply chain repricing at the next capex guidance round is the tradeable window.' },
        ],
        endpoint: 'Oilfield services companies and industrial suppliers',
        strength: 'moderate',
      },
    ],
    assetImpacts: [
      { assetClass: 'commodities', instrument: 'Brent crude', direction: 'down', magnitude: '5 to 8%', horizon: 'days', conviction: 4, order: 1, plain: 'The oil price falls because the risk of conflict disrupting supply just went down.', detail: 'Direct removal of the geopolitical risk premium as the sanctions framework is read as de-escalatory.' },
      { assetClass: 'rates', instrument: 'US 2Y', direction: 'down', magnitude: '6 to 12 basis points', horizon: 'days', conviction: 4, order: 2, plain: 'Short-term bond yields fall because cheaper energy means lower inflation, so rate cuts look more likely.', detail: 'The front end prices a faster easing path as the energy contribution to headline inflation turns negative.' },
      { assetClass: 'rates', instrument: 'US 2s30s curve', direction: 'steeper', magnitude: '12 to 20 basis points', horizon: 'weeks', conviction: 3, order: 2, plain: 'The gap between short and long-term borrowing costs widens, because only the short end responds to the inflation news.', detail: 'Front end rallies on the disinflation impulse while the long end stays anchored by unchanged issuance and term premium.' },
      { assetClass: 'fx', instrument: 'EUR/USD', direction: 'up', magnitude: '0.6 to 1.2%', horizon: 'days', conviction: 3, order: 2, plain: 'The euro strengthens because Europe imports most of its energy and just got a discount on it.', detail: 'Terms-of-trade improvement for a large net energy importer, amplified by narrowing front-end rate differentials.' },
      { assetClass: 'equities', instrument: 'European airlines and car makers', direction: 'up', magnitude: '1.5 to 3%', horizon: 'weeks', conviction: 3, order: 2, plain: 'Fuel is one of the biggest costs for airlines, and cheaper petrol makes people more willing to drive and to buy cars.', detail: 'Jet fuel is a direct and often partly unhedged input; for autos the channel is demand elasticity rather than input cost.' },
      { assetClass: 'credit', instrument: 'US high-yield energy spreads', direction: 'wider', magnitude: '25 to 45 basis points', horizon: 'weeks', conviction: 3, order: 2, plain: 'Heavily indebted oil companies become riskier to lend to, because their income just fell while their debts did not.', detail: 'Sub-$65 WTI pressures interest coverage ratios for the levered shale cohort heading into a 2027 refinancing wall.' },
      { assetClass: 'vol', instrument: 'Oil price volatility', direction: 'down', magnitude: '3 to 6 points', horizon: 'weeks', conviction: 2, order: 2, plain: 'With a formal process in place, the range of possible outcomes narrows, so the market expects smaller swings.', detail: 'Implied vol compresses as the outcome distribution tightens, though realised vol stays elevated while positioning clears.' },
    ],
    whatMarketMisses: {
      plain: 'Everyone is treating cheaper oil as straightforwardly good news, and for most companies it is. The part being overlooked is what it does to oil companies that borrowed heavily. A lot of American shale producers took on debt that only makes sense above a certain oil price, and they were counting on falling interest rates to let them refinance next year. This news hands them the lower interest rates and takes away the income that would have made them worth lending to. Those two things arriving together is worse for them than either one alone, and it is not visible in the headline credit numbers because the wider market is rallying at the same time.',
      detail: 'HY energy spreads should widen even as the index tightens on duration. The divergence within the asset class will be masked by the top-line index spread for several weeks.',
    },
    falsifiers: [
      'Brent recovers above $74 within five trading days, which would mean the market has reread the sanctions as supply-restricting after all',
      'Short and long-term yields fall together rather than the curve steepening, which would mean this is being traded as a slowdown warning rather than an inflation story',
      'High-yield energy spreads tighten alongside the wider index, which would directly disprove the credit argument',
      'OPEC+ announces production cuts that offset the supply picture and restore the risk premium',
    ],
    tradeExpression: [
      {
        idea: 'Bet on the gap between short and long-term yields, not on yields overall',
        plain: 'Buy short-dated government bonds and sell long-dated ones in equal risk size. You profit if short-term yields fall further than long-term ones, without needing to be right about the overall direction of interest rates.',
        instrument: 'US 2s30s steepener via futures, DV01-neutral',
        risk: 'If the market decides this is a sign of a slowing economy, all yields fall together and the position makes nothing while the underlying view was right.',
      },
      {
        idea: 'Separate the indebted oil companies from the rest of the credit market',
        plain: 'Hold the broad high-yield bond market while buying protection against default by the most indebted oil producers specifically. This isolates the problem from the rally happening around it.',
        instrument: 'Long HY index CDX against a single-name protection basket in levered E&P',
        risk: 'One of those companies sells assets or raises equity and solves its funding problem before the argument plays out.',
      },
    ],
    watchNext: [
      'The next US inflation reading, which shows whether cheaper energy is actually feeding through',
      'The OPEC+ monitoring committee meeting, and whether they cut supply in response',
      'Third-quarter results from oil companies and their spending plans for next year',
      'Weekly US oil inventory data, as physical confirmation of the demand picture',
    ],
    glossary: [
      { term: 'Basis point', plain: 'One hundredth of a percentage point. A move from 4.00% to 4.10% is ten basis points.' },
      { term: 'Yield', plain: 'The annual return you get from holding a bond. When bond prices go up, yields go down, and vice versa.' },
      { term: 'The curve', plain: 'The pattern of yields across different lending periods. A "steeper" curve means long-term borrowing has become more expensive relative to short-term borrowing.' },
      { term: 'Credit spread', plain: 'The extra interest a company pays to borrow compared with the government. Wider means investors see more risk.' },
      { term: 'High yield', plain: 'Bonds issued by companies considered more likely to default, so they pay more interest. Sometimes called junk bonds.' },
      { term: 'Terms of trade', plain: 'The relationship between what a country earns from exports and what it pays for imports. Cheaper oil improves it for importers.' },
      { term: 'Risk premium', plain: 'The extra amount built into a price to compensate for the chance something goes wrong. When the risk fades, the price falls.' },
    ],
    confidence: 4,
  },
  {
    id: `${date}-dollar-stops-following-interest-rates`,
    rank: 2,
    editorNote: 'A slow-moving structural story rather than a headline. It matters because it changes how different markets move in relation to each other, which is what most investors rely on to control risk.',
    materiality: { score: 71.6, components: { corroboration: 20.6, authority: 13, breadth: 18, salience: 14.8, recency: 8.2 }, distinctSources: 4, salienceTerms: ['dollar', 'fed', 'treasury', 'monetary policy', 'reserves'] },
    sources: ['Investing.com FX', 'Financial Times', 'MarketWatch', 'CNBC Economy'],
    links: [{ name: 'Investing.com', url: 'https://www.investing.com/', title: 'Why the dollar outlook now depends on confidence in US policy' }],
    headlines: ['Why the dollar outlook now depends on confidence in US policy', 'Strategists say sell the dollar against these currencies'],
    newestAt: now.toISOString(),
    headline: 'The dollar has stopped following interest rates, and that breaks a lot of hedges',
    standfirst: 'Several research desks now argue the dollar is moving on confidence in US institutions rather than on the interest rate gap that normally drives it.',
    classification: {
      eventType: 'monetary-policy', pricedIn: 'partly-priced',
      pricedInRationale: 'Most investors already agree the dollar is heading lower, so that part is in the price. What is not in the price is the change in how the dollar moves relative to other assets.',
      persistence: 'lasting', regionFocus: ['US', 'Global'],
    },
    whatHappened: {
      plain: 'For decades, the simplest rule for predicting the dollar was to look at US interest rates compared with those elsewhere. Higher US rates meant a stronger dollar, because investors moved money to where it earned more. That rule has stopped working. The dollar has weakened this year even though the interest rate gap should have supported it. Research desks are converging on the explanation that investors are demanding a discount for holding dollars because they are less confident in how US policy is being run.',
      whyItMatters: 'This is not really about the dollar going up or down. It is about a relationship breaking. Most large investors build portfolios assuming certain assets move in predictable ways relative to each other. When one of those relationships stops holding, protections that were supposed to offset each other stop doing so, and that is usually discovered at the worst possible time.',
      detail: 'The dollar is trading with a credibility discount rather than a cyclical one, which decouples it from the two-year rate differential that historically explained most of the variance.',
    },
    chains: [
      {
        channel: 'correlation',
        links: [
          { plain: 'If the dollar no longer tracks interest rates, then models built on that relationship give the wrong answer.', detail: 'The historical dollar/rate-differential beta breaks down, invalidating models calibrated on it.' },
          { plain: 'Investors who hedged their US bond holdings by taking a matching currency position find the hedge no longer offsets anything.', detail: 'Cross-asset hedge ratios are being set off a relationship that has stopped explaining the move.' },
          { plain: 'Funds that use borrowed money size their positions based on how assets have moved together in the past. When that changes, they are forced to cut positions to stay within their risk limits.', detail: 'Volatility-targeting and risk-parity strategies size leverage off trailing correlation matrices that have not yet registered the regime change.' },
        ],
        endpoint: 'Leveraged multi-asset funds and their hedging',
        strength: 'strong',
      },
      {
        channel: 'discount-rate',
        links: [
          { plain: 'If investors want compensation for holding dollars, they want it most on long-dated US government debt, where they are locked in for decades.', detail: 'The credibility discount is expressed as a higher term premium at the long end.' },
          { plain: 'That pushes long-term yields up regardless of what happens to official interest rates.', detail: 'Long-end yields rise independently of the policy path.' },
          { plain: 'Gold benefits, because it is the standard place investors go when they doubt the currency itself rather than the economy.', detail: 'Gold above $3,900 with elevated real yields is a monetary credibility hedge, not an inflation hedge, at these levels.' },
        ],
        endpoint: 'Long-dated US government bonds and gold',
        strength: 'strong',
      },
      {
        channel: 'positioning',
        links: [
          { plain: 'Almost every large fund is now betting against the dollar.', detail: 'Short dollar is a consensus position across macro funds and real money.' },
          { plain: 'When everyone is on the same side, there are few buyers left to push the move further.', detail: 'Crowding reduces the marginal seller and compresses the forward return of the trade.' },
          { plain: 'Any piece of news that restores confidence causes a sharp reversal, larger than the news itself justifies.', detail: 'A credibility-restoring event triggers a squeeze disproportionate to its fundamental content.' },
        ],
        endpoint: 'Anyone currently short the dollar',
        strength: 'moderate',
      },
    ],
    assetImpacts: [
      { assetClass: 'fx', instrument: 'Dollar index', direction: 'down', magnitude: '1.5 to 3%', horizon: 'quarters', conviction: 3, order: 1, plain: 'The dollar weakens over time, though the crowded positioning means it will not go in a straight line.', detail: 'Structural credibility discount, offset in the near term by extremely crowded short positioning.' },
      { assetClass: 'rates', instrument: 'US 30Y', direction: 'up', magnitude: '15 to 30 basis points', horizon: 'quarters', conviction: 3, order: 2, plain: 'Long-term US borrowing costs rise, because investors want paying more to lend for thirty years.', detail: 'Term premium expansion, independent of where the policy rate settles.' },
      { assetClass: 'commodities', instrument: 'Gold', direction: 'up', magnitude: '4 to 9%', horizon: 'quarters', conviction: 4, order: 2, plain: 'Gold rises because it is what investors buy when they lose confidence in a currency rather than in an economy.', detail: 'The cleanest available expression of a monetary credibility hedge, and the least dependent on the timing of the dollar move.' },
      { assetClass: 'vol', instrument: 'Currency volatility', direction: 'up', magnitude: '1.5 to 3 points', horizon: 'weeks', conviction: 3, order: 2, plain: 'Currency markets get choppier, because the old rule of thumb no longer tells anyone where the dollar should be.', detail: 'A correlation regime change raises realised volatility before implied volatility catches up. The gap is where the value sits.' },
      { assetClass: 'equities', instrument: 'US exporters', direction: 'up', magnitude: '1 to 2.5%', horizon: 'quarters', conviction: 2, order: 2, plain: 'American companies that sell abroad earn more when converted back into a weaker dollar, though higher long-term rates work against them.', detail: 'Translation tailwind on overseas earnings, partly offset by the higher discount rate applied to those cash flows.' },
    ],
    whatMarketMisses: {
      plain: 'Nearly everyone agrees the dollar is going lower, which makes that view almost worthless as a way to make money. The overlooked consequence is what a dollar driven by confidence rather than by interest rates does to portfolio construction. The standard way to hold foreign bonds safely is to offset the currency exposure, and that only works if the two move in a stable relationship. If they do not, the protection fails at exactly the moment both positions are losing money. The interesting position is not being short the dollar. It is owning the disruption itself, because the eventual unwind will be funds mechanically forced to cut risk rather than anyone changing their mind about the fundamentals.',
      detail: 'Long FX volatility and long the correlation break expresses this better than short spot, which is already consensus.',
    },
    falsifiers: [
      'The dollar re-establishes a stable relationship with the two-year rate gap over a full quarter',
      'Gold fails to make a new high while the dollar keeps falling, which would break the confidence explanation',
      'Currency volatility falls to the bottom of its two-year range despite continued dollar weakness',
      'A credible plan to reduce government borrowing removes the discount at its source',
    ],
    tradeExpression: [
      {
        idea: 'Bet on movement rather than on direction',
        plain: 'Buy options that pay off if the euro-dollar exchange rate moves a long way in either direction. Everyone is already betting on which way it goes, so the mispriced thing is how violently it gets there.',
        instrument: 'Long 6-month EUR/USD strangles, part-funded by selling short-dated wings',
        risk: 'If the dollar drifts steadily lower without any sharp moves, the options expire worthless even though the underlying view was correct.',
      },
      {
        idea: 'Own gold instead of shorting the dollar',
        plain: 'Hold gold against a basket of currencies rather than betting against the dollar directly. It captures the same loss of confidence without sitting in the most crowded trade in the market.',
        instrument: 'Long gold versus a short G10 dollar basket',
        risk: 'In a genuine liquidity crisis, investors sell gold to raise cash regardless of what they believe about currencies.',
      },
    ],
    watchNext: [
      'The next Federal Reserve meeting, read for what it signals about independence rather than for the rate decision',
      'Demand at long-dated US government bond auctions, which measures directly what investors want paying',
      'Weekly Federal Reserve data on foreign official holdings of US debt',
      'The rolling 60-day relationship between the dollar and the rate gap, which is the direct test of this argument',
    ],
    glossary: [
      { term: 'Interest rate differential', plain: 'The gap between interest rates in two countries. Money tends to flow towards the higher rate, which usually supports that currency.' },
      { term: 'Hedge', plain: 'A second position taken to offset the risk in the first one. It only works if the two reliably move in opposite directions.' },
      { term: 'Term premium', plain: 'The extra yield investors demand for lending money for a long time rather than a short time.' },
      { term: 'Correlation', plain: 'How closely two things move together. Portfolio risk models depend heavily on correlations staying stable.' },
      { term: 'Crowded trade', plain: 'A position almost everyone already holds. Crowded trades tend to unwind violently, because there is nobody left to buy.' },
      { term: 'Option', plain: 'A contract giving the right, but not the obligation, to buy or sell at a set price. Used to bet on the size of a move rather than its direction.' },
      { term: 'Leverage', plain: 'Using borrowed money to increase the size of a position. It magnifies gains and losses, and forces selling when risk limits are breached.' },
    ],
    confidence: 3,
  },
  {
    id: `${date}-sp500-dividend-yield-record-low`,
    rank: 3,
    editorNote: 'Widely reported as a valuation warning. The more interesting consequence is what it does to who owns shares and how they behave in a downturn.',
    materiality: { score: 63.4, components: { corroboration: 16.4, authority: 13, breadth: 13.5, salience: 12.1, recency: 8.4 }, distinctSources: 3, salienceTerms: ['earnings', 'valuation', 'buyback', 'megacap'] },
    sources: ['Yahoo Finance', 'MarketWatch', 'CNBC'],
    links: [{ name: 'Yahoo Finance', url: 'https://finance.yahoo.com/', title: 'S&P 500 dividend yield hits record low near 1%' }],
    headlines: ['S&P 500 dividend yield hits record low near 1% and it has some retirees rethinking their strategies'],
    newestAt: now.toISOString(),
    headline: 'Shares pay almost no income now, and that changes who owns them',
    standfirst: 'The dividend yield on the S&P 500 has fallen to a record low near 1%, well below what cash pays.',
    classification: {
      eventType: 'flows', pricedIn: 'expected',
      pricedInRationale: 'The number itself is well known and correctly understood as a side effect of index concentration. What has not been thought through is the effect on who is willing to own shares.',
      persistence: 'lasting', regionFocus: ['US'],
    },
    whatHappened: {
      plain: 'A dividend is a cash payment a company makes to shareholders out of profits. The dividend yield is that payment as a percentage of the share price. Across the 500 largest US companies it has fallen to about 1%, the lowest on record, and below what you get on cash in the bank. Two things caused it. The largest technology companies now dominate the index and mostly pay no dividend, and companies increasingly return cash by buying back their own shares instead.',
      whyItMatters: 'Taken alone the number means little, because buybacks return cash too and are not counted in it. What matters is that a lot of investors, particularly pension funds and retirees, are required to generate income. If shares no longer produce any, those investors go elsewhere, and the people left holding shares behave differently.',
      detail: 'Total shareholder yield including buybacks is unremarkable. The signal is in the composition of the shareholder base, not the multiple.',
    },
    chains: [
      {
        channel: 'substitution',
        links: [
          { plain: 'Investors who need regular income can no longer get it from the main share index.', detail: 'Income-mandated investors cannot meet distribution requirements from cap-weighted equity.' },
          { plain: 'They move money into corporate bonds, infrastructure, and funds that specifically target high-dividend companies.', detail: 'Rotation into IG credit, private credit, infrastructure and high-dividend factor strategies.' },
          { plain: 'That leaves the index owned almost entirely by investors who only care about the share price going up, and those investors sell faster when it does not.', detail: 'The marginal holder becomes exclusively total-return oriented and more price-sensitive in a drawdown.' },
        ],
        endpoint: 'How sharply share prices fall in a selloff',
        strength: 'moderate',
      },
      {
        channel: 'earnings',
        links: [
          { plain: 'Buybacks have replaced dividends as the main way companies return cash.', detail: 'The substitution has run for two decades and accelerated with index concentration.' },
          { plain: 'The difference is that companies cut buybacks immediately when profits fall, but defend dividends for as long as they can, because cutting one is seen as an admission of trouble.', detail: 'Buybacks are discretionary and procyclical; dividends are sticky and defended through several quarters of deterioration.' },
          { plain: 'So the index has quietly swapped a reliable source of return for one that disappears exactly when things get difficult.', detail: 'A stable return component has been converted into a procyclical one, which deepens realised drawdowns.' },
        ],
        endpoint: 'The depth of the next equity market fall',
        strength: 'strong',
      },
    ],
    assetImpacts: [
      { assetClass: 'equities', instrument: 'High-dividend share strategies', direction: 'up', magnitude: '1 to 3% relative', horizon: 'quarters', conviction: 3, order: 2, plain: 'Funds targeting income-paying shares attract steady money from investors who can no longer find income in the main index.', detail: 'Persistent mandate-driven flow into high-dividend factor strategies.' },
      { assetClass: 'credit', instrument: 'US IG OAS', direction: 'tighter', magnitude: '5 to 15 basis points', horizon: 'quarters', conviction: 2, order: 2, plain: 'Corporate bonds get more expensive as income investors pushed out of shares buy them instead.', detail: 'Substitution demand acts as a non-economic bid, partly explaining why IG spreads look rich relative to leverage metrics.' },
      { assetClass: 'vol', instrument: 'S&P 500 downside protection', direction: 'up', magnitude: '1 to 3 points of skew', horizon: 'quarters', conviction: 3, order: 2, plain: 'Insurance against a market fall gets more expensive, because a shareholder base with no income has less reason to sit through a bad year.', detail: 'Skew steepens without a change in at-the-money volatility, reflecting a deeper left tail.' },
      { assetClass: 'equities', instrument: 'S&P 500', direction: 'mixed', magnitude: 'no clear direction', horizon: 'quarters', conviction: 2, order: 1, plain: 'The dividend yield on its own says almost nothing about whether shares are expensive.', detail: 'Total shareholder yield including buybacks is close to its long-run average.' },
    ],
    whatMarketMisses: {
      plain: 'Most coverage treats this as a warning that shares are expensive. That reading is wrong, because it ignores buybacks, which return just as much cash and are not in the number. The real consequence is about behaviour rather than valuation. Dividends are defended by company boards for years after profits start falling, because cutting one is publicly humiliating. Buybacks are switched off in a single quarter with no announcement. The index has swapped one for the other, which means that in the next serious downturn the support disappears at exactly the moment it is needed. Shares have not become more expensive. They have become more fragile, and that belongs in the price of downside protection rather than in the valuation debate.',
      detail: 'The correct expression is in skew, not in the multiple.',
    },
    falsifiers: [
      'Total shareholder yield including buybacks also hits a record low, which would restore the simple valuation reading',
      'High-dividend strategies underperform for two consecutive quarters despite the income gap',
      'Downside protection on the S&P 500 gets cheaper over six months',
      'Buyback programmes hold up through the next fall in profits',
    ],
    tradeExpression: [
      {
        idea: 'Buy protection against a fall rather than betting on direction',
        plain: 'Buy insurance against the market dropping, and pay for it by giving up some of the gain if it rises sharply. This is a bet on the shape of the outcome rather than on whether the market goes up or down.',
        instrument: 'S&P 500 put spread collar',
        risk: 'A steady rise means you pay for protection you never use and cap the upside you would otherwise have had.',
      },
      {
        idea: 'Follow the income money',
        plain: 'Own high-dividend shares while shorting the equal-weighted index, so you capture the flow into income strategies without taking a view on the market overall.',
        instrument: 'Long high-dividend factor versus short equal-weight S&P 500',
        risk: 'High-dividend baskets carry hidden exposure to interest rates and to value shares, which can swamp the flow effect entirely.',
      },
    ],
    watchNext: [
      'Quarterly buyback authorisation totals, which measure the discretionary part directly',
      'Net money flowing into high-dividend exchange traded funds',
      'The price of three-month downside protection relative to its five-year range',
      'Whether corporate bond spreads keep tightening despite rising company debt levels',
    ],
    glossary: [
      { term: 'Dividend', plain: 'A cash payment a company makes to its shareholders out of profits, usually quarterly.' },
      { term: 'Dividend yield', plain: 'The annual dividend as a percentage of the share price. A £2 dividend on a £100 share is a 2% yield.' },
      { term: 'Buyback', plain: 'A company buying its own shares in the market. It returns cash to shareholders by making each remaining share represent a bigger slice of the company.' },
      { term: 'Index concentration', plain: 'When a small number of very large companies make up most of an index, their characteristics dominate the whole thing.' },
      { term: 'Skew', plain: 'The extra cost of insuring against a market fall compared with betting on a rise. Rising skew means investors are more worried about downside.' },
      { term: 'Procyclical', plain: 'Something that gets stronger in good times and weaker in bad times, which amplifies whatever is already happening.' },
    ],
    confidence: 3,
  },
];

const scorecard = {
  updatedAt: now.toISOString(),
  calls: [
    { id: 'demo-1', storyId: stories[0].id, instrumentKey: 'us2y', instrumentLabel: 'US 2Y', assetClass: 'rates', direction: 'down', statedDirection: 'down', magnitude: '6 to 12 basis points', horizon: 'days', conviction: 4, rationale: 'Cheaper energy lowers inflation.', entryValue: 3.55, entryDisplay: '3.55%', openedAt: new Date(now - 6 * 864e5).toISOString(), status: 'hit', markValue: 3.42, markDisplay: '3.42%', moveAbs: -0.13, movePct: -3.66, moveDisplay: '-13bp', settledAt: new Date(now - 3 * 864e5).toISOString(), outcome: 'US 2Y down -13bp vs called down' },
    { id: 'demo-2', storyId: stories[1].id, instrumentKey: 'gold', instrumentLabel: 'Gold', assetClass: 'commodities', direction: 'up', statedDirection: 'up', magnitude: '4 to 9%', horizon: 'weeks', conviction: 4, rationale: 'Confidence hedge.', entryValue: 3810, entryDisplay: '3,810', openedAt: new Date(now - 20 * 864e5).toISOString(), status: 'hit', markValue: 3985, markDisplay: '3,985', moveAbs: 175, movePct: 4.59, moveDisplay: '+4.59%', settledAt: new Date(now - 6 * 864e5).toISOString(), outcome: 'Gold up +4.59% vs called up' },
    { id: 'demo-3', storyId: stories[1].id, instrumentKey: 'dxy', instrumentLabel: 'Dollar index', assetClass: 'fx', direction: 'down', statedDirection: 'down', magnitude: '1.5 to 3%', horizon: 'weeks', conviction: 3, rationale: 'Credibility discount.', entryValue: 96.1, entryDisplay: '96.10', openedAt: new Date(now - 18 * 864e5).toISOString(), status: 'miss', markValue: 96.42, markDisplay: '96.42', moveAbs: 0.32, movePct: 0.33, moveDisplay: '+0.33%', settledAt: new Date(now - 4 * 864e5).toISOString(), outcome: 'Dollar index up +0.33% vs called down' },
    { id: 'demo-4', storyId: stories[0].id, instrumentKey: 'brent', instrumentLabel: 'Brent crude', assetClass: 'commodities', direction: 'down', statedDirection: 'down', magnitude: '5 to 8%', horizon: 'days', conviction: 4, rationale: 'Risk premium unwind.', entryValue: 72.9, entryDisplay: '72.90', openedAt: now.toISOString(), status: 'open', markValue: 68.4, markDisplay: '68.40', moveAbs: -4.5, movePct: -6.17, moveDisplay: '-6.17%' },
    { id: 'demo-5', storyId: stories[0].id, instrumentKey: 'eurusd', instrumentLabel: 'EUR/USD', assetClass: 'fx', direction: 'up', statedDirection: 'up', magnitude: '0.6 to 1.2%', horizon: 'days', conviction: 3, rationale: 'Terms of trade.', entryValue: 1.1791, entryDisplay: '1.1791', openedAt: now.toISOString(), status: 'open', markValue: 1.1842, markDisplay: '1.1842', moveAbs: 0.0051, movePct: 0.43, moveDisplay: '+0.43%' },
    { id: 'demo-6', storyId: stories[2].id, instrumentKey: 'vix', instrumentLabel: 'VIX', assetClass: 'vol', direction: 'up', statedDirection: 'up', magnitude: '2 to 4 points', horizon: 'weeks', conviction: 3, rationale: 'Correlation regime.', entryValue: 15.8, entryDisplay: '15.80', openedAt: new Date(now - 16 * 864e5).toISOString(), status: 'hit', markValue: 18.7, markDisplay: '18.70', moveAbs: 2.9, movePct: 18.35, moveDisplay: '+18.35%', settledAt: new Date(now - 2 * 864e5).toISOString(), outcome: 'VIX up +18.35% vs called up' },
    { id: 'demo-7', storyId: stories[2].id, instrumentKey: 'ig_oas', instrumentLabel: 'US IG OAS', assetClass: 'credit', direction: 'down', statedDirection: 'tighter', magnitude: '5 to 15 basis points', horizon: 'weeks', conviction: 3, rationale: 'Substitution flow.', entryValue: 0.99, entryDisplay: '0.99%', openedAt: new Date(now - 15 * 864e5).toISOString(), status: 'hit', markValue: 0.94, markDisplay: '0.94%', moveAbs: -0.05, movePct: -5.05, moveDisplay: '-5bp', settledAt: new Date(now - 1 * 864e5).toISOString(), outcome: 'US IG OAS down -5bp vs called down' },
    { id: 'demo-8', storyId: stories[0].id, instrumentKey: 'spx', instrumentLabel: 'S&P 500', assetClass: 'equities', direction: 'up', statedDirection: 'up', magnitude: '1 to 2%', horizon: 'days', conviction: 3, rationale: 'Relief rally.', entryValue: 6855, entryDisplay: '6,855', openedAt: new Date(now - 9 * 864e5).toISOString(), status: 'miss', markValue: 6842, markDisplay: '6,842', moveAbs: -13, movePct: -0.19, moveDisplay: '-0.19%', settledAt: new Date(now - 6 * 864e5).toISOString(), outcome: 'S&P 500 down -0.19% vs called up' },
  ],
};

const payload = {
  version: 2,
  date,
  dateLabel,
  generatedAt: now.toISOString(),
  model: 'demo/seed',
  demo: true,
  marketRead: {
    headline: 'Cheaper oil is doing the job of an interest rate cut',
    body: 'A sanctions package that markets read as a step towards a settlement took 6% off the oil price, which pulled short-term interest rate expectations down with it. Long-term borrowing costs went the other way, because governments still need to borrow the same amount, and that gap is the clearest signal in markets today. Gold sitting near a record high while real yields stay high says investors are worried about confidence in policy rather than about growth.',
    regime: 'confidence worries, not growth worries',
  },
  snapshot,
  stories,
  diagnostics: {
    articlesIngested: 287,
    clustersConsidered: 25,
    feeds: Array.from({ length: 22 }, (_, i) => ({ id: `feed-${i}`, name: `Source ${i}`, ok: i < 19, parsed: 20, fresh: 13, ms: 300, error: i < 19 ? null : 'HTTP 403' })),
    marketProviders: snapshot.report,
    usage: { calls: 4, inputTokens: 28400, outputTokens: 16200, estimatedCostUsd: 0.2188 },
    runtimeMs: 43100,
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
