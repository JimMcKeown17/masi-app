'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { egmaCatalog, listEgmaAssessments, getEgmaAssessment } = require('./index');
const questions = () => getEgmaAssessment('masi-egma-en-2026-1-draft').questions;
const question = code => questions().find(q => q.questionCode === code);
const allItems = () => questions().flatMap(q => q.items);
const PINNED_SHA256 = '6f69090dbc90acf86c21fc7b794e353adc26fcf37ed6afdae24737f94c6f8731';

function numbers(item) {
  switch (item.kind) {
    case 'number': return [item.value, item.answer];
    case 'pair': return [item.left, item.right, item.answer];
    case 'sequence': return [...item.slots.filter(n => n !== null), item.answer];
    case 'equation': case 'counters': return [item.a, item.b, item.answer];
    case 'checkpoint': return [item.upTo];
    case 'fingers': return [item.shown, item.answer, ...(item.mode === 'make' ? [item.total] : [])];
    case 'count_out': return [item.target, item.answer];
    case 'neighbour': return [item.n, item.answer];
    case 'word_problem': return [item.answer, ...item.phrases.flatMap(p => (p.match(/\d+/g) || []).map(Number)),
      ...item.phrases.join(' ').toLowerCase().split(/[^a-z]+/).map(word => ({one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,eleven:11,twelve:12})[word]).filter(n => n !== undefined)];
    default: assert.fail(`Unknown kind: ${item.kind}`);
  }
}
function checkBand(item) {
  const expected = [5, 10, 20, 50, 100, 1000].find(b => b >= Math.max(...numbers(item)));
  assert.equal(item.band, expected, `${item.kind} #${item.id}`);
}
function checkInverse(add, sub) {
  assert.equal(sub.a, add.a + add.b);
  assert.equal(sub.op, '-');
  assert.ok(sub.b === add.a || sub.b === add.b);
}

test('the bundled JSON is the pinned draft transcription', () => {
  const hash = createHash('sha256').update(readFileSync(join(__dirname, 'egma-assessments.json'))).digest('hex');
  assert.equal(hash, PINNED_SHA256);
  assert.equal(egmaCatalog.formatVersion, 1);
  assert.equal(egmaCatalog.contentVersion, '2026-10-31.1-draft');
  assert.equal(listEgmaAssessments().length, 1);
  assert.equal(listEgmaAssessments()[0].languageCode, 'en');
});
test('each Question has the agreed item count', () => {
  assert.deepEqual(questions().map(q => q.items.length), [5,6,9,9,20,9,10,9,10,6,6,6,20,5,20,5,6]);
  assert.equal(allItems().length, 161);
});
test('ids run 1..n within each Question', () => {
  for (const q of questions()) assert.deepEqual(q.items.map(i => i.id), q.items.map((_, i) => String(i + 1)));
});
test('every band is the smallest band at or above the largest number in the item', () => {
  allItems().forEach(checkBand);
  assert.throws(() => checkBand({kind:'number', id:'1', value:12, answer:12, band:10}));
  // Written-out quantities count too: the sharing answer is 3, but its 12 sweets require band 20.
  assert.throws(() => checkBand({...question('egma_word_problems').items[4], band:5}));
});
test('every answer is correct', () => {
  for (const i of allItems()) {
    let expected;
    switch (i.kind) {
      case 'number': expected = i.value; break;
      case 'pair': expected = Math.max(i.left, i.right); break;
      case 'checkpoint': expected = i.upTo; break;
      case 'count_out': expected = i.target; break;
      case 'fingers': expected = i.mode === 'make' ? i.total - i.shown : i.shown; break;
      case 'neighbour': expected = i.n + (i.relation === 'after' ? 1 : -1); break;
      case 'equation': case 'counters': expected = i.op === '+' ? i.a + i.b : i.a - i.b; break;
      case 'sequence': {
        assert.equal(i.slots.length, 4);
        assert.equal(i.slots.filter(n => n === null).length, 1);
        const known = i.slots.map((n, index) => [n,index]).filter(([n]) => n !== null);
        const step = (known[1][0] - known[0][0]) / (known[1][1] - known[0][1]);
        expected = known[0][0] + step * (i.slots.indexOf(null) - known[0][1]);
        i.slots.forEach((n,index) => { if (n !== null) assert.equal(n, known[0][0] + step * (index-known[0][1])); });
        break;
      }
      case 'word_problem': expected = [2+3,6-2,7-2,12-5,12/4,5*2][Number(i.id)-1]; break;
      default: assert.fail(`Unknown kind: ${i.kind}`);
    }
    assert.equal(i.answer, expected, `${i.kind} #${i.id}`);
  }
});
test('Addition 1 follows its spec', () => {
  for (const i of question('egma_addition_l1').items) {
    assert.equal(i.kind, 'equation'); assert.equal(i.op, '+');
    assert.ok(i.a <= 10 && i.b <= 10 && i.a + i.b <= 19);
  }
});
test('Subtraction 1 is Addition 1 inverted', () => {
  const adds = question('egma_addition_l1').items;
  question('egma_subtraction_l1').items.forEach((s,index) => checkInverse(adds[index],s));
  assert.throws(() => checkInverse(adds[0], {a:4, op:'-', b:2}));
});
test('printed items match the toolkit', () => {
  assert.deepEqual(question('egma_number_id').items.map(i => i.value), [2,9,0,12,30,22,45,39,23,48,91,33,74,87,65,108,245,587,731,989]);
  assert.deepEqual(question('egma_number_discrimination').items.map(i => [i.left,i.right]), [[7,5],[11,24],[39,23],[58,49],[65,67],[94,78],[146,153],[287,534],[623,632],[867,965]]);
  assert.deepEqual(question('egma_missing_number').items.map(i => i.slots), [[5,6,7,null],[14,15,null,17],[20,null,40,50],[null,300,400,500],[2,4,6,null],[348,349,null,351],[28,null,24,22],[30,35,null,45],[550,540,530,null],[3,8,null,18]]);
  for (const [code, values] of [
    ['egma_addition_l1', [[1,3],[3,2],[6,2],[4,5],[3,3]]],
    ['egma_subtraction_l1', [[4,1],[5,2],[8,2],[9,5],[6,3]]],
    ['egma_addition_l2', [[13,6],[18,7],[12,14],[22,37],[38,26]]],
    ['egma_subtraction_l2', [[19,6],[25,7],[26,14],[59,37],[64,26]]],
  ]) assert.deepEqual(question(code).items.slice(0,5).map(i => [i.a,i.b]), values);
});
test('number card pages follow pack order with no gaps', () => {
  assert.deepEqual(questions().filter(q => q.numberCardPage !== null).map(q => q.numberCardPage), [1,2,3,4,5,6,7,8,9]);
});
test('unknown ids and languages return nothing', () => {
  assert.equal(getEgmaAssessment('unknown'), null);
  assert.equal(getEgmaAssessment(undefined), null);
  assert.equal(getEgmaAssessment('masi-egma-en-2026-1'), null);
  assert.deepEqual(listEgmaAssessments({languageCode:'xh'}), []);
  assert.deepEqual(listEgmaAssessments({languageCode:'EN'}), []);
  assert.equal(listEgmaAssessments({languageCode:'en'}).length, 1);
});
test('content is frozen against mutation', () => {
  const form = listEgmaAssessments()[0];
  const walk = value => {
    if (value && typeof value === 'object') { assert.ok(Object.isFrozen(value)); Object.values(value).forEach(walk); }
  };
  walk(egmaCatalog);
  assert.throws(() => { form.questions[0].items[0].answer = -1; }, TypeError);
  assert.throws(() => { form.questions.pop(); }, TypeError);
  assert.throws(() => { listEgmaAssessments().pop(); }, TypeError);
  assert.equal(getEgmaAssessment(form.id).questions[0].items[0].answer, 5);
});

