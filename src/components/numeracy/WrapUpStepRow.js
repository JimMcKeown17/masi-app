import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, borderRadius } from '../../constants/colors';
import { masteryStateColors } from '../../constants/masteryStateColors';
import { typeRoles } from '../../constants/typography';
import { chipLabel } from '../../numeracyLesson/copy';
import { getCurriculum } from '../../../content/numeracy-curriculum';
import WrapUpChildCard, { WrapUpTrackerRow } from '../lessons/WrapUpChildCard';

export default function WrapUpStepRow({ child, steps, model, pending, isDelivery, onToggle, onOpenTracker }) {
  const tiles = model.sections.flatMap(section => section.rows.flatMap(row => row.tiles));
  const rows = isDelivery ? [<WrapUpTrackerRow label="Number tracker" value={`${model.knownCount} / ${model.total}`}
    accessibilityLabel={`${child.first_name}, number tracker, ${model.knownCount} of ${model.total} steps`} onPress={onOpenTracker} />] : [];
  return <WrapUpChildCard testID={`wrap-up-child-${child.id}`} child={child} rows={rows}>
    {isDelivery ? steps.length > 0 ? <View style={styles.chips}>{steps.map(stepKey => {
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
      })}</View> : null : <Text style={styles.label}>Steps can't be updated for this child</Text>}
  </WrapUpChildCard>;
}
const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { minHeight: 44, paddingHorizontal: spacing.md, borderWidth: 1, borderRadius: borderRadius.md, flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  label: { ...typeRoles.textBody, color: colors.text },
});
