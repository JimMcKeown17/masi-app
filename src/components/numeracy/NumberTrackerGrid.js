import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing } from '../../constants/colors';
import { masteryStateColors } from '../../constants/masteryStateColors';
import { typeRoles } from '../../constants/typography';
import SectionHeader from '../common/SectionHeader';
import SkillRow from './SkillRow';

export default function NumberTrackerGrid({ model, onPressTile, onPressSkill, readOnly, curriculum }) {
  return <View>
    <View style={styles.legend}>
      {[['Ticked', 'taught'], ['Assessment', 'assessment'], ['Not yet', 'default']].map(([label, tone]) => <View key={tone} style={styles.legendItem}>
        <View style={[styles.swatch, { backgroundColor: masteryStateColors[tone].bg, borderColor: masteryStateColors[tone].border }]} />
        <Text style={styles.label}>{label}</Text>
      </View>)}
    </View>
    {model.sections.map(section => <View key={section.key}>
      {section.title ? <SectionHeader title={section.title} /> : null}
      {section.rows.map(row => <SkillRow key={row.skillKey} row={row} curriculum={curriculum}
        onPressTile={onPressTile} onPressSkill={onPressSkill} readOnly={readOnly} />)}
    </View>)}
  </View>;
}
const styles = StyleSheet.create({
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  swatch: { width: 12, height: 12, borderWidth: 1, borderRadius: 3 },
  label: { ...typeRoles.textCaption, color: colors.textSecondary },
});
