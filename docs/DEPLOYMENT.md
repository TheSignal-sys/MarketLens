# Deploying MarketLens

Written assuming you have never deployed a website before. Follow it in order. Total time: about 45 minutes, most of which is waiting for DNS.

**What you end up with:** `https://yourdomain.com` serving a fresh edition every weekday morning, running itself, costing about £5/month.

---

## Before you start

Three accounts, all free to create:

| | Where | Why |
|---|---|---|
| GitHub | github.com | Stores the code, runs the daily job |
| Vercel | vercel.com | Serves the website |
| Anthropic | console.anthropic.com | The analysis engine (this one costs money to use) |

You already have a GitHub account and an API key, so you mainly need Vercel.

---

## Step 1 — Get the code onto GitHub

1. Go to **github.com/new**.
2. Repository name: `marketlens`.
3. Set it to **Public**. Two reasons: GitHub Actions minutes are unlimited on public repos, and an interviewer being able to read your code is the point of the exercise. Your API key never goes in the repo — it goes in GitHub's encrypted secrets store.
4. Do **not** tick "Add a README file". The project already has one.
5. Click **Create repository**.

GitHub now shows you a page of commands. Ignore them and use these instead, run from inside the `marketlens` folder on your machine:

```bash
git init
git add .
git commit -m "MarketLens: initial commit"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/marketlens.git
git push -u origin main
```

Replace `YOUR-USERNAME`. If git asks for a password, it wants a personal access token, not your account password — GitHub's prompt links to where you generate one.

Refresh the repository page. You should see all the files.

---

## Step 2 — Add your API key as a secret

The daily job needs your key, but the key must never be in the code.

1. In your repository, go to **Settings** (top bar, far right) → **Secrets and variables** → **Actions**.
2. Click **New repository secret**.
3. Name: `ANTHROPIC_API_KEY`. Secret: paste your key. Click **Add secret**.

Optional but worth doing — a free FRED key populates the credit spread panel:

4. Get one at **fredaccount.stlouisfed.org/apikeys** (free, instant).
5. Add a second secret named `FRED_API_KEY`.

If you are using OpenAI rather than Anthropic, add `OPENAI_API_KEY` instead, then go to the **Variables** tab on the same page and add a variable `LLM_PROVIDER` with value `openai`.

---

## Step 3 — Deploy to Vercel

1. Go to **vercel.com** and sign up **with GitHub**. This matters — it links the accounts automatically.
2. On the dashboard, click **Add New… → Project**.
3. Find `marketlens` in the list and click **Import**.
4. Vercel reads `vercel.json` and fills everything in. Do not change the build settings.
5. Before clicking Deploy, expand **Environment Variables** and add `ANTHROPIC_API_KEY` with your key. This is separate from the GitHub secret you added in Step 2, and it is what powers the "Ask about this story" box on each story page. Without it the box politely says questions are switched off; everything else still works.
6. Click **Deploy**.

About a minute later you have a live site at something like `marketlens-abc123.vercel.app`. Open it. It will show whatever data is currently in the repo.

**If the build fails:** the log will say `No data/latest.json found`. That means you pushed without any data. Run `npm run seed` locally, commit, and push — or just do Step 4 first and let the pipeline produce the real thing.

---

## Step 4 — Run the pipeline for real

Test it manually before trusting the schedule.

1. In your GitHub repository, click the **Actions** tab.
2. If prompted with "Workflows aren't being run on this forked repository", click the green button to enable them.
3. In the left sidebar, click **Daily edition**.
4. Click **Run workflow** → **Run workflow**.

It takes two to four minutes. Click into the run to watch the logs. When it finishes:

- The run summary shows the day's headline and the stories it selected.
- A new commit appears in your repository.
- Vercel picks that commit up and redeploys within a minute or so.

Refresh your `.vercel.app` URL. That is your first real edition.

**If it fails**, the log tells you where. The two common causes are a mistyped secret name (it must be exactly `ANTHROPIC_API_KEY`) and an account with no credit on it. To debug locally instead:

```bash
cp .env.example .env      # paste your key into .env
npm run diagnose
```

---

## Step 5 — Buy a domain

`marketlens.vercel.app` looks like a student project. `marketlens.co.uk` does not, and the difference matters more than anything else on this page.

**Where to buy.** Cloudflare Registrar sells at cost with no markup and no first-year bait pricing, but requires moving your nameservers to Cloudflare. Namecheap and Porkbun are both straightforward and cheap. Avoid GoDaddy — the renewal pricing is unpleasant.

**What to buy.** `marketlens.com` is very likely taken. Realistic alternatives, roughly in order of how they read on a CV:

- `marketlens.co.uk` — you are applying in London; a `.co.uk` reads as deliberate, not as a fallback
- `marketlens.io` — expensive but unambiguously a tool
- `marketlens.app` — signals "this is an app", which is exactly the pitch
- `getmarketlens.com`, `marketlens.co`, `marketlenshq.com` — fine, slightly less clean
- `savillmarketlens.com` — avoid; it reads as a personal blog rather than a product

