import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, tints } from '../../constants/colors';
import ListRow from '../common/ListRow';

const SelectableRow = React.memo(function SelectableRow({ variant, title, subtitle, lead, selected, onPress, position, height, accessibilityLabel }) {
  const first = position === 'first' || position === 'only';
  const last = position === 'last' || position === 'only';
  const checkbox = variant === 'checkbox';
  return <View>
    <ListRow title={title} titleNumberOfLines={1} subtitle={subtitle} lead={lead} onPress={onPress}
      accessibilityLabel={accessibilityLabel} accessibilityRole={variant} accessibilityState={{ checked: selected }}
      style={[styles.row, { height }, first && styles.first, last && styles.last]}
      trailing={<View style={styles.slot}>
        <View style={[styles.circle, selected && styles.selected, selected && checkbox && styles.checked]}>
          {selected ? checkbox ? <Ionicons name="checkmark" size={18} color={colors.onDark} /> : <View style={styles.dot} /> : null}
        </View>
      </View>} />
    {!last ? <View testID="row-divider" pointerEvents="none" style={styles.divider} /> : null}
  </View>;
});
export default SelectableRow;
const styles = StyleSheet.create({
  row: { backgroundColor: colors.surface, borderColor: tints.rule, borderLeftWidth: 1, borderRightWidth: 1, borderTopWidth: 0, borderBottomWidth: 0 },
  first: { borderTopWidth: 1, borderTopLeftRadius: 18, borderTopRightRadius: 18 },
  last: { borderBottomWidth: 1, borderBottomLeftRadius: 18, borderBottomRightRadius: 18 },
  slot: { width: 44, height: 44, marginRight: -6, alignItems: 'center', justifyContent: 'center' },
  circle: { width: 32, height: 32, borderRadius: 16, borderWidth: 2, borderColor: colors.textSecondary, alignItems: 'center', justifyContent: 'center' },
  selected: { borderColor: colors.text },
  checked: { backgroundColor: colors.text },
  dot: { width: 18, height: 18, borderRadius: 9, backgroundColor: colors.text },
  divider: { position: 'absolute', left: 68, right: 0, bottom: 0, height: 1, backgroundColor: colors.border },
});
