import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing } from '../../constants/colors';
import { typeRoles } from '../../constants/typography';
import { countMastered } from '../../utils/masteryState';
import LetterToggleTile from '../sessions/LetterToggleTile';
import WrapUpChildCard, { WrapUpTrackerRow } from './WrapUpChildCard';

export default function WrapUpChildRow({ child, letters, trackerLetters, authority, mastery, changes,
  readingLevel, onLetter, onOpenTracker, onOpenLevel }) {
  const assessmentMastered = mastery?.assessmentMastered ?? new Set();
  const taughtLetters = new Set(mastery?.taughtRecords.map(row => row.letter) ?? []);
  const count = trackerLetters ? countMastered({ assessmentMastered, taughtLetters,
    pendingChanges: changes, trackerLetters }) : 0;
  const name = child.first_name;
  const level = readingLevel || 'Not set';
  const rows = [
    authority.deliver && trackerLetters ? <WrapUpTrackerRow label="Letter tracker" value={`${count}/26`}
      accessibilityLabel={`${name}, letter tracker, ${count}/26`} onPress={onOpenTracker} /> : null,
    authority.level ? <WrapUpTrackerRow label="Reading level" value={level}
      accessibilityLabel={`${name}, reading level, ${level}`} onPress={onOpenLevel} /> : null,
  ];
  return <WrapUpChildCard testID={`wrap-up-child-${child.id}`} child={child} rows={rows}>
    {authority.deliver ? trackerLetters && letters.length > 0
      // No letters, no chip row: an empty row would still take the card's gap.
      ? <View testID="wrap-up-letter-chips" style={styles.chips}>{letters.map(letter => {
        const locked = assessmentMastered.has(letter);
        const added = changes[letter]?.mastered === true;
        const known = changes[letter]?.mastered ?? taughtLetters.has(letter);
        const description = locked ? 'mastered from assessment, locked'
          : added ? 'taught, added this session' : known ? 'taught by coach' : 'not mastered';
        return <LetterToggleTile key={letter} letter={letter} size={48}
          tone={locked ? 'locked' : added ? 'taughtNew' : known ? 'taught' : 'rest'}
          disabled={locked || !mastery} accessibilityLabel={`${letter}, ${description}`}
          accessibilityState={{ selected: locked || known }} onPress={() => onLetter(letter)} />;
      })}</View> : null
      : <Text style={styles.note}>Letters can't be updated for this child</Text>}
  </WrapUpChildCard>;
}
const styles = StyleSheet.create({
  note: { ...typeRoles.textNote, color: colors.textSecondary },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
