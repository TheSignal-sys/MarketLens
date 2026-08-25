/**
 * /api/ask — answers reader questions about a published story.
 *
 * This is the only server-side code in the project. Everything else is static.
 * It runs as a Vercel Serverless Function; the rest of the site never calls
 * out to anything at runtime.
 *
 * Guardrails, because this endpoint spends money and faces the open internet:
 *   - question capped at 500 characters
 *   - answer capped at 500 tokens
 *   - per-IP rate limit, and a global daily ceiling
 *   - answers are grounded in one published story, not open-ended chat
 *
 * The rate limiter lives in module scope, so it resets when the function goes
 * cold and is not shared between concurrent instances. It stops casual abuse,
 * not a determined attacker. The real backstop is the monthly spend limit you
 * set in the Anthropic console. Set one.
 */

const MAX_QUESTION = 500;
const MAX_ANSWER_TOKENS = 500;
const PER_IP_PER_HOUR = 12;
const GLOBAL_PER_DAY = Number(process.env.ASK_DAILY_LIMIT || 300);

const ipHits = new Map();
let dayStamp = '';
let dayCount = 0;

function rateLimit(ip) {
  const now = Date.now();
  const today = new Date(now).toISOString().slice(0, 10);

  if (today !== dayStamp) { dayStamp = today; dayCount = 0; }
  if (dayCount >= GLOBAL_PER_DAY) {
    return { ok: false, message: 'MarketLens has answered its limit of questions for today. Try again tomorrow.' };
  }

  const cutoff = now - 3600_000;
  const hits = (ipHits.get(ip) || []).filter((t) => t > cutoff);
  if (hits.length >= PER_IP_PER_HOUR) {
    return { ok: false, message: 'That is a lot of questions in one hour. Give it a few minutes and try again.' };
  }

  hits.push(now);
  ipHits.set(ip, hits);
  dayCount += 1;

  // Stop the map growing without bound on a long-lived instance.
  if (ipHits.size > 5000) {
    for (const [k, v] of ipHits) if (!v.some((t) => t > cutoff)) ipHits.delete(k);
  }
  return { ok: true };
}

function originBase(req) {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/$/, '');
  const host = req.headers['x-forwarded-host'] || req.headers.host || process.env.VERCEL_URL;
  const proto = req.headers['x-forwarded-proto'] || 'https';
  return `${proto}://${host}`;
}

/** Stories live in today's edition or, for older ones, a dated archive file. */
async function loadStory(base, storyId) {
  const day = /^(\d{4}-\d{2}-\d{2})/.exec(storyId)?.[1];
  const candidates = [`${base}/data/latest.json`];
  if (day) candidates.push(`${base}/data/archive/${day}.json`);

  for (const url of candidates) {
    try {
      const res = await fetch(url, { headers: { accept: 'application/json' } });
      if (!res.ok) continue;
      const data = await res.json();
      const story = (data.stories || []).find((s) => s.id === storyId);
      if (story) return { story, data };
    } catch { /* try the next candidate */ }
  }
  return null;
}

function snapshotText(snapshot) {
  if (!snapshot?.quotes?.length) return 'Market data unavailable.';
  const byGroup = {};
  for (const q of snapshot.quotes) (byGroup[q.group] ||= []).push(q);
  return Object.entries(byGroup)
    .map(([g, qs]) => `${g.toUpperCase()}: ${qs.map((q) => `${q.label} ${q.display}${q.changeDisplay ? ` (${q.changeDisplay})` : ''}`).join('; ')}`)
    .join('\n');
}

function buildPrompt({ story, marketText, question, dateLabel }) {
  const impacts = (story.assetImpacts || [])
    .map((i) => `- ${i.instrument} (${i.assetClass}): ${i.direction} ${i.magnitude} over ${i.horizon}, confidence ${i.conviction}/5. ${i.plain || ''} ${i.detail || ''}`)
    .join('\n');
  const chains = (story.chains || [])
    .map((c) => `- ${(c.links || []).map((l) => l.plain).join(' → ')} → lands on ${c.endpoint}`)
    .join('\n');

  return `You are MarketLens, answering a reader's question about one story you published on ${dateLabel}.

THE STORY
Headline: ${story.headline}
Summary: ${story.standfirst}
What happened: ${story.whatHappened?.plain || ''}
Why it matters: ${story.whatHappened?.whyItMatters || ''}

HOW IT SPREADS
${chains || 'none recorded'}

WHAT IT MEANS FOR EACH MARKET
${impacts || 'none recorded'}

WHAT THE MARKET MAY BE MISSING
${story.whatMarketMisses?.plain || ''}

WHAT WOULD PROVE IT WRONG
${(story.falsifiers || []).map((f) => `- ${f}`).join('\n')}

MARKET LEVELS WHEN THIS WAS PUBLISHED
${marketText}

READER'S QUESTION
${String(question).slice(0, MAX_QUESTION)}

RULES
- Answer in plain English. Assume the reader is intelligent but does not work in finance.
- Ground your answer in the analysis above. You may explain it further and you may explain general financial concepts.
- If the question cannot be answered from this story, say so plainly and say what the story does cover. Never invent facts, prices or events.
- Never give investment advice or tell anyone what to buy or sell. Explain how things work instead.
- Three short paragraphs at most. Often one is enough.
- No em dashes. No bullet points unless the question genuinely asks for a list.
- Do not restate the question before answering.
- British English.`;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Send a POST request.' });
    return;
  }

  const key = process.env.ANTHROPIC_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!key && !openaiKey) {
    res.status(503).json({ error: 'Questions are not switched on for this site yet.' });
    return;
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = null; }
  }
  const storyId = body?.storyId;
  const question = (body?.question || '').trim();

  if (!storyId || !question) {
    res.status(400).json({ error: 'Ask a question about a story.' });
    return;
  }
  if (question.length > MAX_QUESTION) {
    res.status(400).json({ error: `Keep it under ${MAX_QUESTION} characters.` });
    return;
  }

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  const limit = rateLimit(ip);
  if (!limit.ok) {
    res.status(429).json({ error: limit.message });
    return;
  }

  const base = originBase(req);
  const found = await loadStory(base, storyId);
  if (!found) {
    res.status(404).json({ error: 'That story could not be found.' });
    return;
  }

  const prompt = buildPrompt({
    story: found.story,
    marketText: snapshotText(found.data.snapshot),
    question,
    dateLabel: found.data.dateLabel,
  });

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25_000);
    let answer;

    if (key) {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'content-type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5',
          max_tokens: MAX_ANSWER_TOKENS,
          temperature: 0.3,
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      clearTimeout(timer);
      if (!r.ok) throw new Error(`upstream ${r.status}`);
      const data = await r.json();
      answer = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
    } else {
      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        signal: controller.signal,
        headers: { 'content-type': 'application/json', authorization: `Bearer ${openaiKey}` },
        body: JSON.stringify({
          model: process.env.OPENAI_MODEL || 'gpt-4o',
          max_tokens: MAX_ANSWER_TOKENS,
          temperature: 0.3,
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      clearTimeout(timer);
      if (!r.ok) throw new Error(`upstream ${r.status}`);
      const data = await r.json();
      answer = (data.choices?.[0]?.message?.content || '').trim();
    }

    if (!answer) throw new Error('empty answer');
    res.status(200).json({ answer });
  } catch (err) {
    const aborted = err.name === 'AbortError';
    res.status(aborted ? 504 : 502).json({
      error: aborted
        ? 'That took too long. Try a shorter question.'
        : 'Could not get an answer just now. Try again in a moment.',
    });
  }
}
