#!/usr/bin/env node
/**
 * pipeline.mjs — the daily run.
 *
 *   ingest feeds → cluster & score → market snapshot → LLM triage
 *   → deep analysis per story → extract calls → settle scorecard → write JSON
 *
 * Usage:
 *   node scripts/pipeline.mjs                  full run
 *   node scripts/pipeline.mjs --stories 4      analyse fewer stories (cheaper)
 *   node scripts/pipeline.mjs --dry-run        no LLM calls, uses a fixture
 *
 * Writes:
 *   data/latest.json
 *   data/archive/YYYY-MM-DD.json
 *   data/scorecard.json
 */

import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { loadEnv } from './lib/env.mjs';
import { fetchAllFeeds } from './lib/feeds.mjs';
import { shortlist } from './lib/rank.mjs';
import { fetchMarketSnapshot, snapshotToPromptText } from './lib/market.mjs';
import { buildTriagePrompt, buildAnalysisPrompt, extractCalls } from './lib/prompt.mjs';
import { completeJson, usage, modelName, provider } from './lib/llm.mjs';
import { loadScorecard, saveScorecard, settleCalls, addCalls, summarise } from './lib/scorecard.mjs';

loadEnv();

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = join(ROOT, 'data');

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const next = args[i + 1];
  return next && !next.startsWith('--') ? next : true;
};
const DRY_RUN = args.includes('--dry-run');
const STORY_COUNT = Number(flag('stories', 5));

const log = (...a) => console.log(...a);
const section = (t) => log(`\n\x1b[1m── ${t} ${'─'.repeat(Math.max(0, 58 - t.length))}\x1b[0m`);

function londonDate(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', dateStyle: 'short' }).format(d);
}
function londonLabel(d = new Date()) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  }).format(d);
}

function slugify(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
}

/** Run async tasks with bounded concurrency so we never hammer the API. */
async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (cursor < items.length) {
        const i = cursor++;
        out[i] = await fn(items[i], i);
      }
    }),
  );
  return out;
}

