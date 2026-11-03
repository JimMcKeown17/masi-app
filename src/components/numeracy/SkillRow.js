import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { borderRadius, colors, spacing } from '../../constants/colors';
import { typeRoles } from '../../constants/typography';
import { TRACKER_COLUMNS } from '../../numeracyLesson/trackerModel';
import { stepPhrase } from '../../numeracyLesson/copy';
import StepTile from './StepTile';

export const TILE_SIZE = 44;
export const TILE_GAP = 6;

function SkillRow({ row, onPressTile, onPressSkill, readOnly, curriculum }) {
  return <View style={styles.row}>
    <View style={styles.heading}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${row.label}, steps`} onPress={() => onPressSkill?.(row)} style={styles.skill}>
        <Text style={styles.title}>{row.label}</Text><Text accessible={false} style={styles.info}>ⓘ</Text>
      </Pressable>
      <Text style={styles.hint}>{row.hint}</Text>
    </View>
    <View style={styles.strip}>
      {TRACKER_COLUMNS.map((column, index) => <View key={column} style={styles.cell}>
        {row.tiles.filter(tile => tile.column === index).map(tile => <StepTile key={tile.stepKey} tile={tile}
          label={stepPhrase(curriculum, tile.stepKey)} size={TILE_SIZE} disabled={readOnly}
          onPress={() => onPressTile?.(tile.stepKey)} />)}
      </View>)}
    </View>
  </View>;
}
const styles = StyleSheet.create({
  row: { backgroundColor: colors.surface, borderRadius: borderRadius.md, paddingVertical: spacing.sm, marginBottom: spacing.sm },
  heading: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap', marginBottom: spacing.xs },
  skill: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  title: { ...typeRoles.textRowTitle, color: colors.text },
  info: { ...typeRoles.textBody, color: colors.textSecondary },
  hint: { ...typeRoles.textCaption, color: colors.textSecondary },
  strip: { flexDirection: 'row', gap: TILE_GAP },
  cell: { width: TILE_SIZE, gap: TILE_GAP },
});

// The model is rebuilt for each tap; compare the primitive fields this row renders.
export default React.memo(SkillRow, (a, b) =>
  a.curriculum === b.curriculum && a.readOnly === b.readOnly &&
  a.onPressTile === b.onPressTile && a.onPressSkill === b.onPressSkill &&
  a.row.skillKey === b.row.skillKey && a.row.label === b.row.label && a.row.hint === b.row.hint &&
  a.row.tiles.length === b.row.tiles.length && a.row.tiles.every((tile, i) => {
    const other = b.row.tiles[i];
    return tile.stepKey === other.stepKey && tile.column === other.column &&
      tile.sizeLabel === other.sizeLabel && tile.state === other.state && tile.next === other.next;
  }));
