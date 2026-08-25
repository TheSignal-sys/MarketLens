/**
 * market.mjs — market data with provider fallback.
 *
 * Three independent providers, tried in order, none of them required:
 *   1. Stooq        — CSV quotes, no API key
 *   2. Yahoo Finance — chart endpoint, no API key
 *   3. FRED         — official St. Louis Fed data, free key (FRED_API_KEY)
 *
 * FRED is the only source for credit spreads, so set a key if you want the
 * credit panel populated. Everything degrades gracefully: a missing instrument
 * is simply omitted from the site rather than breaking the run.
 */

const UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

/**
 * The instrument universe. `unit` drives formatting; `invert` is for quotes
 * that a provider returns the wrong way round.
 */
export const INSTRUMENTS = [
  // --- Equities ---
  { key: 'spx',    label: 'S&P 500',       group: 'equities', unit: 'index', stooq: '^spx',    yahoo: '^GSPC',    fred: 'SP500' },
  { key: 'ndx',    label: 'Nasdaq 100',    group: 'equities', unit: 'index', stooq: '^ndx',    yahoo: '^NDX',     fred: 'NASDAQ100' },
  { key: 'ukx',    label: 'FTSE 100',      group: 'equities', unit: 'index', stooq: '^ukx',    yahoo: '^FTSE' },
  { key: 'dax',    label: 'DAX',           group: 'equities', unit: 'index', stooq: '^dax',    yahoo: '^GDAXI' },
  { key: 'nkx',    label: 'Nikkei 225',    group: 'equities', unit: 'index', stooq: '^nkx',    yahoo: '^N225' },

  // --- Rates ---
  { key: 'us2y',   label: 'US 2Y',         group: 'rates', unit: 'pct', stooq: '2usy.b',  fred: 'DGS2' },
  { key: 'us10y',  label: 'US 10Y',        group: 'rates', unit: 'pct', stooq: '10usy.b', yahoo: '^TNX', fred: 'DGS10' },
  { key: 'us30y',  label: 'US 30Y',        group: 'rates', unit: 'pct', stooq: '30usy.b', fred: 'DGS30' },
  { key: 'uk10y',  label: 'UK 10Y gilt',   group: 'rates', unit: 'pct', stooq: '10uky.b' },
  { key: 'de10y',  label: 'German 10Y',    group: 'rates', unit: 'pct', stooq: '10dey.b' },
  { key: 'jp10y',  label: 'Japan 10Y',     group: 'rates', unit: 'pct', stooq: '10jpy.b' },

  // --- FX ---
  { key: 'eurusd', label: 'EUR/USD',       group: 'fx', unit: 'fx4', stooq: 'eurusd', yahoo: 'EURUSD=X' },
  { key: 'gbpusd', label: 'GBP/USD',       group: 'fx', unit: 'fx4', stooq: 'gbpusd', yahoo: 'GBPUSD=X' },
  { key: 'usdjpy', label: 'USD/JPY',       group: 'fx', unit: 'fx2', stooq: 'usdjpy', yahoo: 'JPY=X' },
  { key: 'usdcny', label: 'USD/CNH',       group: 'fx', unit: 'fx4', stooq: 'usdcnh', yahoo: 'CNH=X' },
  { key: 'dxy',    label: 'Dollar index',  group: 'fx', unit: 'index', yahoo: 'DX-Y.NYB', fred: 'DTWEXBGS' },

  // --- Commodities ---
  { key: 'brent',  label: 'Brent crude',   group: 'commodities', unit: 'usd', stooq: 'cb.f', yahoo: 'BZ=F', fred: 'DCOILBRENTEU' },
  { key: 'wti',    label: 'WTI crude',     group: 'commodities', unit: 'usd', stooq: 'cl.f', yahoo: 'CL=F', fred: 'DCOILWTICO' },
  { key: 'gas',    label: 'US nat gas',    group: 'commodities', unit: 'usd', stooq: 'ng.f', yahoo: 'NG=F', fred: 'DHHNGSP' },
  { key: 'gold',   label: 'Gold',          group: 'commodities', unit: 'usd', stooq: 'gc.f', yahoo: 'GC=F' },
  { key: 'copper', label: 'Copper',        group: 'commodities', unit: 'usd', stooq: 'hg.f', yahoo: 'HG=F' },

  // --- Volatility & credit ---
  { key: 'vix',    label: 'VIX',           group: 'vol',    unit: 'index', stooq: '^vix', yahoo: '^VIX', fred: 'VIXCLS' },
  { key: 'hy_oas', label: 'US HY OAS',     group: 'credit', unit: 'pct', fred: 'BAMLH0A0HYM2' },
  { key: 'ig_oas', label: 'US IG OAS',     group: 'credit', unit: 'pct', fred: 'BAMLC0A0CM' },
];

