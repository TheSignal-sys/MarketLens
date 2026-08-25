# MarketLens

Identifies the financial news that matters, then traces the **knock-on effects** across bonds, currencies, shares, corporate debt, commodities and volatility.

A story tells you an event happened. The obvious effect is priced within minutes. MarketLens exists to answer the question that actually pays: *who else is affected, and how?*

Every analysis follows one spine, and every page renders it in that order:

| Stage | Question |
|---|---|
| **1. What happened** | The event in plain English, and whether the market had already expected it |
| **2. How it spreads** | Each consequence, link by link, each caused by the one before it |
| **3. What it means** | The effect on each market: direction, size, timeframe, confidence |

Every claim is written twice. A plain-English version leads; the language a trading desk would use sits underneath it. Neither reader has to put up with the other's version.

**Live:** https://marketlens.app · **Method:** https://marketlens.app/method/

---

## How it works

```
RSS feeds  →  cluster & score  →  market snapshot  →  LLM triage
    ↓              ↓                     ↓                ↓
 ~300 heads    25 candidates       22 instruments    5 stories
                                                          ↓
                              transmission analysis  →  extract calls
                                                          ↓
                                 data/*.json  →  static site  →  Vercel
```

| Stage | What happens | Where |
|---|---|---|
| **Ingest** | 22 RSS feeds — central banks, wires, asset-class specialists. A dead feed degrades the run, never fails it. | `scripts/lib/feeds.mjs` |
| **Cluster & score** | Near-duplicate headlines merged; each cluster scored 0–100 on corroboration, authority, breadth, salience, recency. Deterministic and cheap — cuts 300 headlines to 25 before spending a token. | `scripts/lib/rank.mjs` |
| **Market data** | Three providers tried in order (Stooq → Yahoo → FRED). Graceful degradation throughout. | `scripts/lib/market.mjs` |
| **Triage** | Model acts as editor, told the score is a starting point it should override. | `scripts/lib/prompt.mjs` |
| **Analyse** | Each story traced through eight named routes. At least three knock-on effects required, each written plain and technical. | `scripts/lib/prompt.mjs` |
| **Settle** | Every call with confidence ≥3 logged at market and settled against the realised move. | `scripts/lib/scorecard.mjs` |
| **Build** | Static HTML. No framework, no client-side fetching, installable as a PWA. | `scripts/build.mjs` |
| **Ask** | One serverless function answers reader questions, grounded strictly in the published story. | `api/ask.js` |

**Zero runtime dependencies.** `package.json` has an empty `dependencies` block and that is deliberate: nothing to install, nothing to update, nothing that can rot while the site sits unattended.

**One piece of server-side code.** `api/ask.js` powers the question box on each story page. Everything else is static HTML. The endpoint is rate limited per visitor, capped site-wide by `ASK_DAILY_LIMIT`, and answers only from the story it was asked about.

---

## Quick start

```bash
git clone https://github.com/YOUR-USERNAME/marketlens.git
cd marketlens

cp .env.example .env          # then paste your API key into .env

npm run diagnose              # checks every feed, provider and your key
npm run daily                 # ingest → analyse → build
npm run serve                 # preview at http://localhost:4321
```

No `npm install` step. That is not an omission.

### Just want to see the design?

```bash
npm run seed                  # writes illustrative data, no API calls
npm run serve
```

---

## Commands

| Command | Does |
|---|---|
| `npm run diagnose` | Health check: every feed, every market provider, your API key. Run this first when something looks wrong. |
| `npm run daily` | The full run — pipeline then build. This is what the scheduled job executes. |
| `npm run pipeline` | Ingest and analyse only; writes `data/`. |
| `npm run build` | Rebuild `dist/` from existing `data/`. Fast, free, no API calls. |
| `npm run serve` | Local preview server on port 4321. |
| `npm run seed` | Illustrative demo data so you can preview the design without keys. |
| `npm run icons` | Regenerate PWA icons and the share card (needs Chrome; only after editing the mark). |

Useful flags:

```bash
node scripts/pipeline.mjs --stories 3    # cheaper run
node scripts/pipeline.mjs --dry-run      # no LLM calls at all
```

---

## Configuration

