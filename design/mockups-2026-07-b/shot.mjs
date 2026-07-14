/* Screenshot every .phone element in every mockup page at 2x.
 *
 *   node shot.mjs            # all directions
 *   node shot.mjs 01         # only directions whose folder starts with "01"
 *
 * Each .phone is written to <its folder>/<data-name>.png.
 * Requires playwright's cached chromium (npx playwright install chromium).
 */
import { chromium } from 'playwright';
import { readdir, mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const filter = process.argv[2] ?? '';

const dirs = (await readdir(HERE, { withFileTypes: true }))
  .filter((d) => d.isDirectory() && /^\d\d-/.test(d.name) && d.name.startsWith(filter))
  .map((d) => d.name)
  .sort();

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1800, height: 1000 },
  deviceScaleFactor: 2,
});

let total = 0;
for (const dir of dirs) {
  const file = resolve(HERE, dir, 'index.html');
  await page.goto(pathToFileURL(file).href, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);   // never shoot a fallback font
  await mkdir(join(HERE, dir), { recursive: true });

  /* A phone is 844px of hard-clipped box. Content that overruns is simply
   * guillotined silently, and it looks like a design choice in a PNG.
   * So measure it rather than trusting our eyes. */
  const overflows = await page.evaluate(() =>
    [...document.querySelectorAll('.phone')].flatMap((p) =>
      ['.screen', '.content']
        .map((sel) => p.querySelector(sel))
        .filter(Boolean)
        .filter((el) => getComputedStyle(el).overflowY === 'hidden')
        .map((el) => ({ name: p.dataset.name, box: el.className, px: el.scrollHeight - el.clientHeight }))
        .filter((x) => x.px > 1)
    )
  );
  for (const o of overflows) {
    console.log(`  ⚠ CLIPPED  ${dir}/${o.name}: .${o.box} overruns by ${o.px}px`);
  }

  const phones = await page.locator('.phone').all();
  for (const phone of phones) {
    const name = await phone.getAttribute('data-name');
    await phone.screenshot({ path: join(HERE, dir, `${name}.png`) });
    total++;
    console.log(`  ${dir}/${name}.png`);
  }
}

await browser.close();
console.log(`\n${total} screens across ${dirs.length} directions.`);
