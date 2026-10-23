import type { ReadingComprehensionItemSet } from '../questions/ReadingComprehensionQuestion/types';

export const FIXTURE_READING_COMPREHENSION_EN: ReadingComprehensionItemSet = {
  question_code: 'reading_comprehension', question_version: 'fixture',
  item_set_id: 'reading_comprehension@fixture.en', language: 'en',
  passage: 'Pip found a red berry. He took it home to share with his sister.',
  questions: [
    { item_key: '0', prompt: 'What did Pip find?', answer_guide: 'A berry' },
    { item_key: '1', prompt: 'What colour was it?', answer_guide: 'Red' },
    { item_key: '2', prompt: 'Why did he take it home?', answer_guide: 'To share with his sister; accept equivalent wording' },
  ],
};
