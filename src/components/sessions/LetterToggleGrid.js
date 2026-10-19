import React, { useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import LetterToggleTile from './LetterToggleTile';

export const letterTileSize = (contentWidth) => Math.min(56, Math.floor((contentWidth - 5 * 8) / 6));

export default function LetterToggleGrid({ letters, tileFor, onPressLetter }) {
  const { width: windowWidth } = useWindowDimensions();
  const [width, setWidth] = useState(null);
  const size = letterTileSize(width ?? windowWidth - 48);
  return <View testID="letter-toggle-grid" style={styles.grid} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
    {letters.map((letter) => <LetterToggleTile key={letter} letter={letter} size={size}
      {...tileFor(letter)} onPress={() => onPressLetter(letter)} />)}
  </View>;
}
const styles = StyleSheet.create({
  // Preserve six columns even when the available width exceeds six capped tiles.
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, maxWidth: 6 * 56 + 5 * 8 },
});
