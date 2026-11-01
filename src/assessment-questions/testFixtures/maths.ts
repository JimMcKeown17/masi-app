import type { MathsGridItemSet } from '../questions/MathsGridQuestion/types';
import type { MathsCardsItemSet } from '../questions/MathsCardsQuestion/types';

export const FIXTURE_MATHS_GRID_TIMED_EN: MathsGridItemSet = {
  item_set_id: 'egma_addition_l1@fixture.en', question_code: 'egma_addition_l1', question_version: 'fixture', language: 'en',
  kind: 'maths_grid', layout: 'two_by_five', tile: 'sum', noun: 'number',
  stop_rule: { kind: 'consecutive_wrong', stop_at: 4 }, strategy_step: true,
  items: [
    { item_key: '1', prompt: '1 + 3', gloss: '4', skill: 'add', band: 5 },
    { item_key: '2', prompt: '3 + 2', gloss: '5', skill: 'add', band: 5 },
    { item_key: '3', prompt: '6 + 2', gloss: '8', skill: 'add', band: 10 },
    { item_key: '4', prompt: '4 + 5', gloss: '9', skill: 'add', band: 10 },
    { item_key: '5', prompt: '3 + 3', gloss: '6', skill: 'add', band: 10 },
  ],
};

export const FIXTURE_MATHS_CARDS_COUNTERS_EN: MathsCardsItemSet = {
  item_set_id: 'maths_add_counters@fixture.en', question_code: 'maths_add_counters', question_version: 'fixture', language: 'en',
  kind: 'maths_cards', noun: 'item', choices: 'add', stop_rule: { kind: 'consecutive_wrong', stop_at: 3 }, strategy_step: false,
  items: [
    { item_key: '1', prompt: '2 + 1', gloss: '3', skill: 'add_objects', band: 5 },
    { item_key: '2', prompt: '3 + 2', gloss: '5', skill: 'add_objects', band: 5 },
    { item_key: '3', prompt: '1 + 3', gloss: '4', skill: 'add_objects', band: 5 },
  ],
};

export const FIXTURE_MATHS_CARDS_PLAIN_EN: MathsCardsItemSet = {
  item_set_id: 'maths_which_more@fixture.en', question_code: 'maths_which_more', question_version: 'fixture', language: 'en',
  kind: 'maths_cards', noun: 'pair', choices: null, stop_rule: { kind: 'consecutive_wrong', stop_at: 3 }, strategy_step: false,
  items: [
    { item_key: '1', prompt: '2 | 4', gloss: '4', skill: 'compare_numbers', band: 5 },
    { item_key: '2', prompt: '5 | 3', gloss: '5', skill: 'compare_numbers', band: 5 },
    { item_key: '3', prompt: '3 | 4', gloss: '4', skill: 'compare_numbers', band: 5 },
  ],
};
