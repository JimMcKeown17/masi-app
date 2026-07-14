/* Screenshot each discussion page (full page, not per-phone).
 * See ../mockups-2026-07-b/README.md for the playwright setup, which is
 * deliberately kept OUT of the project's package.json.
 *
 *   node shot.mjs
 */
import { chromium } from 'playwright';
import { readdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

const dirs = (await readdir(HERE, { withFileTypes: true }))
  .filter((d) => d.isDirectory() && /^\d\d-/.test(d.name))
  .map((d) => d.name)
  .sort();

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1300, height: 1000 }, deviceScaleFactor: 2 });

for (const dir of dirs) {
  await page.goto(pathToFileURL(resolve(HERE, dir, 'index.html')).href, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);

  /* A phone is a hard-clipped 844px box: content that overruns is silently
   * guillotined and then looks like a design choice in a PNG. Measure it. */
  const over = await page.evaluate(() =>
    [...document.querySelectorAll('.phone')]
      .map((p, i) => ({ i, px: p.scrollHeight - p.clientHeight }))
      .filter((x) => x.px > 1)
  );
  for (const o of over) console.log(`  CLIPPED ${dir} phone #${o.i} overruns by ${o.px}px`);

  await page.screenshot({ path: join(HERE, dir, 'preview.png'), fullPage: true });
  console.log(`  ${dir}/preview.png`);
}

await browser.close();