async function get(url, { timeout = 12000, json = false } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { 'user-agent': UA, accept: '*/*' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return json ? await res.json() : await res.text();
  } finally {
    clearTimeout(timer);
  }
}

/* ------------------------------------------------------------------ Stooq */

async function fetchStooq(instruments) {
  const withSym = instruments.filter((i) => i.stooq);
  if (!withSym.length) return {};
  const symbols = withSym.map((i) => i.stooq).join(',');
  const url = `https://stooq.com/q/l/?s=${encodeURIComponent(symbols)}&f=sd2t2ohlcv&h&e=csv`;
  const csv = await get(url);

  const lines = csv.trim().split(/\r?\n/);
  const header = lines.shift().toLowerCase().split(',');
  const idx = (n) => header.indexOf(n);

  const out = {};
  for (const line of lines) {
    const cells = line.split(',');
    const sym = (cells[idx('symbol')] || '').toLowerCase();
    const close = Number(cells[idx('close')]);
    const open = Number(cells[idx('open')]);
    if (!sym || !Number.isFinite(close) || close === 0) continue;
    const inst = withSym.find((i) => i.stooq.toLowerCase() === sym);
    if (!inst) continue;
    out[inst.key] = {
      value: close,
      prev: Number.isFinite(open) && open !== 0 ? open : null,
      asOf: cells[idx('date')] || null,
      provider: 'stooq',
    };
  }
  return out;
}

/* ------------------------------------------------------------------ Yahoo */

