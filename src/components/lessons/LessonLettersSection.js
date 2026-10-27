import React, { useCallback } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing } from '../../constants/colors';
import { typeRoles } from '../../constants/typography';
import { UPDATE_APP_LETTERS_MESSAGE } from '../../utils/letterOrders';
import { joinDetail } from '../../utils/lessonDates';
import BrandButton from '../common/BrandButton';
import LetterToggleTile from '../sessions/LetterToggleTile';
import LetterToggleGrid from '../sessions/LetterToggleGrid';

export default React.memo(function LessonLettersSection({ draft, plan, choices, onToggle, onOther, needsAppUpdate }) {
  const selected = draft.ticks.letters;
  const tileFor = useCallback(letter => ({
    tone: selected.includes(letter) ? 'selected' : 'rest',
    accessibilityLabel: `${letter.toUpperCase()}, ${selected.includes(letter) ? 'selected' : 'not selected'}`,
    accessibilityState: { selected: selected.includes(letter) },
  }), [selected]);
  const letters = [...new Set([...plan.suggested_letters, ...selected])];
  const noPack = plan.reason === 'no_pack';
  return <View style={styles.section}>
    <Text accessibilityRole="header" style={styles.heading}>{joinDetail(['1', 'Letters', '15 min'])}</Text>
    {needsAppUpdate ? <Text style={styles.body}>{UPDATE_APP_LETTERS_MESSAGE}</Text> : draft.language_code === 'zu' ? <Text style={styles.body}>No isiZulu letters yet.</Text> : <>
      {plan.reason === 'first_session' ? <Text style={styles.body}>First lesson: start with these letters.</Text> : null}
      {plan.reason === 'all_letters_known' ? <Text style={styles.body}>All letters known</Text> : null}
      {plan.reason === 'no_children' ? <Text style={styles.body}>Mark at least one child as here.</Text> : null}
      {noPack ? <>
        <Text style={styles.body}>Choose the letters you teach</Text>
        <LetterToggleGrid letters={choices.letterChoices} tileFor={tileFor} onPressLetter={onToggle} />
      </> : <View style={styles.letters}>
        {letters.map(letter => <LetterToggleTile key={letter} letter={letter} size={56}
          {...tileFor(letter)} onPress={() => onToggle(letter)} />)}
        <BrandButton label="+" variant="secondary" size="md" onPress={onOther} />
      </View>}
      {plan.review_letters.length ? <Text style={styles.body}>Review: {plan.review_letters.join(' ')}</Text> : null}
    </>}
  </View>;
});
const styles = StyleSheet.create({
  section: { gap: spacing.ms },
  heading: { ...typeRoles.displayHeading, color: colors.text },
  body: { ...typeRoles.textBody, color: colors.textSecondary },
  letters: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
});