test('authored items match Appendix A value by value', () => {
  for (const [code, field, values] of [
    ['maths_count_aloud','upTo',[5,10,20,50,100]],
    ['maths_quick_see','shown',[3,5,2,7,6,9]],
    ['maths_count_out','target',[4,2,5,7,9,6,12,15,18]],
    ['maths_read_numbers','value',[3,5,0,7,9,6,13,17,20]],
  ]) assert.deepEqual(question(code).items.map(i => i[field]),values);
  assert.deepEqual(question('maths_quick_see').items.map(i => [i.kind,i.mode]),Array.from({length:6},()=>['fingers','flash']));
  assert.deepEqual(question('maths_which_more').items.map(i=>[i.left,i.right]),[[2,4],[5,3],[3,4],[6,9],[8,7],[10,6],[12,15],[19,13],[11,17]]);
  assert.deepEqual(question('maths_neighbours').items.map(i=>[i.relation,i.n]),[['after',3],['before',5],['after',1],['after',6],['before',10],['after',9],['after',12],['before',16],['after',19]]);
  assert.deepEqual(question('maths_make_five_ten').items.map(i=>[i.kind,i.mode,i.shown,i.total]),[[3,5],[1,5],[4,5],[7,10],[4,10],[8,10]].map(([shown,total])=>['fingers','make',shown,total]));
  for (const [code, op, values] of [
    ['maths_add_counters','+',[[2,1],[3,2],[1,3],[4,3],[6,2],[5,4]]],
    ['maths_take_away_counters','-',[[3,1],[5,2],[4,3],[7,2],[9,3],[8,5]]],
    ['egma_addition_l1','+',[[2,5],[7,1],[4,4],[8,2],[6,4],[9,2],[5,6],[8,4],[7,5],[6,7],[9,5],[8,7],[7,9],[9,8],[10,9]]],
    ['egma_subtraction_l1','-',[[7,5],[8,1],[8,4],[10,2],[10,4],[11,2],[11,6],[12,4],[12,5],[13,7],[14,5],[15,7],[16,9],[17,8],[19,9]]],
  ]) {
    const items=question(code).items.slice(code.startsWith('egma_')?5:0);
    assert.deepEqual(items.map(i=>[i.a,i.op,i.b]),values.map(([a,b])=>[a,op,b]));
  }
  assert.deepEqual(question('egma_word_problems').items.map(i=>[i.problemType,i.phrases.join(' (pause) '),i.answer]),[
    ['change_result_unknown','Two children are in a taxi. (pause) Three more children get in. (pause) How many children are in the taxi now?',5],
    ['combine','There are six children in the taxi. (pause) Two are boys. (pause) The rest are girls. (pause) How many girls are in the taxi?',4],
    ['compare','Lwazi has two sweets. (pause) Ayanda has seven sweets. (pause) How many more sweets does Lwazi need to have the same as Ayanda?',5],
    ['change_start_unknown','Some children are in a taxi. (pause) Five more children get in. (pause) Now there are twelve children in the taxi. (pause) How many children were in the taxi at the start?',7],
    ['sharing','Four children share twelve sweets. (pause) They each get the same number. (pause) How many sweets does each child get?',3],
    ['multiplying','There are five seats in the taxi. (pause) Two children sit on each seat. (pause) How many children are in the taxi?',10],
  ]);
});

