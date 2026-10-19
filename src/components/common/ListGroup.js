import React from 'react';
import { StyleSheet, View } from 'react-native';
import { borderRadius, colors, tints } from '../../constants/colors';

export function listGroupItemFrame(index, count) {
  const first = index === 0;
  const last = index === count - 1;
  return {
    backgroundColor: colors.surface, borderColor: tints.rule, overflow: 'hidden',
    borderLeftWidth: 1, borderRightWidth: 1,
    borderTopWidth: first ? 1 : 0, borderBottomWidth: last ? 1 : 0,
    borderTopLeftRadius: first ? borderRadius.lg : 0,
    borderTopRightRadius: first ? borderRadius.lg : 0,
    borderBottomLeftRadius: last ? borderRadius.lg : 0,
    borderBottomRightRadius: last ? borderRadius.lg : 0,
  };
}

export function ListGroupDivider({ inset }) {
  return <View testID="list-group-divider" style={[styles.divider, { left: inset }]} />;
}

export default function ListGroup({ children, style }) {
  const rows = React.Children.toArray(children).filter(React.isValidElement);
  return <View style={[styles.group, style]}>
    {rows.map((child, index) => React.cloneElement(child, { showDivider: index < rows.length - 1 }))}
  </View>;
}
const styles = StyleSheet.create({
  divider: { height: 1, backgroundColor: colors.border, position: 'absolute', top: 0, right: 0 },
  group: { backgroundColor: colors.surface, borderWidth: 1, borderColor: tints.rule, borderRadius: borderRadius.lg, overflow: 'hidden' },
});
