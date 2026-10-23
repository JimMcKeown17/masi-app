import React, { useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import type { QuestionProps } from '../../types/QuestionProps';
import type { ResultItem, StoppedReason } from '../../types/Result';
import type { ReadingComprehensionItemSet } from './types';
import { monotonicNow } from '../../progress/clock';
import { MissingItemSet } from '../../progress/MissingItemSet';
import { SkipReasonPicker } from '../../skip/SkipReasonPicker';
import { tokens } from '../../theme/tokens';
import { AssessmentChoiceCard, Canvas, ConfirmSheet, ContentText, FullScreenSheet, QuestionIntro, SecondaryButton, ToggleBar } from '../../ui';

type Mark = 'correct' | 'incorrect' | 'not_asked';
type Phase = 'intro' | 'active' | 'confirm' | 'skip' | 'finished';
const choices = [
  { value: 'correct', label: 'Correct' }, { value: 'incorrect', label: 'Wrong' }, { value: 'not_asked', label: 'Not asked' },
];
function isItemSet(value: unknown): value is ReadingComprehensionItemSet {
  if (!value || typeof value !== 'object') return false;
  const set = value as ReadingComprehensionItemSet;
  return [set.item_set_id, set.question_code, set.question_version, set.language, set.passage]
    .every(text => typeof text === 'string' && text.trim().length > 0) &&
    Array.isArray(set.questions) && set.questions.length > 0 && set.questions.every(q =>
      q && [q.item_key, q.prompt, q.answer_guide].every(text => typeof text === 'string' && text.trim().length > 0));
}
export function ReadingComprehensionQuestion(props: QuestionProps) {
  if (!isItemSet(props.itemSet)) return <MissingItemSet language={props.language} />;
  return <Content {...props} itemSet={props.itemSet} />;
}
function Content(props: QuestionProps & { itemSet: ReadingComprehensionItemSet }) {
  const { itemSet, onComplete } = props;
  const [phase, setPhase] = useState<Phase>('intro');
  const phaseRef = useRef<Phase>('intro');
  const [marks, setMarks] = useState<Record<number, Mark>>({});
  const marksRef = useRef(marks);
  const [showStory, setShowStory] = useState(false);
  const started = useRef<number | null>(null);
  const finished = useRef(false);
  const transition = (next: Phase) => { phaseRef.current = next; setPhase(next); };
  const unmarked = itemSet.questions.filter((_, i) => marks[i] === undefined).length;
  const resultItem = (position: number, response: Mark): ResultItem => ({
    position, item_key: itemSet.questions[position].item_key, prompt: itemSet.questions[position].prompt,
    response, is_correct: response === 'correct', metadata: { asked: response !== 'not_asked' },
  });
  const finish = (reason: StoppedReason) => {
    if (finished.current) return;
    finished.current = true;
    transition('finished');
    const items = reason.startsWith('skipped_') ? [] : itemSet.questions.map((_, i) => resultItem(i, marksRef.current[i] ?? 'not_asked'));
    const correct = items.filter(i => i.is_correct).length;
    const asked = items.filter(i => i.metadata?.asked).length;
    onComplete({
      question_code: itemSet.question_code, question_version: itemSet.question_version,
      item_set_id: itemSet.item_set_id, language: props.language,
      duration_ms: started.current === null ? 0 : Math.round(monotonicNow() - started.current),
      stopped_reason: reason, items,
      derived: { total_correct: correct, total_attempted: asked, percent: asked ? Math.round(correct / asked * 100) : 0,
        last_attempted_position: null, was_timed: false, tracks_progress: false, questions_asked: asked },
    });
  };
  if (phase === 'intro') return <QuestionIntro instructions={props.instructions} startLabel="Ask the questions" onStart={() => {
    if (phaseRef.current !== 'intro') return;
    started.current = monotonicNow();
    transition('active');
    props.onStart?.();
  }} />;
  if (phase === 'finished') return <View />;
  if (phase === 'skip') return <SkipReasonPicker onChoose={finish} onCancel={() => transition('active')} />;
  const confirming = phase === 'confirm';
  return <Canvas>
    <View style={{ flex: 1 }} pointerEvents={confirming ? 'none' : 'auto'} accessibilityElementsHidden={confirming}
      importantForAccessibility={confirming ? 'no-hide-descendants' : 'auto'}>
      <View style={{ padding: tokens.space.lg }}><SecondaryButton label="Show story" onPress={() => setShowStory(true)} /></View>
      <FullScreenSheet visible={showStory} onClose={() => setShowStory(false)}>
        <ScrollView contentContainerStyle={{ padding: tokens.space.lg }}><ContentText size="story">{itemSet.passage}</ContentText></ScrollView>
      </FullScreenSheet>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: tokens.space.lg, gap: tokens.space.md }}>
        {itemSet.questions.map((q, i) => <AssessmentChoiceCard key={i} testID={`comprehension-${i}`} prompt={q.prompt}
          guide={`Answer guide: ${q.answer_guide}`} choices={choices} selected={marks[i]} onSelect={value => {
            if (phaseRef.current !== 'active' || finished.current) return;
            marksRef.current = { ...marksRef.current, [i]: value as Mark };
            setMarks(marksRef.current);
            props.onItemMarked?.(resultItem(i, value as Mark));
          }} />)}
      </ScrollView>
      <ToggleBar primary={{ label: 'Finish', onPress: () => {
        if (phaseRef.current !== 'active') return;
        if (unmarked) transition('confirm'); else finish('completed');
      } }} onSkip={props.allowSkip === false ? undefined : () => transition('skip')} />
    </View>
    {confirming ? <ConfirmSheet testID="confirm-finish" title={unmarked === 1 ? '1 question not marked. Save it as Not asked?'
        : `${unmarked} questions not marked. Save them as Not asked?`}
      confirmLabel="Save as Not asked" onConfirm={() => finish('completed')} cancelLabel="Cancel" onCancel={() => transition('active')} /> : null}
  </Canvas>;
}
