import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing } from '../../constants/colors';
import { typeRoles } from '../../constants/typography';
import ToggleChip from '../common/ToggleChip';
import BrandButton from '../common/BrandButton';

export default React.memo(function AttendanceChips({ children, attendance, authority, onToggle, onRemove }) {
  return <View>
    <Text accessibilityRole="header" style={styles.heading}>Who's here</Text>
    <View testID="lesson-attendance-chips" style={styles.chips}>
      {children.map(child => {
        const absent = attendance.absentChildIds.includes(child.id);
        const refused = authority[child.id]?.attend === false;
        return <View key={child.id} style={styles.child}>
          <ToggleChip label={`${child.first_name}, ${absent ? 'absent' : 'here'}`}
            selected={!absent} onPress={() => { if (!refused) onToggle(child.id); }} />
          {refused ? <>
            <Text style={styles.note}>No longer one of your children</Text>
            <BrandButton label="Remove from lesson" variant="tertiary" size="sm"
              disabled={absent} onPress={() => onRemove(child.id)} />
          </> : null}
        </View>;
      })}
    </View>
  </View>;
});
const styles = StyleSheet.create({
  heading: { ...typeRoles.displayHeading, color: colors.text, marginBottom: spacing.ms },
  chips: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', gap: spacing.sm },
  child: { maxWidth: '100%', flexShrink: 1, gap: spacing.xs },
  note: { ...typeRoles.textNote, color: colors.textSecondary },
});
