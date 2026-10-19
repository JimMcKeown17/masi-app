import React from 'react';
import { StyleSheet, View } from 'react-native';
import { borderRadius, colors, tints } from '../../constants/colors';

export default function ListGroup({ children, style }) {
  const rows = React.Children.toArray(children).filter(React.isValidElement);
  return <View style={[styles.group, style]}>
    {rows.map((child, index) => React.cloneElement(child, { showDivider: index < rows.length - 1 }))}
  </View>;
}
const styles = StyleSheet.create({
  group: { backgroundColor: colors.surface, borderWidth: 1, borderColor: tints.rule, borderRadius: borderRadius.lg, overflow: 'hidden' },
});