Everything is environment variables — see `.env.example`.

| Variable | Required | Notes |
|---|---|---|
| `ANTHROPIC_API_KEY` | yes* | From console.anthropic.com. Needed in **both** GitHub secrets (daily run) and Vercel env vars (question box). |
| `ANTHROPIC_MODEL` | no | Defaults to `claude-sonnet-5` |
| `OPENAI_API_KEY` | yes* | Alternative. Also set `LLM_PROVIDER=openai` |
| `FRED_API_KEY` | no | Free. Without it, credit spread instruments are omitted. |
| `SITE_URL` | no | Your live domain, for canonical URLs and the sitemap. |
| `ASK_DAILY_LIMIT` | no | Site-wide ceiling on reader questions per day. Defaults to 300. |

\* one model key, either provider.

**Cost:** a five-story run is roughly 30k input and 15k output tokens — about **$0.20/day**, or **£5/month** on weekdays only. `--stories 3` roughly halves it.

---

## Deployment

Two moving parts, both free:

- **GitHub Actions** runs the pipeline at 05:10 UTC on weekdays and commits the day's data back to the repo (`.github/workflows/daily.yml`).
- **Vercel** watches the repo, rebuilds on every push, serves the static site.

Repository secrets needed under *Settings → Secrets and variables → Actions*: `ANTHROPIC_API_KEY`, and optionally `FRED_API_KEY`.

Full walkthrough in [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

---

## Adding or fixing a feed

Publishers change RSS URLs without warning. `npm run diagnose` shows exactly which feeds are dead. To fix, edit the array in `scripts/lib/feeds.mjs`:

```js
{ id: 'boj', name: 'Bank of Japan', tier: 1, tags: ['rates', 'fx'],
  url: 'https://www.boj.or.jp/en/rss/whatsnew.xml' },
```

`tier` drives the source-authority score: 1 = primary source, 2 = wire or major newsroom, 3 = secondary commentary.

---

## Extending the analysis

The analytical framework lives in one file, `scripts/lib/prompt.mjs`. To change what the tool reasons about:

- **`TRANSMISSION_CHANNELS`** — add or reword a route and every future analysis must send its claims through it. Each has a plain name shown on the site and a key used in the data.
- **`VOICE`** — the prose rules. This is what stops the output reading like a language model. The banned-phrase list is enforced by `npm test` against whatever is in `data/latest.json`.
- **`buildAnalysisPrompt`** — the output schema and the analytical rules.
- **`buildAskPrompt`** — how reader questions are answered.
- **`SALIENCE` / `ASSET_LEXICON`** in `rank.mjs` — what the prefilter treats as market-relevant.
- **`TRACKABLE`** in `prompt.mjs` — which instruments can be settled on the scorecard.

---

## Project layout

```
api/
  ask.js              serverless endpoint for reader questions
scripts/
  pipeline.mjs        daily run: ingest → analyse → write data
  build.mjs           data → static site
  test.mjs            offline test suite, no network or keys needed
  diagnose.mjs        health check
  seed-demo.mjs       illustrative data, no API calls
  serve.mjs           local preview server (runs the ask endpoint too)
  make-icons.mjs      one-off icon generation
  lib/
    feeds.mjs         sources + RSS parser
    rank.mjs          clustering + materiality scoring
    market.mjs        market data, three providers
    prompt.mjs        the analytical framework
    llm.mjs           model client, retries, cost accounting
    scorecard.mjs     call tracking and settlement
    render.mjs        HTML components
    env.mjs           .env loader
data/
  latest.json         today's edition
  archive/            every previous edition + index
  scorecard.json      all calls, open and settled
site/                 static assets copied verbatim into dist/
dist/                 build output (gitignored)
```

---

## Limitations

Stated plainly, and also on the site's method page:

- Analysis is model-generated. It reasons well about mechanisms and poorly about precise numbers, which is why magnitudes are ranges and no figure is presented as a data point.
- Source coverage is free feeds only. Paywalled primary reporting and real-time wires are absent.
- Market data is delayed and used for context and call settlement, not execution.
- Runs once daily. A framework for thinking about propagation, not a live signal.

Not investment advice.

---

Built by Jonathan Savill.
