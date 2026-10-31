import type { EgmaForm, EgmaItem } from '../../../content/egma';
import type { BatteryConfig } from '../types/BatteryConfig';
import type { MathsCaptureItem, MathsGridItemSet } from '../questions/MathsGridQuestion/types';
import type { MathsCardsItemSet } from '../questions/MathsCardsQuestion/types';
import { CORE_ARITHMETIC_CODES, MATHS_BANDS } from './strategies';

export const EARLY_STOP_AT = 3;
export const CORE_STOP_AT = 4;
export const COUNT_ALOUD_STOP_AT = 1;
export const MATHS_BATTERY_CODE = 'masi_maths';

// Battery order, item kind, skill and scored-item count are the approved instrument contract.
const questions = [
  ['maths_count_aloud','checkpoint','count_aloud',5],
  ['maths_quick_see','fingers','quick_see',6],
  ['maths_count_out','count_out','count_out',9],
  ['maths_read_numbers','number','read_numbers',9],
  ['egma_number_id','number','read_numbers',20],
  ['maths_which_more','pair','compare_numbers',9],
  ['egma_number_discrimination','pair','compare_numbers',10],
  ['maths_neighbours','neighbour','number_neighbours',9],
  ['egma_missing_number','sequence','number_patterns',10],
  ['maths_add_counters','counters','add_objects',6],
  ['maths_take_away_counters','counters','subtract_objects',6],
  ['maths_make_five_ten','fingers','number_bonds',6],
  ['egma_addition_l1','equation','add',20],
  ['egma_addition_l2','equation','add',5],
  ['egma_subtraction_l1','equation','subtract',20],
  ['egma_subtraction_l2','equation','subtract',5],
  ['egma_word_problems','word_problem','word_problems',6],
] as const;
export type MathsQuestionCode = typeof questions[number][0];
export const MATHS_QUESTION_CODES: readonly MathsQuestionCode[] = questions.map(([code]) => code);
type MathsItemSet = MathsGridItemSet | MathsCardsItemSet;

const grids: Partial<Record<MathsQuestionCode, { layout: MathsGridItemSet['layout']; tile: MathsGridItemSet['tile'] }>> = {
  maths_read_numbers: { layout:'three_by_three',tile:'number' },
  egma_number_id: { layout:'five_by_four',tile:'number' },
  egma_addition_l1: { layout:'two_by_five',tile:'sum' },
  egma_subtraction_l1: { layout:'two_by_five',tile:'sum' },
};
const timed = new Set(['egma_number_id','egma_addition_l1','egma_subtraction_l1']);
const arithmetic = new Set<string>(CORE_ARITHMETIC_CODES);
const counters = new Set(['maths_count_out','maths_add_counters','maths_take_away_counters','egma_word_problems']);
const pages: Partial<Record<MathsQuestionCode, number>> = {
  maths_read_numbers:1, maths_which_more:3, egma_number_id:2, egma_number_discrimination:4, egma_missing_number:5,
  egma_addition_l1:6, egma_subtraction_l1:8, egma_addition_l2:7, egma_subtraction_l2:9,
};
const numberWords: Record<string, number> = { one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,eleven:11,twelve:12 };
const record = (value: unknown) => value !== null && typeof value === 'object' && !Array.isArray(value);

function display(item: EgmaItem): Pick<MathsCaptureItem, 'prompt' | 'gloss'> {
  switch (item.kind) {
    case 'number': return {prompt:String(item.value)};
    case 'pair': return {prompt:`${item.left}   ${item.right}`,gloss:String(item.answer)};
    case 'sequence': return {prompt:item.slots.map(n=>n===null?'__':String(n)).join('  '),gloss:String(item.answer)};
    case 'equation': case 'counters': return {prompt:`${item.a} ${item.op==='+'?'+':'−'} ${item.b}`,gloss:String(item.answer)};
    case 'checkpoint': return {prompt:`Counts to ${item.upTo}`};
    case 'fingers': return item.mode==='flash' ? {prompt:`${item.shown} fingers`}
      : {prompt:`${item.shown} up`,gloss:`${item.answer} down`};
    case 'count_out': return {prompt:`Give ${item.target}`};
    case 'neighbour': return {prompt:`${item.relation} ${item.n}`,gloss:String(item.answer)};
    case 'word_problem': return {prompt:item.phrases.join('\n(pause)\n'),gloss:String(item.answer)};
  }
}

