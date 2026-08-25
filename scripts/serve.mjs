#!/usr/bin/env node
/**
 * serve.mjs — local preview server for dist/. No dependencies.
 *
 *   node scripts/serve.mjs          then open http://localhost:4321
 *   node scripts/serve.mjs 8080     to use a different port
 *
 * Also runs the /api/ask function locally, so the question box works in
 * preview exactly as it will in production. It needs a model API key in .env.
 */

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname, normalize } from 'node:path';

import { loadEnv } from './lib/env.mjs';

loadEnv();

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const PORT = Number(process.argv[2] || process.env.PORT || 4321);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

/** Minimal shim so the Vercel-style handler runs unmodified under plain Node. */
function shimResponse(res) {
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (obj) => {
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(obj));
    return res;
  };
  return res;
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  try { return JSON.parse(raw); } catch { return raw; }
}

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  // Local stand-in for the Vercel serverless function.
  if (url.pathname === '/api/ask') {
    try {
      const { default: handler } = await import('../api/ask.js');
      req.body = await readBody(req);
      if (!process.env.SITE_URL) process.env.SITE_URL = `http://localhost:${PORT}`;
      await handler(req, shimResponse(res));
    } catch (err) {
      shimResponse(res).status(500).json({ error: `Local ask handler failed: ${err.message}` });
    }
    return;
  }

  try {
    let path = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
    let file = join(DIST, path);

    try {
      const s = await stat(file);
      if (s.isDirectory()) file = join(file, 'index.html');
    } catch {
      if (!extname(file)) file = join(file, 'index.html');
    }

    const body = await readFile(file);
    res.writeHead(200, {
      'content-type': TYPES[extname(file)] || 'application/octet-stream',
      'cache-control': 'no-cache',
    });
    res.end(body);
  } catch {
    try {
      const notFound = await readFile(join(DIST, '404.html'));
      res.writeHead(404, { 'content-type': TYPES['.html'] });
      res.end(notFound);
    } catch {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('Not found');
    }
  }
}).listen(PORT, () => {
  const key = process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY;
  console.log(`MarketLens preview → http://localhost:${PORT}`);
  console.log(key ? '  question box: live (using your API key)' : '  question box: off (no API key in .env)');
});
