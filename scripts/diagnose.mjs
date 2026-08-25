#!/usr/bin/env node
/**
 * diagnose.mjs — health check. Run this first when something looks wrong.
 *
 *   node scripts/diagnose.mjs
 *
 * Checks every news feed, every market-data provider, and the model API key,
 * and tells you plainly what is broken and what to do about it. Costs a few
 * tokens (one tiny model call) and nothing else.
 */

import { loadEnv } from './lib/env.mjs';
import { fetchAllFeeds, FEEDS } from './lib/feeds.mjs';
import { fetchMarketSnapshot } from './lib/market.mjs';
import { complete, provider, modelName, usage } from './lib/llm.mjs';

loadEnv();

const bold = (s) => `\x1b[1m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;

console.log(bold('\nMarketLens diagnostics\n'));
console.log(`node ${process.version}`);
console.log(`ANTHROPIC_API_KEY  ${process.env.ANTHROPIC_API_KEY ? green('set') : dim('not set')}`);
console.log(`OPENAI_API_KEY     ${process.env.OPENAI_API_KEY ? green('set') : dim('not set')}`);
console.log(`FRED_API_KEY       ${process.env.FRED_API_KEY ? green('set') : dim('not set (credit spreads will be missing)')}`);

console.log(bold(`\n── News feeds (${FEEDS.length}) ${'─'.repeat(38)}`));
const { articles, report } = await fetchAllFeeds({ log: (l) => console.log('  ' + l) });

const dead = report.filter((r) => !r.ok);
if (dead.length) {
  console.log(red(`\n  ${dead.length} feed(s) not responding:`));
  dead.forEach((d) => console.log(`    · ${d.name} — ${d.error}`));
  console.log(dim('    A few dead feeds is normal — publishers change URLs. Remove or replace'));
  console.log(dim('    them in scripts/lib/feeds.mjs. The run only fails if ALL feeds die.'));
}

console.log(bold(`\n── Market data ${'─'.repeat(46)}`));
const snapshot = await fetchMarketSnapshot({ log: (l) => console.log('  ' + l) });
const missing = ['spx', 'us10y', 'eurusd', 'brent', 'vix'].filter(
  (k) => !snapshot.quotes.some((q) => q.key === k),
);
if (missing.length) {
  console.log(red(`\n  Missing key instruments: ${missing.join(', ')}`));
  console.log(dim('    The site still builds; the ticker tape and scorecard will be thinner.'));
}

console.log(bold(`\n── Model API ${'─'.repeat(48)}`));
if (!process.env.ANTHROPIC_API_KEY && !process.env.OPENAI_API_KEY) {
  console.log(red('  No model API key set — the pipeline cannot run.'));
  console.log(dim('    Set ANTHROPIC_API_KEY (or OPENAI_API_KEY) and try again.'));
} else {
  try {
    const reply = await complete('Reply with exactly the word: ready', { maxTokens: 16, temperature: 0 });
    console.log(`  ${green('ok')}  ${provider()}/${modelName()} → "${reply.trim().slice(0, 40)}"`);
    console.log(dim(`      test cost ~$${usage.estimatedCostUsd.toFixed(6)}`));
  } catch (err) {
    console.log(red(`  FAIL  ${err.message.slice(0, 200)}`));
  }
}

const healthy = report.filter((r) => r.ok).length;
console.log(bold(`\n── Summary ${'─'.repeat(50)}`));
console.log(`  feeds healthy      ${healthy}/${report.length}`);
console.log(`  articles in window ${articles.length}`);
console.log(`  instruments        ${snapshot.quotes.length}`);
console.log(healthy >= 5 && articles.length > 40
  ? green('\n  Looks good — you can run: npm run daily\n')
  : red('\n  Not enough live sources. Fix the feeds above before running the pipeline.\n'));
