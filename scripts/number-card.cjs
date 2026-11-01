'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { getEgmaAssessment } = require('../content/egma/index.js');

// Embed the app's child-reading font so the card prints the same glyphs on any computer.
const ANDIKA = path.join(__dirname, '../node_modules/@expo-google-fonts/andika/400Regular/Andika_400Regular.ttf');
const andikaFace = () => `@font-face { font-family: Andika; font-weight: 400; src: url(data:font/ttf;base64,${
  fs.readFileSync(ANDIKA).toString('base64')}) format('truetype'); }`;

function numeral(value) {
  if (!Number.isInteger(value) || value < 0) throw new Error(`Invalid card numeral: ${value}`);
  return String(value);
}

function table(className, rows) {
  return `<table class="${className}"><tbody>\n${rows.map(row =>
    `  <tr>${row.map(cell => `<td>${cell}</td>`).join('')}</tr>`
  ).join('\n')}\n</tbody></table>`;
}

function grouped(cells, columns) {
  const rows = [];
  for (let index = 0; index < cells.length; index += columns) {
    const row = cells.slice(index, index + columns);
    while (row.length < columns) row.push('');
    rows.push(row);
  }
  return rows;
}

function questionTable(question) {
  const { items } = question;
  const kind = items[0]?.kind;
  if (!items.length || items.some(item => item.kind !== kind)) {
    throw new Error(`Card page ${question.numberCardPage} must have one item kind`);
  }
  switch (kind) {
    case 'number': {
      const early = items.length === 9;
      return table(early ? 'numbers early' : 'numbers', grouped(items.map(item => numeral(item.value)), early ? 3 : 5));
    }
    case 'pair':
      return table('pairs', items.map(item => [numeral(item.left), numeral(item.right)]));
    case 'sequence':
      return table('sequences', items.map(item => item.slots.map(slot =>
        slot === null ? '<span class="blank">□</span>' : numeral(slot)
      )));
    case 'equation': {
      const cells = items.map(item => {
        if (item.op !== '+' && item.op !== '-') throw new Error(`Unsupported card operator: ${item.op}`);
        return `${numeral(item.a)} ${item.op === '-' ? '−' : '+'} ${numeral(item.b)}`;
      });
      return table(items.length <= 6 ? 'equations short' : 'equations', grouped(cells, 2));
    }
    default:
      throw new Error(`Unsupported card item kind: ${kind}`);
  }
}

function renderNumberCard(form) {
  const pages = form.questions.filter(question => question.numberCardPage != null)
    .sort((a, b) => a.numberCardPage - b.numberCardPage)
    .map(question => {
      const page = numeral(question.numberCardPage);
      return `<section data-page="${page}">\n<h1>${page}</h1>\n${questionTable(question)}\n</section>`;
    });
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title></title>
<style>
  ${andikaFace()}
  @page { size: A4 portrait; margin: 15mm; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: white;
    color: black;
    font-family: Andika, "Comic Sans MS", "Comic Sans", "Trebuchet MS", Arial, sans-serif;
    font-weight: 400;
    font-variant-numeric: tabular-nums;
    line-height: 1.25;
  }
  section { page-break-after: always; break-after: page; page-break-inside: avoid; break-inside: avoid; }
  section:last-child { page-break-after: auto; break-after: auto; }
  h1 { margin: 0 0 8mm; font-size: 12pt; font-weight: 400; text-align: right; }
  table { width: 100%; table-layout: fixed; border-collapse: collapse; }
  tr { page-break-inside: avoid; break-inside: avoid; }
  td { padding: 0; text-align: center; vertical-align: middle; }
  .numbers td { height: 50mm; font-size: 42pt; }
  .numbers.early td { height: 70mm; font-size: 60pt; }
  /* Each pair sits in its own box, close together, so a child reads across the pair, not down a column. */
  .pairs { width: 70%; margin: 0 auto; border-collapse: separate; border-spacing: 0 3mm; }
  .pairs td { height: 20mm; font-size: 36pt; border-top: 0.6mm solid black; border-bottom: 0.6mm solid black; }
  .pairs td:first-child { border-left: 0.6mm solid black; border-radius: 3mm 0 0 3mm; }
  .pairs td:last-child { border-right: 0.6mm solid black; border-radius: 0 3mm 3mm 0; }
  .sequences td { height: 22mm; font-size: 32pt; }
  /* The missing number is a drawn box the size of a digit; the glyph inside stays for text checks only. */
  .blank { display: inline-block; width: 0.8em; height: 1em; border: 0.6mm solid black; border-radius: 2mm;
    color: transparent; vertical-align: middle; overflow: hidden; line-height: 1; }
  .equations td { height: 22mm; font-size: 36pt; white-space: nowrap; }
  .equations.short td { height: 60mm; font-size: 42pt; }
</style>
</head>
<body>
${pages.join('\n')}
</body>
</html>
`;
}

module.exports = { renderNumberCard };

if (require.main === module) {
  const formId = process.argv[2];
  const form = getEgmaAssessment(formId);
  if (!form) {
    console.error(formId ? `Unknown EGMA form: ${formId}` : 'Usage: node scripts/number-card.cjs <formId>');
    process.exitCode = 1;
  } else {
    const output = path.resolve(__dirname, '../design/number-card', `number-card-${form.id}.html`);
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, renderNumberCard(form), 'utf8');
    console.log(output);
  }
}
