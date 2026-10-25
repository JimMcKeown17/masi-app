import React, { useCallback, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { v4 as uuid } from 'uuid';
import { CURRENT_ITEM_SETS, LetterSoundsQuestion, ReadWordsQuestion } from '../../assessment-questions';
import { MissingItemSet } from '../../assessment-questions/progress/MissingItemSet';
import BottomSheet from '../../components/common/BottomSheet';
import BrandButton from '../../components/common/BrandButton';
import ConfirmSheet from '../../components/common/ConfirmSheet';
import TestFrame from '../../components/assessments/TestFrame';
import { colors } from '../../constants/colors';
import { typeRoles } from '../../constants/typography';
import { useAuth } from '../../context/AuthContext';
import { useOffline } from '../../context/OfflineContext';
import { useSignedInEA } from '../../context/SignedInEAContext';
import { useGuardedQuestionSave } from '../../hooks/useGuardedQuestionSave';
import { LANGUAGE_LABELS, STANDALONE_TESTS } from '../../utils/assessmentRegistry';

const COMPONENTS = { LetterSoundsQuestion, ReadWordsQuestion };

export default function StandaloneTestScreen({ navigation, route }) {
  const { testCode, child, languageCode } = route.params;
  const { repositories } = useSignedInEA();
  const { user } = useAuth();
  const { triggerBackgroundSync } = useOffline();
  const definition = STANDALONE_TESTS.find(test => test.code === testCode);
  const Question = definition && COMPONENTS[definition.component];
  const itemSet = CURRENT_ITEM_SETS[testCode]?.[languageCode];
  const assessmentId = useRef(null);
  if (assessmentId.current === null) assessmentId.current = uuid();

  const onSaved = useCallback(() => {
    navigation.replace('AssessmentResults', {
      assessmentId: assessmentId.current, testCode, child, languageCode,
    });
    triggerBackgroundSync();
  }, [navigation, testCode, child, languageCode, triggerBackgroundSync]);

  const persist = useCallback(async nextResult => {
    await repositories.assessments.saveQuestionResult({
      assessmentId: assessmentId.current, result: nextResult,
      childId: child.id, userId: user.id, captureMode: 'sequential',
    });
  }, [repositories, child.id, user.id]);
  const { onStart, onComplete, saveError, dismissSaveError, retry, leaveSheet } = useGuardedQuestionSave({
    navigation, persist, onSaved,
  });

  return (
    <TestFrame title={definition?.title}
      subtitle={`${[child.first_name, child.last_name].filter(Boolean).join(' ')} · ${LANGUAGE_LABELS[languageCode] ?? languageCode}`}
      onClose={() => navigation.goBack()}>
      <View style={styles.question}>
        {Question && itemSet ? (
          <Question
            itemSet={itemSet}
            durationSec={definition.durationSec}
            instructions={definition.instructions}
            language={languageCode}
            childName={[child.first_name, child.last_name].filter(Boolean).join(' ')}
            allowSkip={false}
            endNoun="test"
            captureMode="sequential"
            onStart={onStart}
            onComplete={onComplete}
          />
        ) : <MissingItemSet language={languageCode} />}
      </View>
      <BottomSheet
        visible={saveError && !leaveSheet.visible}
        title="Couldn't save — try again"
        dismissLabel="Dismiss save error"
        onDismiss={dismissSaveError}
        footer={<BrandButton label="Try again" size="lg" onPress={retry} />}
      >
        <Text style={styles.message}>Your result is still here. Try saving it again.</Text>
      </BottomSheet>
      <ConfirmSheet
        visible={leaveSheet.visible}
        title={leaveSheet.hasResult ? "This result isn't saved yet." : 'End the test?'}
        body={leaveSheet.hasResult ? 'Discard this result and leave the test?' : 'Leave without saving a result?'}
        confirmLabel="Discard"
        cancelLabel={leaveSheet.hasResult ? 'Keep result' : 'Keep testing'}
        onConfirm={leaveSheet.onConfirm}
        onCancel={leaveSheet.onCancel}
      />
    </TestFrame>
  );
}

const styles = StyleSheet.create({
  question: { flex: 1 },
  message: { ...typeRoles.textParagraph, color: colors.textSecondary },
});