async function main() {
  const started = Date.now();
  const runDate = londonDate();
  const dateLabel = londonLabel();

  log(`\x1b[1mMarketLens pipeline\x1b[0m — ${dateLabel}`);
  log(`model: ${DRY_RUN ? 'none (dry run)' : `${provider()}/${modelName()}`}   target stories: ${STORY_COUNT}`);

  /* 1 ── ingest ------------------------------------------------------- */
  section('Ingesting feeds');
  const { articles, report: feedReport } = await fetchAllFeeds({ log });
  if (!articles.length) throw new Error('no articles retrieved from any feed — aborting');

  /* 2 ── cluster and score -------------------------------------------- */
  section('Clustering and scoring');
  const candidates = shortlist(articles, { limit: 25 });
  log(`${candidates.length} candidate clusters after prefilter\n`);
  candidates.slice(0, 10).forEach((c, i) =>
    log(`  ${String(i).padStart(2)}. ${String(c.score).padStart(5)}  [${c.assetClasses.join('/') || '-'}]  ${c.lead.title.slice(0, 82)}`));

  /* 3 ── market snapshot ---------------------------------------------- */
  section('Market snapshot');
  const snapshot = await fetchMarketSnapshot({ log });
  const marketText = snapshotToPromptText(snapshot);

  /* 4 ── triage -------------------------------------------------------- */
  section('Editorial triage');
  let triage;
  if (DRY_RUN) {
    triage = {
      marketRead: {
        headline: 'Dry run — no model output',
        body: 'This build used --dry-run, so no analysis was generated. Story selection below reflects the deterministic materiality score only.',
        regime: 'dry run',
      },
      selected: candidates.slice(0, STORY_COUNT).map((c, i) => ({
        index: i, rank: i + 1, why: 'Selected by materiality score (dry run).',
      })),
    };
    log('skipped (dry run)');
  } else {
    triage = await completeJson(
      buildTriagePrompt({ candidates, marketText, count: STORY_COUNT, dateLabel }),
      { maxTokens: 3000, temperature: 0.3 },
    );
    log(`market read: "${triage.marketRead?.headline}"`);
    log(`selected ${triage.selected?.length ?? 0} stories`);
  }

  const selected = (triage.selected || [])
    .filter((s) => candidates[s.index])
    .sort((a, b) => (a.rank || 99) - (b.rank || 99))
    .slice(0, STORY_COUNT);
  if (!selected.length) throw new Error('triage returned no usable selections');

  /* 5 ── deep analysis -------------------------------------------------- */
  section('Second-order analysis');
  const stories = await mapLimit(selected, 3, async (sel, i) => {
    const cluster = candidates[sel.index];
    const id = `${runDate}-${slugify(cluster.lead.title)}`;
    if (DRY_RUN) {
      return {
        id, rank: sel.rank || i + 1, cluster,
        analysis: {
          headline: cluster.lead.title.slice(0, 90),
          standfirst: 'Dry run: no model analysis generated.',
          classification: { eventType: 'macro-data', pricedIn: 'partly-priced', pricedInRationale: 'n/a', persistence: 'weeks', regionFocus: ['Global'] },
          whatHappened: { plain: 'n/a', whyItMatters: 'n/a', detail: '' },
          chains: [], assetImpacts: [],
          whatMarketMisses: { plain: 'n/a', detail: '' },
          falsifiers: [], tradeExpression: [], watchNext: [], glossary: [], confidence: 1,
        },
        editorNote: sel.why,
      };
    }
    log(`  analysing #${sel.rank}: ${cluster.lead.title.slice(0, 70)}…`);
    try {
      const analysis = await completeJson(
        buildAnalysisPrompt({ cluster, marketText, dateLabel, editorNote: sel.why || 'High materiality score.' }),
        { maxTokens: 5000, temperature: 0.45 },
      );
      return { id, rank: sel.rank || i + 1, cluster, analysis, editorNote: sel.why };
    } catch (err) {
      log(`  \x1b[31m✗ failed:\x1b[0m ${err.message.slice(0, 160)}`);
      return null;
    }
  });

  const good = stories.filter(Boolean).sort((a, b) => a.rank - b.rank);
  if (!good.length) throw new Error('every story analysis failed — aborting rather than publishing an empty day');
  log(`\n${good.length}/${selected.length} analyses succeeded`);

  /* 6 ── scorecard ------------------------------------------------------ */
  section('Scorecard');
  const scorecardPath = join(DATA, 'scorecard.json');
  const scorecard = await loadScorecard(scorecardPath);
  const settledCount = settleCalls(scorecard, snapshot);
  const newCalls = good.flatMap((s) => extractCalls(s.analysis, s.id, snapshot));
  const addedCount = addCalls(scorecard, newCalls);
  await saveScorecard(scorecardPath, scorecard);
  const stats = summarise(scorecard);
  log(`settled ${settledCount}, added ${addedCount}, open ${stats.open}, hit rate ${stats.hitRate ?? '—'}%`);

  /* 7 ── write ---------------------------------------------------------- */
  section('Writing data');
  const payload = {
    version: 1,
    date: runDate,
    dateLabel,
    generatedAt: new Date().toISOString(),
    model: DRY_RUN ? null : `${provider()}/${modelName()}`,
    marketRead: triage.marketRead,
    snapshot,
    stories: good.map((s) => ({
      id: s.id,
      rank: s.rank,
      editorNote: s.editorNote,
      materiality: { score: s.cluster.score, components: s.cluster.components, distinctSources: s.cluster.distinctSources, salienceTerms: s.cluster.salienceTerms },
      sources: s.cluster.sources,
      links: s.cluster.links,
      headlines: s.cluster.headlines,
      newestAt: s.cluster.newestAt,
      ...s.analysis,
    })),
    diagnostics: {
      articlesIngested: articles.length,
      clustersConsidered: candidates.length,
      feeds: feedReport,
      marketProviders: snapshot.report,
      usage: { ...usage, estimatedCostUsd: Math.round(usage.estimatedCostUsd * 10000) / 10000 },
      runtimeMs: Date.now() - started,
    },
    scorecardSummary: stats,
  };

  await mkdir(join(DATA, 'archive'), { recursive: true });
  await writeFile(join(DATA, 'latest.json'), JSON.stringify(payload, null, 2) + '\n');
  await writeFile(join(DATA, 'archive', `${runDate}.json`), JSON.stringify(payload, null, 2) + '\n');

  // Maintain a lightweight index so the archive page does not read every file.
  const indexPath = join(DATA, 'archive', 'index.json');
  let index = [];
  try { index = JSON.parse(await readFile(indexPath, 'utf8')); } catch { /* first run */ }
  index = index.filter((e) => e.date !== runDate);
  index.push({
    date: runDate,
    dateLabel,
    headline: triage.marketRead?.headline || '',
    regime: triage.marketRead?.regime || '',
    storyCount: good.length,
  });
  index.sort((a, b) => b.date.localeCompare(a.date));
  await writeFile(indexPath, JSON.stringify(index.slice(0, 400), null, 2) + '\n');

  section('Done');
  log(`stories: ${good.length}   runtime: ${((Date.now() - started) / 1000).toFixed(1)}s`);
  if (!DRY_RUN) {
    log(`tokens: ${usage.inputTokens} in / ${usage.outputTokens} out across ${usage.calls} calls`);
    log(`estimated cost: $${usage.estimatedCostUsd.toFixed(4)}`);
  }
}

main().catch((err) => {
  console.error(`\n\x1b[31mPipeline failed:\x1b[0m ${err.stack || err.message}`);
  process.exit(1);
});
