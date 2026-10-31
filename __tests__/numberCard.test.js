const fs = require('node:fs');
const path = require('node:path');
const { getEgmaAssessment } = require('../content/egma/index.js');
const { renderNumberCard } = require('../scripts/number-card.cjs');

const form = getEgmaAssessment('masi-egma-en-2026-1-draft');
const questions = form.questions.filter(question => question.numberCardPage != null)
  .sort((a, b) => a.numberCardPage - b.numberCardPage);
const sections = html => [...html.matchAll(/<section\b[^>]*data-page="(\d+)"[^>]*>([\s\S]*?)<\/section>/g)]
  .map(([, page, body]) => ({ page: Number(page), body }));
const textOf = html => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
const withoutHeading = body => body.replace(/<h1\b[^>]*>[\s\S]*?<\/h1>/, '');

// Compare the complete prompt stream, including duplicates and blanks. Merely
// checking that a numeral occurs would allow omitted items and leaked answers.
const promptTokens = item => {
  switch (item.kind) {
    case 'number': return [String(item.value)];
    case 'pair': return [String(item.left), String(item.right)];
    case 'sequence': return item.slots.map(slot => slot == null ? '□' : String(slot));
    case 'equation': return [String(item.a), item.op === '-' ? '−' : '+', String(item.b)];
    default: throw new Error(`Unexpected card item kind: ${item.kind}`);
  }
};

test('one section per number card page, 1..9 in order', () => {
  expect(sections(renderNumberCard(form)).map(section => section.page)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  expect(sections(renderNumberCard({ ...form, questions: [...form.questions].reverse() }))
    .map(section => section.page)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
});

test('each section shows every item numeral of its Question', () => {
  const pages = sections(renderNumberCard(form));
  for (const question of questions) {
    const page = pages.find(section => section.page === question.numberCardPage);
    expect(textOf(withoutHeading(page.body)).split(' ')).toEqual(question.items.flatMap(promptTokens));
  }
});

test('sections contain only numerals, + − and blank boxes', () => {
  for (const { page, body } of sections(renderNumberCard(form))) {
    expect(textOf(body.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/)[1])).toBe(String(page));
    expect(textOf(withoutHeading(body))).toMatch(/^[0-9+−\s□]*$/);
  }
  const body = renderNumberCard(form).match(/<body>([\s\S]*?)<\/body>/)[1];
  expect(textOf(body)).toMatch(/^[0-9+−\s□]*$/);
});

test('answer keys and assessor copy never enter the card', () => {
  const poisoned = { ...form, title: 'SECRET', sourceNotes: ['SECRET'], questions: form.questions.map(question => ({
    ...question, title: 'SECRET', instructions: 'SECRET', practiceItems: ['SECRET'],
    items: question.items.map(item => ({ ...item, answer: 987654321, label: 'SECRET' })),
  })) };
  expect(renderNumberCard(poisoned)).toBe(renderNumberCard(form));
});

test('the card uses A4 print CSS and the prescribed table layouts', () => {
  const html = renderNumberCard(form);
  expect(html).toMatch(/@page\s*\{[^}]*size:\s*A4/);
  expect(html).toMatch(/page-break-after:\s*always/);
  expect(html).toContain('Andika');
  const pages = sections(html);
  const rowCells = page => [...pages.find(section => section.page === page).body.matchAll(/<tr>([\s\S]*?)<\/tr>/g)]
    .map(([, row]) => [...row.matchAll(/<td\b[^>]*>/g)].length);
  expect(rowCells(1)).toEqual([3, 3, 3]);
  expect(rowCells(2)).toEqual(Array(9).fill(2));
  expect(rowCells(3)).toEqual([5, 5, 5, 5]);
  expect(rowCells(4)).toEqual(Array(10).fill(2));
  expect(rowCells(5)).toEqual(Array(10).fill(4));
  for (const page of [6, 7]) expect(rowCells(page)).toEqual(Array(10).fill(2));
  for (const page of [8, 9]) expect(rowCells(page)).toEqual([2, 2, 2]);
});

test('the committed HTML matches the generator', () => {
  const html = fs.readFileSync(path.join(__dirname,
    '../design/number-card/number-card-masi-egma-en-2026-1-draft.html'), 'utf8');
  expect(html).toBe(renderNumberCard(form));
});
