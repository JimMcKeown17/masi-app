import React from 'react';
import { View, StyleSheet } from 'react-native';
import LetterTile from './LetterTile';

export default function EgraLetterGrid({ letters, pageOffset, letterStates, onToggle, disabled, readOnly = false, currentIndex = -1, tileSize, tileWidth, tileHeight, gap }) {
  const effectiveWidth = tileWidth || tileSize;
  const effectiveHeight = tileHeight || tileSize;
  const baseFontSize = Math.max(14, Math.floor(tileSize * 0.35));
  const digraphFontSize = Math.max(12, Math.floor(tileSize * 0.28));
  const wordFontSize = Math.max(11, Math.floor(tileSize * 0.18));

  return (
    <View style={[styles.grid, { gap }]}>
      {letters.map((letter, i) => {
        const globalIndex = pageOffset + i;
        const fontSize = letter.length > 2 ? wordFontSize : letter.length === 2 ? digraphFontSize : baseFontSize;
        return (
          <LetterTile
            key={`${globalIndex}-${letter}`}
            index={globalIndex}
            letter={letter}
            state={letterStates[globalIndex]}
            isCurrent={globalIndex === currentIndex}
            onPress={readOnly ? undefined : onToggle}
            disabled={disabled}
            readOnly={readOnly}
            width={effectiveWidth}
            height={effectiveHeight}
            fontSize={fontSize}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
});