Budget £8–£35/year depending on the extension.

---

## Step 6 — Point the domain at Vercel

1. In Vercel, open your project → **Settings** → **Domains**.
2. Type your domain (e.g. `marketlens.co.uk`) and click **Add**.
3. Vercel offers to also add `www.` — accept it.
4. Vercel now shows you the DNS records it needs.

Go to your registrar's DNS settings and add:

| Type | Name | Value |
|---|---|---|
| `A` | `@` | `76.76.21.21` |
| `CNAME` | `www` | the value Vercel shows on the domain card |

Two important notes:

- Use the exact values shown in **your** Vercel dashboard. The A record IP above is Vercel's standard one, but the CNAME target is unique to your project.
- Delete any existing "parking page" A record your registrar added automatically, or the two will fight.

DNS takes anywhere from two minutes to a couple of hours. Vercel's domain page shows a green tick when it resolves and issues an HTTPS certificate automatically. You do not need to do anything about SSL.

Finally, tell the site its own address so canonical URLs and the sitemap are right:

- Vercel → **Settings** → **Environment Variables** → add `SITE_URL` = `https://marketlens.co.uk` (no trailing slash).
- Then **Deployments** → the most recent one → the ⋯ menu → **Redeploy**.

---

## Step 7 — Confirm the schedule

The job is set to run at **05:10 UTC, Monday to Friday** — 06:10 London in summer, 05:10 in winter. That is deliberately before the London open.

GitHub's scheduler is best-effort and can run up to fifteen minutes late. It also pauses scheduled workflows on repositories with no activity for 60 days, and emails you when it does; any commit re-enables them.

To change the time, edit `.github/workflows/daily.yml`:

```yaml
    - cron: '10 5 * * 1-5'
#            │  │   │
#            │  │   └── days: 1-5 = Mon-Fri
#            │  └────── hour, UTC
#            └───────── minute
```

Remember it is **UTC**, so subtract an hour from London time between late March and late October.

---

## Step 8 — Install it on your phone

This is what makes it feel like an app rather than a website, and it is worth doing before an interview so you can hand someone your phone.

**iPhone:** open the site in Safari (it must be Safari) → Share button → **Add to Home Screen**.

**Android:** open in Chrome → menu → **Install app**.

You get an icon, no browser chrome, and the last edition stays readable offline.

---

## Running costs

| | |
|---|---|
| Domain | £8–35/year |
| GitHub Actions | Free (unlimited on public repos) |
| Vercel Hobby | Free |
| Anthropic API — daily analysis | ~£5/month at five stories a day, weekdays only |
| Anthropic API — reader questions | ~£0.007 per question asked |

To cut the analysis cost roughly in half, change `--stories 5` to `--stories 3` in the workflow file.

**The question box is the only part with open-ended cost**, because anyone who visits the site can use it. Three guardrails are built in: each visitor is limited to 12 questions an hour, answers are capped short, and there is a site-wide ceiling of 300 questions a day. You can lower that ceiling by adding a Vercel environment variable `ASK_DAILY_LIMIT` set to whatever you prefer. At the default ceiling the absolute worst case is around £1.70 a day, and realistically it will be pennies.

**Set a spend limit anyway.** In the Anthropic console under Billing, set a monthly cap of £15 or so. The rate limiter resets when the serverless function goes idle, so it stops casual abuse rather than a determined one. The billing cap is the real backstop, it costs nothing, and it removes the worry entirely.

---

## Ongoing maintenance

Realistically about ten minutes a month.

- **A feed dies.** Publishers change RSS URLs. Run `npm run diagnose` to see which, then edit or remove it in `scripts/lib/feeds.mjs`. The run only fails if every feed dies at once.
- **The run failed.** GitHub emails you. Open Actions → the failed run → read the red step.
- **You want to change the analysis.** Everything is in `scripts/lib/prompt.mjs`. Edit, commit, push — the next run uses it.

---

## Putting it on your CV

A few things that make this land properly in an interview:

- **Link it, don't describe it.** A URL in your CV header next to your email. "Built MarketLens (marketlens.co.uk), a daily cross-asset news analysis tool" is one line and does more work than a paragraph.
- **Know your own method page cold.** The likeliest question is "how does it decide what matters?" and the answer is a five-component score you can recite. That conversation is the whole reason the page exists.
- **Own the scorecard, especially the misses.** If someone asks whether it works, "the hit rate is published, here it is, and here is where it has been wrong" is a far stronger answer than a claim. It also shows you understand that a research product without accountability is marketing.
- **Have an opinion about its limits.** It is a language model reasoning about mechanisms; it is good at transmission chains and bad at precise numbers, which is why magnitudes are ranges. Saying that yourself, before they ask, is the difference between a candidate who built a demo and one who built a tool.
