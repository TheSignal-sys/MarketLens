/**
 * env.mjs — loads a local .env file if one exists.
 *
 * On GitHub Actions and Vercel the variables are already in the environment,
 * so this quietly does nothing. Locally it means `node scripts/pipeline.mjs`
 * just works without exporting anything by hand.
 */

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

export function loadEnv() {
  const file = join(ROOT, '.env');
  if (!existsSync(file)) return;

  // Node 20.6+ has this built in and handles quoting correctly.
  if (typeof process.loadEnvFile === 'function') {
    try { process.loadEnvFile(file); return; } catch { /* fall through */ }
  }

  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/i);
    if (!m) continue;
    const key = m[1];
    let value = m[2].trim();
    if (/^".*"$/.test(value) || /^'.*'$/.test(value)) value = value.slice(1, -1);
    if (!(key in process.env)) process.env[key] = value;
  }
}
