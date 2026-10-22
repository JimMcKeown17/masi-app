import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing } from '../../constants/colors';
import { typeRoles } from '../../constants/typography';
import { countMastered } from '../../utils/masteryState';
import LetterToggleTile from '../sessions/LetterToggleTile';
import BrandButton from '../common/BrandButton';
import SelectField from '../common/SelectField';

export default function WrapUpChildRow({ child, letters, languageOrder, authority, mastery, changes,
  readingLevel, noOneNew, onLetter, onNoOneNew, onOpenTracker, onOpenLevel }) {
  const assessmentMastered = mastery?.assessmentMastered ?? new Set();
  const taughtLetters = new Set(mastery?.taughtRecords.map(row => row.letter) ?? []);
  const count = languageOrder ? countMastered({ assessmentMastered, taughtLetters,
    pendingChanges: changes, pedagogicalOrder: languageOrder }) : 0;
  return <View testID={`wrap-up-child-${child.id}`} style={styles.row}>
    <Text style={styles.name}>{child.first_name}</Text>
    {authority.deliver ? languageOrder ? <>
      <View testID="wrap-up-letter-chips" style={styles.chips}>{letters.map(letter => {
        const locked = assessmentMastered.has(letter);
        const added = changes[letter]?.mastered === true;
        const known = changes[letter]?.mastered ?? taughtLetters.has(letter);
        const description = locked ? 'mastered from assessment, locked'
          : added ? 'taught, added this session' : known ? 'taught by coach' : 'not mastered';
        return <LetterToggleTile key={letter} letter={letter} size={48}
          tone={locked ? 'locked' : added ? 'taughtNew' : known ? 'taught' : 'rest'}
          disabled={locked || !mastery} accessibilityLabel={`${letter}, ${description}`}
          accessibilityState={{ selected: locked || known }} onPress={() => onLetter(letter)} />;
      })}</View>
      {letters.length > 0 ? <BrandButton variant={noOneNew ? 'secondary' : 'tertiary'} label="No one new yet" onPress={onNoOneNew} /> : null}
      <BrandButton variant="tertiary" label={`${count}/26 ›`}
        accessibilityLabel={`${child.first_name}, letter tracker, ${count}/26`} onPress={onOpenTracker} />
    </> : null : <Text style={styles.note}>Letters can't be updated for this child</Text>}
    {authority.level ? <SelectField label="Reading level" value={readingLevel || 'Not set'}
      accessibilityLabel={`${child.first_name}, reading level, ${readingLevel || 'Not set'}`} onPress={onOpenLevel} /> : null}
  </View>;
}
const styles = StyleSheet.create({
  row: { gap: spacing.ms },
  name: { ...typeRoles.textRowTitle, color: colors.text },
  note: { ...typeRoles.textNote, color: colors.textSecondary },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
