/**
 * llm.mjs — model client with no SDK dependency.
 *
 * Supports Anthropic (default) and OpenAI so you can use whichever key you
 * already have. Set LLM_PROVIDER=openai to switch.
 *
 *   ANTHROPIC_API_KEY   + ANTHROPIC_MODEL  (default claude-sonnet-5)
 *   OPENAI_API_KEY      + OPENAI_MODEL     (default gpt-4o)
 *
 * Includes retry with exponential backoff, token accounting, and a tolerant
 * JSON extractor — models occasionally wrap JSON in prose or a code fence
 * despite instructions, and a daily unattended job must survive that.
 */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const usage = { calls: 0, inputTokens: 0, outputTokens: 0, estimatedCostUsd: 0 };

const PRICES = {
  // USD per million tokens: [input, output]
  'claude-opus-5':   [5, 25],
  'claude-sonnet-5': [2, 10],
  'claude-fable-5':  [10, 50],
  'claude-haiku-4-5-20251001': [1, 5],
  'gpt-4o':          [2.5, 10],
  'gpt-4o-mini':     [0.15, 0.6],
};

function accrue(model, inTok, outTok) {
  usage.calls += 1;
  usage.inputTokens += inTok || 0;
  usage.outputTokens += outTok || 0;
  const p = PRICES[model] || [3, 15];
  usage.estimatedCostUsd += ((inTok || 0) / 1e6) * p[0] + ((outTok || 0) / 1e6) * p[1];
}

export function provider() {
  if (process.env.LLM_PROVIDER) return process.env.LLM_PROVIDER.toLowerCase();
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  if (process.env.OPENAI_API_KEY) return 'openai';
  return 'anthropic';
}

export function modelName() {
  return provider() === 'openai'
    ? process.env.OPENAI_MODEL || 'gpt-4o'
    : process.env.ANTHROPIC_MODEL || 'claude-sonnet-5';
}

async function callAnthropic({ prompt, maxTokens, temperature, timeout }) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY is not set');
  const model = modelName();

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        temperature,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    const body = await res.text();
    if (!res.ok) throw new Error(`Anthropic HTTP ${res.status}: ${body.slice(0, 300)}`);
    const data = JSON.parse(body);
    accrue(model, data.usage?.input_tokens, data.usage?.output_tokens);
    return (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  } finally {
    clearTimeout(timer);
  }
}

async function callOpenAI({ prompt, maxTokens, temperature, timeout }) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY is not set');
  const model = modelName();

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        temperature,
        response_format: { type: 'json_object' },
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    const body = await res.text();
    if (!res.ok) throw new Error(`OpenAI HTTP ${res.status}: ${body.slice(0, 300)}`);
    const data = JSON.parse(body);
    accrue(model, data.usage?.prompt_tokens, data.usage?.completion_tokens);
    return data.choices?.[0]?.message?.content || '';
  } finally {
    clearTimeout(timer);
  }
}

export async function complete(prompt, { maxTokens = 4000, temperature = 0.4, timeout = 180000, retries = 3 } = {}) {
  const fn = provider() === 'openai' ? callOpenAI : callAnthropic;
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await fn({ prompt, maxTokens, temperature, timeout });
    } catch (err) {
      lastErr = err;
      const retriable = /429|500|502|503|529|abort|timeout|fetch failed|ECONNRESET/i.test(err.message + err.name);
      if (attempt === retries || !retriable) break;
      const wait = Math.min(30000, 1500 * 2 ** attempt) + Math.random() * 1000;
      console.warn(`  retry ${attempt + 1}/${retries} in ${Math.round(wait / 1000)}s — ${err.message.slice(0, 120)}`);
      await sleep(wait);
    }
  }
  throw lastErr;
}

/** Pull the first balanced JSON object out of a model response. */
export function extractJson(text) {
  if (!text) throw new Error('empty model response');
  const cleaned = text.replace(/```json\s*/gi, '').replace(/```/g, '').trim();

  try { return JSON.parse(cleaned); } catch { /* fall through to scanning */ }

  const start = cleaned.indexOf('{');
  if (start === -1) throw new Error(`no JSON object in response: ${cleaned.slice(0, 200)}`);

  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < cleaned.length; i += 1) {
    const ch = cleaned[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\') { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        const candidate = cleaned.slice(start, i + 1);
        try { return JSON.parse(candidate); } catch (e) {
          throw new Error(`malformed JSON: ${e.message} :: ${candidate.slice(0, 200)}`);
        }
      }
    }
  }
  throw new Error('unbalanced JSON in model response');
}

export async function completeJson(prompt, opts = {}) {
  const text = await complete(prompt, opts);
  return extractJson(text);
}
