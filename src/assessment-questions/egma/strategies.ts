export const ADD_CHOICES = [
  { key: 'count_all', label: 'Counted from 1' },
  { key: 'count_on', label: 'Started from the first number' },
  { key: 'known', label: 'Just knew' },
] as const;

export const TAKE_AWAY_CHOICES = [
  { key: 'count_all', label: 'Counted what was left' },
  { key: 'count_on', label: 'Counted back' },
  { key: 'known', label: 'Just knew' },
] as const;

export const ITEM_STRATEGY_KEYS = ['count_all', 'count_on', 'known'] as const;

export const OBSERVATION_OPTIONS = [
  { key: 'head', label: 'In their head' },
  { key: 'fingers', label: 'Fingers' },
  { key: 'counters', label: 'Counters' },
  { key: 'paper', label: 'Paper' },
  { key: 'not_seen', label: "Couldn't tell", exclusive: true },
] as const;

export const COUNTERS_QUESTION_CODES = ['maths_add_counters', 'maths_take_away_counters'] as const;
export const CORE_ARITHMETIC_CODES = [
  'egma_addition_l1', 'egma_addition_l2', 'egma_subtraction_l1', 'egma_subtraction_l2', 'egma_word_problems',
] as const;
export const MATHS_BANDS = [5, 10, 20, 50, 100, 1000] as const;
