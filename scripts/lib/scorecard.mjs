/**
 * scorecard.mjs — accountability layer.
 *
 * Every directional call with conviction >= 3 is logged with the market level
 * at the time it was made. Once its horizon has elapsed, the call is settled
 * against the realised move and published. A research tool that never marks
 * its own homework is marketing; this is the part that makes it research.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

const HORIZON_DAYS = { intraday: 1, days: 3, weeks: 14, quarters: 60 };

/** Minimum move to count as a resolved direction rather than noise. */
function threshold(unit) {
  return unit === 'pct' ? 0.03 : 0.3; // 3bp for yields/spreads, 0.3% for everything else
}

export async function loadScorecard(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return { calls: [], updatedAt: null };
  }
}

export async function saveScorecard(path, scorecard) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(scorecard, null, 2) + '\n');
}

/**
 * Settle any open call whose horizon has elapsed, using the latest snapshot.
 * Calls whose instrument is missing from the snapshot are left open.
 */
export function settleCalls(scorecard, snapshot, now = Date.now()) {
  const byKey = Object.fromEntries((snapshot?.quotes || []).map((q) => [q.key, q]));
  let settled = 0;

  for (const call of scorecard.calls) {
    if (call.status !== 'open') continue;
    const quote = byKey[call.instrumentKey];
    if (!quote) continue;

    const dueDays = HORIZON_DAYS[call.horizon] ?? 5;
    const ageDays = (now - new Date(call.openedAt).getTime()) / 86400000;

    // Always refresh the mark so open calls show live P&L on the site.
    call.markValue = quote.value;
    call.markDisplay = quote.display;
    call.moveAbs = quote.value - call.entryValue;
    call.movePct = call.entryValue ? ((quote.value - call.entryValue) / Math.abs(call.entryValue)) * 100 : 0;
    call.moveDisplay = quote.unit === 'pct'
      ? `${call.moveAbs >= 0 ? '+' : ''}${Math.round(call.moveAbs * 100)}bp`
      : `${call.movePct >= 0 ? '+' : ''}${call.movePct.toFixed(2)}%`;

    if (ageDays < dueDays) continue;

    const move = quote.unit === 'pct' ? call.moveAbs : call.movePct;
    const t = threshold(quote.unit);

    if (Math.abs(move) < t) {
      call.status = 'flat';
      call.outcome = 'No meaningful move within horizon';
    } else {
      const realised = move > 0 ? 'up' : 'down';
      call.status = realised === call.direction ? 'hit' : 'miss';
      call.outcome = `${call.instrumentLabel} ${realised} ${call.moveDisplay} vs called ${call.direction}`;
    }
    call.settledAt = new Date(now).toISOString();
    settled += 1;
  }

  return settled;
}

/** Aggregate statistics for the scorecard page. */
export function summarise(scorecard) {
  const calls = scorecard.calls || [];
  const settledCalls = calls.filter((c) => c.status === 'hit' || c.status === 'miss');
  const hits = settledCalls.filter((c) => c.status === 'hit').length;
  const misses = settledCalls.filter((c) => c.status === 'miss').length;
  const flat = calls.filter((c) => c.status === 'flat').length;
  const open = calls.filter((c) => c.status === 'open').length;

  const byClass = {};
  for (const c of settledCalls) {
    const b = (byClass[c.assetClass] ||= { hits: 0, total: 0 });
    b.total += 1;
    if (c.status === 'hit') b.hits += 1;
  }

  const byConviction = {};
  for (const c of settledCalls) {
    const b = (byConviction[c.conviction] ||= { hits: 0, total: 0 });
    b.total += 1;
    if (c.status === 'hit') b.hits += 1;
  }

  return {
    total: calls.length,
    open,
    flat,
    hits,
    misses,
    settled: settledCalls.length,
    hitRate: settledCalls.length ? Math.round((hits / settledCalls.length) * 1000) / 10 : null,
    byClass: Object.fromEntries(
      Object.entries(byClass).map(([k, v]) => [k, { ...v, rate: Math.round((v.hits / v.total) * 1000) / 10 }]),
    ),
    byConviction: Object.fromEntries(
      Object.entries(byConviction).map(([k, v]) => [k, { ...v, rate: Math.round((v.hits / v.total) * 1000) / 10 }]),
    ),
  };
}

/** Add new calls, skipping any duplicate that is still open. */
export function addCalls(scorecard, newCalls) {
  const openIds = new Set(scorecard.calls.filter((c) => c.status === 'open').map((c) => c.id));
  let added = 0;
  for (const call of newCalls) {
    if (openIds.has(call.id)) continue;
    scorecard.calls.push(call);
    added += 1;
  }
  // Keep the file bounded; a year of daily calls is plenty of history.
  if (scorecard.calls.length > 1200) {
    scorecard.calls = scorecard.calls.slice(-1200);
  }
  scorecard.updatedAt = new Date().toISOString();
  return added;
}
