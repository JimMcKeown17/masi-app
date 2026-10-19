import React from 'react';
import { StyleSheet, View } from 'react-native';
import Avatar from '../common/Avatar';

export default function AvatarStack({ initials }) {
  if (initials.length === 0) return null;
  return (
    <View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.stack}>
      {initials.slice(0, 3).map((label, index) => (
        <Avatar key={index} label={label} size={28} ring style={index > 0 ? styles.overlap : undefined} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { flexDirection: 'row', alignItems: 'center' },
  overlap: { marginLeft: -6 },
});