export function adaptEgmaForm(form: EgmaForm): {
  form: EgmaForm; battery: BatteryConfig; itemSets: Record<MathsQuestionCode, MathsItemSet>;
} {
  const id = typeof form?.id === 'string' ? form.id : '<unknown>';
  const fail = (message: string): never => { throw new TypeError(`${id}: ${message}`); };
  const text = (value: unknown) => { if (typeof value !== 'string' || !value.trim()) fail('expected non-empty text'); };
  const integer = (value: unknown) => { if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) fail('expected a non-negative integer'); };
  if (!record(form)) fail('expected a form object');
  text(form.id); text(form.title); text(form.languageName);
  if (form.languageCode !== 'en') fail('only English is supported');
  if (!Array.isArray(form.sourceNotes)) fail('sourceNotes must be an array');
  form.sourceNotes.forEach(text);
  if (!Array.isArray(form.questions) || form.questions.length !== questions.length) fail('expected 17 Questions');

  const entries: Array<[MathsQuestionCode, MathsItemSet]> = [];
  form.questions.forEach((question, index) => {
    const [code, kind, skill, count] = questions[index];
    if (!record(question) || question.questionCode !== code) fail('Questions must follow the agreed order');
    text(question.title); text(question.instructions);
    if (!Array.isArray(question.practiceItems)) fail(`${code}: invalid practice items`);
    question.practiceItems.forEach(text);
    if (question.timeLimitSeconds !== (timed.has(code)?60:null)) fail(`${code}: invalid time limit`);
    if (question.numberCardPage !== (pages[code]??null)) fail(`${code}: invalid Number Card page`);
    if (!Array.isArray(question.items) || question.items.length !== count) fail(`${code}: expected ${count} items`);
    question.items.forEach((item, position) => {
      if (!record(item) || item.id !== String(position+1)) fail(`${code}: ids must be sequential 1..n`);
      if (item.kind !== kind || item.skill !== skill) fail(`${code}: invalid kind or skill`);
      if (item.source !== 'rti-2014-printed' && item.source !== 'masi-2026') fail(`${code}: invalid source`);
      if (item.label !== undefined) text(item.label);
      integer(item.answer);
      const numbers = [item.answer];
      const add = (...values: number[]) => { values.forEach(integer); numbers.push(...values); };
      let answer = item.answer;
      switch (item.kind) {
        case 'number': add(item.value); answer=item.value; break;
        case 'pair': add(item.left,item.right); answer=Math.max(item.left,item.right); break;
        case 'checkpoint': add(item.upTo); answer=item.upTo; break;
        case 'count_out': add(item.target); answer=item.target; break;
        case 'neighbour':
          add(item.n);
          if (item.relation!=='before' && item.relation!=='after') fail(`${code}: invalid neighbour relation`);
          answer=item.n+(item.relation==='after'?1:-1); break;
        case 'fingers':
          add(item.shown);
          if (code==='maths_quick_see' && item.mode==='flash') answer=item.shown;
          else if (code==='maths_make_five_ten' && item.mode==='make' && (item.total===5 || item.total===10)) {
            add(item.total); answer=item.total-item.shown;
          } else fail(`${code}: invalid fingers mode or total`);
          break;
        case 'equation': case 'counters': {
          add(item.a,item.b);
          const op=code.includes('subtraction') || code==='maths_take_away_counters'?'-':'+';
          if (item.op!==op) fail(`${code}: invalid operator`);
          answer=item.op==='+'?item.a+item.b:item.a-item.b; break;
        }
        case 'sequence': {
          if (!Array.isArray(item.slots) || item.slots.length!==4 || item.slots.filter(n=>n===null).length!==1) fail(`${code}: sequence needs four slots and exactly one null`);
          const known=item.slots.map((n,i)=>({n,i})).filter((entry): entry is {n:number;i:number}=>entry.n!==null);
          add(...known.map(entry=>entry.n));
          const step=(known[1].n-known[0].n)/(known[1].i-known[0].i);
          if (known.some(entry=>entry.n!==known[0].n+step*(entry.i-known[0].i))) fail(`${code}: inconsistent sequence`);
          answer=known[0].n+step*(item.slots.indexOf(null)-known[0].i); break;
        }
        case 'word_problem':
          text(item.problemType);
          if (!Array.isArray(item.phrases) || !item.phrases.length) fail(`${code}: missing phrases`);
          item.phrases.forEach(text);
          for (const phrase of item.phrases) {
            numbers.push(...(phrase.match(/\d+/g)??[]).map(Number));
            for (const word of phrase.toLowerCase().split(/[^a-z]+/)) {
              if (Object.prototype.hasOwnProperty.call(numberWords,word)) numbers.push(numberWords[word]);
            }
          }
          break;
        default: fail(`${code}: unknown item kind`);
      }
      if (answer !== item.answer) fail(`${code}: incorrect answer`);
      if (item.band !== MATHS_BANDS.find(band=>band>=Math.max(...numbers))) fail(`${code}: invalid band`);
    });
    const grid=grids[code];
    const items=question.items.map(item => {
      const mapped=display(item);
      return {item_key:item.id,...mapped,prompt:item.label??mapped.prompt,skill:item.skill,band:item.band};
    });
    const meta={question_code:code,question_version:form.id,language:form.languageCode,item_set_id:`${code}@${form.id}.${form.languageCode}`,
      stop_rule:{kind:'consecutive_wrong' as const,stop_at:code==='maths_count_aloud'?COUNT_ALOUD_STOP_AT:code.startsWith('egma_')?CORE_STOP_AT:EARLY_STOP_AT},
      strategy_step:arithmetic.has(code),items};
    const noun=kind==='number'?'number':kind==='pair'?'pair':kind==='word_problem'?'problem':'item';
    const set: MathsItemSet=grid ? {...meta,kind:'maths_grid',...grid,noun:kind==='number'?'number':'item'}
      : {...meta,kind:'maths_cards',noun,choices:code==='maths_add_counters'?'add':code==='maths_take_away_counters'?'take_away':null};
    entries.push([code,set]);
  });
  const prerequisite=(depends_on:string,minScore:number) => ({depends_on,minScore,
    on_unmet_reason:'skipped_prerequisite_unmet' as const,unmet_label:'Not ready yet'});
  const battery: BatteryConfig={
    battery_code:MATHS_BATTERY_CODE,battery_version:'2026.1-draft',title:'Maths assessment',aboutMinutes:20,
    languages:['en'],fixedLanguage:'en',numberCard:'Number Card 2026.1',
    questions:form.questions.map(question=>({
      question_code:question.questionCode,question_version:form.id,title:question.title,
      instructions:{en:question.instructions+(question.practiceItems.length?` Practice first (not scored): ${question.practiceItems.map(item => /^[0-9 _+−|]+$/.test(item) ? item.replace(/ /g, '\u00a0').replace(/_/g, '___') : item).join(', ')}`:'')},
      ...(question.timeLimitSeconds===null?{}:{durationSec:question.timeLimitSeconds}),
      materials:question.numberCardPage!==null?{item:'number_card',page:question.numberCardPage}:counters.has(question.questionCode)?{item:'counters'}:null,
    })),
    prerequisites:{
      egma_number_id:prerequisite('maths_read_numbers',7),
      egma_number_discrimination:prerequisite('maths_which_more',7),
      egma_missing_number:prerequisite('maths_neighbours',7),
      egma_addition_l1:prerequisite('maths_add_counters',4),
      egma_addition_l2:prerequisite('egma_addition_l1',1),
      egma_subtraction_l1:prerequisite('maths_take_away_counters',4),
      egma_subtraction_l2:prerequisite('egma_subtraction_l1',1),
      egma_word_problems:prerequisite('maths_add_counters',4),
    },
  };
  return {form,battery,itemSets:Object.fromEntries(entries) as Record<MathsQuestionCode,MathsItemSet>};
}
