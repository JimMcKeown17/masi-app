import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { borderRadius, colors } from '../../constants/colors';
import { typeRoles } from '../../constants/typography';

export default function LetterReceiptTile({ letter }) {
  return (
    <View style={styles.tile} accessible={false} importantForAccessibility="no">
      <Text style={styles.letter} accessible={false} importantForAccessibility="no" maxFontSizeMultiplier={1.2}>{letter}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    width: 36, height: 36, flexShrink: 0, borderRadius: borderRadius.sm,
    backgroundColor: colors.red50, borderWidth: 1.5, borderColor: colors.red100,
    alignItems: 'center', justifyContent: 'center',
  },
  letter: { ...typeRoles.textRowTitle, color: colors.red700 },
});
