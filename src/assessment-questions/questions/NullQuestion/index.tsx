import { useEffect } from 'react';
import type { QuestionProps } from '../../types/QuestionProps';

export function NullQuestion(props: QuestionProps) {
  const { language, onComplete } = props;

  useEffect(() => {
    onComplete({
      question_code: 'null_question',
      question_version: '1.0',
      item_set_id: `null_question@1.0.${language}`,
      language,
      duration_ms: 0,
      stopped_reason: 'completed',
      items: [],
      derived: {
        total_correct: 0,
        total_attempted: 0,
        percent: 0,
        last_attempted_position: null,
      },
    });
  }, [language, onComplete]);

  return null;
}
