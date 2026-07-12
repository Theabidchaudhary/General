// Generates the extension's PNG icon set (16/32/48/128) by rendering a
// simple branded glyph in headless Chromium and screenshotting it.
// Run manually with `node scripts/generate-icons.mjs` after changing the
// design; the output is checked into public/icons/ like any other asset.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, '..', 'public', 'icons');
mkdirSync(outDir, { recursive: true });

const SIZES = [16, 32, 48, 128];

function iconHtml(size) {
  // Indigo-600, matching the app's primary brand color used throughout the
  // UI (buttons, active nav). A simple stacked-queue glyph in white.
  const bg = '#4f46e5';
  const bar = Math.max(1, Math.round(size * 0.09));
  const gap = Math.max(1, Math.round(size * 0.09));
  const barWidth = Math.round(size * 0.56);
  const radius = Math.round(size * 0.09);
  return `<!doctype html>
<html><head><style>
  html, body { margin: 0; padding: 0; }
  .icon {
    width: ${size}px; height: ${size}px;
    background: ${bg};
    border-radius: ${Math.round(size * 0.18)}px;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: ${gap}px;
  }
  .bar { width: ${barWidth}px; height: ${bar}px; background: #ffffff; border-radius: ${radius}px; }
  .bar:nth-child(2) { width: ${Math.round(barWidth * 0.7)}px; }
</style></head>
<body>
  <div class="icon">
    <div class="bar"></div>
    <div class="bar"></div>
    <div class="bar"></div>
  </div>
</body></html>`;
}

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage();

for (const size of SIZES) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(iconHtml(size));
  const buffer = await page.screenshot({ omitBackground: true });
  const outPath = path.join(outDir, `icon-${size}.png`);
  writeFileSync(outPath, buffer);
  console.log(`Wrote ${outPath}`);
}

await browser.close();
