import React, { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { CURRENT_ITEM_SETS, questionComponentFor } from '../../assessment-questions';
import TestFrame from '../../components/assessments/TestFrame';
import BottomSheet from '../../components/common/BottomSheet';
import BrandButton from '../../components/common/BrandButton';
import { colors, spacing } from '../../constants/colors';
import { typeRoles } from '../../constants/typography';
import { LANGUAGE_LABELS } from '../../utils/assessmentRegistry';
import { questionGalleryEntry, questionGalleryFixture } from '../../utils/questionGallery';

export default function QuestionGalleryRunScreen({ navigation, route }) {
  const { entryKey, languageCode: selectedLanguage, contentMode } = route.params;
  const entry = questionGalleryEntry(entryKey);
  const languageCode = entry?.fixedLanguage ?? selectedLanguage;
  const question = entry && questionComponentFor(entry.questionCode);
  const [run, setRun] = useState(0);
  const [result, setResult] = useState(null);
  const onComplete = useCallback(nextResult => setResult(nextResult), []);
  const close = () => navigation.goBack();
  const itemSet = entry?.itemSet ?? (contentMode === 'fixture' ? questionGalleryFixture(entry?.questionCode)
    : entry?.standalone ? CURRENT_ITEM_SETS[entry.questionCode]?.[languageCode] : undefined);
  const instructions = typeof entry?.instructions === 'string' ? entry.instructions : entry?.instructions?.[languageCode];
  const Question = question?.Component;
  return (
    <TestFrame title={entry?.title ?? 'Question unavailable'}
      subtitle={`Gallery child · ${LANGUAGE_LABELS[languageCode] ?? languageCode}`} onClose={close}>
      <View style={styles.question}>
        {Question ? <Question key={run} language={languageCode} itemSet={itemSet}
          durationSec={entry.durationSec} instructions={instructions} childName="Gallery child"
          {...question.extraProps} onComplete={onComplete} />
          : <Text style={styles.message}>This Question is unavailable.</Text>}
      </View>
      <BottomSheet visible={result !== null} title="Result" dismissLabel="Close result" onDismiss={close}
        footer={<View style={styles.actions}>
          <BrandButton label="Run again" onPress={() => { setResult(null); setRun(value => value + 1); }} />
          <BrandButton label="Done" variant="tertiary" tone="ink" onPress={close} />
        </View>}>
        {result && <View style={styles.actions}>
          <Text style={styles.message}>stopped_reason: {result.stopped_reason}</Text>
          <Text style={styles.score}>{result.derived.total_correct} / {result.derived.total_attempted}</Text>
          <Text style={styles.message}>duration_ms: {result.duration_ms}</Text>
        </View>}
      </BottomSheet>
    </TestFrame>
  );
}
const styles = StyleSheet.create({
  question: { flex: 1 },
  actions: { gap: spacing.sm },
  message: { ...typeRoles.textParagraph, color: colors.textSecondary },
  score: { ...typeRoles.displayHeading, color: colors.text },
});
