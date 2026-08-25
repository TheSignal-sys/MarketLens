#!/usr/bin/env node
/**
 * make-icons.mjs — one-off asset generation.
 *
 * Rasterises the SVG mark into the PNG sizes iOS and Android require, and
 * renders the Open Graph share card, using headless Chromium. The outputs are
 * committed to the repo, so this only needs re-running if the mark changes.
 *
 *   node scripts/make-icons.mjs
 *
 * Needs a Chromium/Chrome binary. Set CHROME_PATH if it is not on PATH.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile, mkdir, rm, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const run = promisify(execFile);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ICONS = join(ROOT, 'site', 'icons');
const TMP = join(ROOT, '.icon-tmp');

const CANDIDATES = [
  process.env.CHROME_PATH,
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);

const chrome = CANDIDATES.find((p) => existsSync(p));
if (!chrome) {
  console.error('No Chromium/Chrome found. Set CHROME_PATH to a browser binary.');
  process.exit(1);
}

async function shot(html, { width, height, out }) {
  const page = join(TMP, `p-${width}x${height}-${Math.random().toString(36).slice(2)}.html`);
  await writeFile(page, html);
  await run(chrome, [
    '--headless', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
    '--force-device-scale-factor=1',
    `--window-size=${width},${height}`,
    `--screenshot=${out}`,
    `file://${page}`,
  ], { maxBuffer: 1 << 26 });
  console.log(`  wrote ${out.replace(ROOT + '/', '')}`);
}

const wrap = (inner, w, h, bg = '#080b11') =>
  `<!doctype html><meta charset="utf-8"><style>
   html,body{margin:0;padding:0;width:${w}px;height:${h}px;overflow:hidden;background:${bg};}
   *{box-sizing:border-box}
   </style>${inner}`;

async function main() {
  await mkdir(TMP, { recursive: true });
  await mkdir(ICONS, { recursive: true });
  const svg = await readFile(join(ICONS, 'icon.svg'), 'utf8');

  console.log('Rasterising app icons…');
  for (const size of [180, 192, 512]) {
    await shot(
      wrap(`<div style="width:${size}px;height:${size}px">${svg.replace(/width="512" height="512"/, `width="${size}" height="${size}"`)}</div>`, size, size),
      { width: size, height: size, out: join(ICONS, `icon-${size}.png`) },
    );
  }

  // Maskable: Android crops to a circle, so the mark needs ~20% padding.
  console.log('Rendering maskable icon…');
  await shot(
    wrap(
      `<div style="width:512px;height:512px;background:#0d131d;display:grid;place-items:center">
         <div style="width:340px;height:340px">${svg.replace(/width="512" height="512"/, 'width="340" height="340"').replace(/<rect[^>]*\/>/, '')}</div>
       </div>`,
      512, 512, '#0d131d',
    ),
    { width: 512, height: 512, out: join(ICONS, 'icon-maskable-512.png') },
  );

  console.log('Rendering Open Graph card…');
  const og = wrap(`
    <div style="width:1200px;height:630px;background:linear-gradient(150deg,#141d2b,#070a10 60%);
                font-family:ui-sans-serif,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;
                color:#e9eef7;padding:70px 80px 62px;display:flex;flex-direction:column;justify-content:space-between;
                border-bottom:10px solid #e9a13b">
      <div style="display:flex;align-items:center;gap:22px">
        <div style="width:74px;height:74px">${svg.replace(/width="512" height="512"/, 'width="74" height="74"')}</div>
        <div style="font-size:46px;font-weight:700;letter-spacing:-.03em">Market<span style="color:#e9a13b">Lens</span></div>
      </div>
      <div>
        <div style="font-size:70px;font-weight:680;letter-spacing:-.035em;line-height:1.08;max-width:960px">
          The second-order effects the headline doesn't tell you.
        </div>
        <div style="font-size:29px;color:#9aa8bf;margin-top:26px;line-height:1.45;max-width:900px">
          Daily cross-asset analysis across rates, FX, equities, credit, commodities and volatility — with a published track record.
        </div>
      </div>
      <div style="display:flex;gap:12px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:20px;color:#e9a13b">
        ${['RATES', 'FX', 'EQUITIES', 'CREDIT', 'COMMODITIES', 'VOL']
          .map((t) => `<span style="border:1px solid #7a5620;border-radius:99px;padding:8px 20px;background:rgba(233,161,59,.1)">${t}</span>`)
          .join('')}
      </div>
    </div>`, 1200, 630);
  await shot(og, { width: 1200, height: 630, out: join(ICONS, 'og.png') });

  await rm(TMP, { recursive: true, force: true });
  console.log('\nDone.');
}

main().catch(async (e) => {
  await rm(TMP, { recursive: true, force: true }).catch(() => {});
  console.error(e);
  process.exit(1);
});
