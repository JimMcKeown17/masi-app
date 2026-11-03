import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, borderRadius } from '../../constants/colors';
import { masteryStateColors } from '../../constants/masteryStateColors';
import { typeRoles } from '../../constants/typography';
import { chipLabel } from '../../numeracyLesson/copy';
import { getCurriculum } from '../../../content/numeracy-curriculum';

export default function WrapUpStepRow({ child, steps, model, pending, isDelivery, onToggle, onOpenTracker }) {
  const tiles = model.sections.flatMap(section => section.rows.flatMap(row => row.tiles));
  return <View testID={`wrap-up-child-${child.id}`} style={styles.row}>
    <Text style={styles.name}>{child.first_name}</Text>
    {isDelivery ? <>
      <View style={styles.chips}>{steps.map(stepKey => {
        const tile = tiles.find(item => item.stepKey === stepKey);
        const known = ['ticked', 'implied', 'assessment'].includes(tile?.state);
        const locked = tile?.state === 'assessment';
        const fixed = locked || (known && !pending[stepKey]);
        const ticked = pending[stepKey] ? pending[stepKey].mastered : known;
        const palette = locked ? masteryStateColors.assessment : ticked ? masteryStateColors.taught : masteryStateColors.default;
        const label = chipLabel(getCurriculum(), stepKey);
        const state = locked ? 'Assessment' : ticked ? 'Ticked' : 'Not yet';
        return <Pressable key={stepKey} accessibilityRole="button" accessibilityLabel={`${label}, ${state}`}
          accessibilityState={{ disabled: fixed }} disabled={fixed} onPress={() => onToggle(stepKey, known)}
          style={[styles.chip, { backgroundColor: palette.bg, borderColor: palette.border }]}>
          <Text style={[styles.label, { color: palette.text }]}>{label}</Text>
          {locked ? <Ionicons name="lock-closed-outline" size={14} color={palette.text} accessible={false} /> : null}
        </Pressable>;
      })}</View>
      <Pressable accessibilityRole="button" accessibilityLabel={`${child.first_name}, ${model.knownCount} of ${model.total} steps`} onPress={onOpenTracker} style={styles.count}>
        <Text style={styles.label}>{`${model.knownCount} / ${model.total} ›`}</Text>
      </Pressable>
    </> : <Text style={styles.label}>Steps can't be updated for this child</Text>}
  </View>;
}
const styles = StyleSheet.create({
  row: { gap: spacing.sm }, name: { ...typeRoles.textBodyStrong, color: colors.text },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { minHeight: 44, paddingHorizontal: spacing.md, borderWidth: 1, borderRadius: borderRadius.md, flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  count: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  label: { ...typeRoles.textBody, color: colors.text },
});