test('Question order, titles, skills, sources, timing and pages match the agreed contract', () => {
  const expected = [
    ['maths_count_aloud','Count aloud','count_aloud',null,null],
    ['maths_quick_see','Finger flash','quick_see',null,null],
    ['maths_count_out','Count out counters','count_out',null,null],
    ['maths_read_numbers','Read numbers to 20','read_numbers',null,1],
    ['egma_number_id','Read big numbers','read_numbers',60,2],
    ['maths_which_more','Which is more?','compare_numbers',null,3],
    ['egma_number_discrimination','Bigger number','compare_numbers',null,4],
    ['maths_neighbours','Before and after','number_neighbours',null,null],
    ['egma_missing_number','Missing number','number_patterns',null,5],
    ['maths_add_counters','Add with counters','add_objects',null,null],
    ['maths_take_away_counters','Take away with counters','subtract_objects',null,null],
    ['maths_make_five_ten','Make 5 and make 10','number_bonds',null,null],
    ['egma_addition_l1','Addition 1','add',60,6],
    ['egma_addition_l2','Addition 2','add',null,7],
    ['egma_subtraction_l1','Subtraction 1','subtract',60,8],
    ['egma_subtraction_l2','Subtraction 2','subtract',null,9],
    ['egma_word_problems','Word problems','word_problems',null,null],
  ];
  assert.deepEqual(questions().map(q=>[q.questionCode,q.title,q.items[0].skill,q.timeLimitSeconds,q.numberCardPage]),expected);
  questions().forEach((q,index)=> {
    assert.ok(q.instructions.trim());
    q.items.forEach((i,position)=> {
      assert.equal(i.skill,expected[index][2]);
      const printed=q.questionCode.startsWith('egma_') && q.questionCode!=='egma_word_problems' &&
        (!q.questionCode.endsWith('_l1') || position<5);
      assert.equal(i.source,printed?'rti-2014-printed':'masi-2026');
    });
  });
  assert.deepEqual(question('egma_number_discrimination').practiceItems,['3 | 8']);
  assert.deepEqual(question('egma_missing_number').practiceItems,['1 2 _ 4']);
  assert.deepEqual(question('egma_word_problems').practiceItems,['You have one sweet. (pause) I give you one more. (pause) How many sweets do you have now? (2)']);
});

test('Number Card instruction pages match the page supplied', () => {
  for (const q of questions().filter(q => q.numberCardPage !== null))
    assert.ok(q.instructions.includes(`Number Card page ${q.numberCardPage}`), q.questionCode);
});

test('spoken instructions use steps and match the materials in use', () => {
  assert.equal(question('maths_count_aloud').instructions, 'Say: "Count for me. Start at one." Mark each step the child reaches without a mistake. Stop at the first mistake. If the child stops for about 5 seconds, mark the next step wrong. The child may answer in any language you understand. Never say "correct" or "wrong" to the child.');
  for (const code of ['maths_quick_see','maths_count_out','maths_neighbours','maths_add_counters','maths_take_away_counters','maths_make_five_ten']) {
    assert.ok(question(code).instructions.endsWith('mark the item wrong and go to the next one.'), code);
  }
  for (const q of questions().filter(q => q.numberCardPage !== null))
    assert.ok(q.instructions.endsWith('mark the item wrong and point to the next one.'), q.questionCode);
  assert.ok(question('maths_neighbours').instructions.includes('Use the word and number on each item.'));
});

test('worked number sentences stay together in instructions', () => {
  assert.ok(question('maths_add_counters').instructions.includes('2\u00a0+\u00a01'));
  assert.ok(question('maths_take_away_counters').instructions.includes('3\u00a0−\u00a01'));
  for (const q of questions()) assert.doesNotMatch(q.instructions, /\d [ +−] \d/, q.questionCode);
});