async function fetchYahoo(instruments) {
  const withSym = instruments.filter((i) => i.yahoo);
  const out = {};
  // Sequential-ish batching keeps us well inside anyone's rate limits.
  const batches = [];
  for (let i = 0; i < withSym.length; i += 6) batches.push(withSym.slice(i, i + 6));

  for (const batch of batches) {
    await Promise.all(batch.map(async (inst) => {
      try {
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(inst.yahoo)}?range=5d&interval=1d`;
        const data = await get(url, { json: true });
        const r = data?.chart?.result?.[0];
        const meta = r?.meta;
        if (!meta) return;
        const price = meta.regularMarketPrice;
        const prev = meta.chartPreviousClose ?? meta.previousClose ?? null;
        if (!Number.isFinite(price)) return;
        out[inst.key] = {
          value: price,
          prev: Number.isFinite(prev) ? prev : null,
          asOf: meta.regularMarketTime ? new Date(meta.regularMarketTime * 1000).toISOString().slice(0, 10) : null,
          provider: 'yahoo',
        };
      } catch { /* provider miss is not fatal */ }
    }));
  }
  return out;
}

/* ------------------------------------------------------------------- FRED */

async function fetchFred(instruments, apiKey) {
  if (!apiKey) return {};
  const withSym = instruments.filter((i) => i.fred);
  const out = {};
  for (const inst of withSym) {
    try {
      const url = `https://api.stlouisfed.org/fred/series/observations`
        + `?series_id=${inst.fred}&api_key=${apiKey}&file_type=json`
        + `&sort_order=desc&limit=8`;
      const data = await get(url, { json: true });
      const obs = (data.observations || []).filter((o) => o.value !== '.' && Number.isFinite(Number(o.value)));
      if (!obs.length) continue;
      out[inst.key] = {
        value: Number(obs[0].value),
        prev: obs[1] ? Number(obs[1].value) : null,
        asOf: obs[0].date,
        provider: 'fred',
      };
    } catch { /* provider miss is not fatal */ }
  }
  return out;
}

/* --------------------------------------------------------------- Assembly */

export function formatValue(value, unit) {
  if (!Number.isFinite(value)) return '—';
  switch (unit) {
    case 'pct': return `${value.toFixed(2)}%`;
    case 'fx4': return value.toFixed(4);
    case 'fx2': return value.toFixed(2);
    case 'usd': return value.toFixed(2);
    default:    return value.toLocaleString('en-GB', { maximumFractionDigits: value > 1000 ? 0 : 2 });
  }
}

/**
 * Fetch the full snapshot. Providers are merged in priority order, so a
 * higher-priority provider's value wins and lower ones fill the gaps.
 */
export async function fetchMarketSnapshot({ fredKey = process.env.FRED_API_KEY, log = () => {} } = {}) {
  const providers = [
    ['stooq', () => fetchStooq(INSTRUMENTS)],
    ['yahoo', () => fetchYahoo(INSTRUMENTS)],
    ['fred',  () => fetchFred(INSTRUMENTS, fredKey)],
  ];

  const merged = {};
  const report = [];
  for (const [name, fn] of providers) {
    const started = Date.now();
    try {
      const res = await fn();
      const n = Object.keys(res).length;
      report.push({ provider: name, ok: n > 0, count: n, ms: Date.now() - started, error: n ? null : 'no rows' });
      log(`${n > 0 ? 'ok  ' : 'FAIL'} ${name.padEnd(6)} ${String(n).padStart(3)} instruments  ${Date.now() - started}ms`);
      for (const [k, v] of Object.entries(res)) if (!merged[k]) merged[k] = v;
    } catch (err) {
      report.push({ provider: name, ok: false, count: 0, ms: Date.now() - started, error: `${err.name}: ${err.message}` });
      log(`FAIL ${name.padEnd(6)}   0 instruments  ${Date.now() - started}ms  ${err.message}`);
    }
  }

  const quotes = [];
  for (const inst of INSTRUMENTS) {
    const q = merged[inst.key];
    if (!q) continue;
    const chg = Number.isFinite(q.prev) && q.prev !== 0 ? q.value - q.prev : null;
    const pct = chg !== null ? (chg / q.prev) * 100 : null;
    quotes.push({
      key: inst.key,
      label: inst.label,
      group: inst.group,
      unit: inst.unit,
      value: q.value,
      display: formatValue(q.value, inst.unit),
      change: chg,
      changePct: pct,
      // Yields and spreads move in basis points; everything else in percent.
      changeDisplay: chg === null ? null
        : inst.unit === 'pct'
          ? `${chg >= 0 ? '+' : ''}${Math.round(chg * 100)}bp`
          : `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`,
      asOf: q.asOf,
      provider: q.provider,
    });
  }

  log(`\n${quotes.length}/${INSTRUMENTS.length} instruments resolved`);
  return { quotes, report, fetchedAt: new Date().toISOString() };
}

/** Compact one-line-per-instrument text block for the LLM prompt. */
export function snapshotToPromptText(snapshot) {
  if (!snapshot?.quotes?.length) return 'Market data unavailable for this run.';
  const byGroup = {};
  for (const q of snapshot.quotes) (byGroup[q.group] ||= []).push(q);
  return Object.entries(byGroup)
    .map(([g, qs]) => `${g.toUpperCase()}: ` + qs.map((q) => `${q.label} ${q.display}${q.changeDisplay ? ` (${q.changeDisplay})` : ''}`).join('; '))
    .join('\n');
}
