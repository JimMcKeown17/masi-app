import React from 'react';
import { Animated, StyleSheet } from 'react-native';
import { placeConfetti } from './confettiPieces';

export default function ConfettiBurst({ width, layer, travel, fade }) {
  const opacity = fade.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });
  return (
    <Animated.View
      testID="confetti-layer"
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.layer, { width, opacity: layer }]}
    >
      {placeConfetti(width).map((piece, index) => (
        <Animated.View
          key={index}
          style={{
            position: 'absolute', left: piece.x - piece.w / 2, top: piece.y - piece.h / 2,
            width: piece.w, height: piece.h, borderRadius: piece.radius, backgroundColor: piece.color,
            opacity,
            transform: [
              { translateX: travel.interpolate({ inputRange: [0, 1], outputRange: [-36 * piece.ux, 0] }) },
              { translateY: travel.interpolate({ inputRange: [0, 1], outputRange: [-36 * piece.uy, 0] }) },
              { rotate: piece.rot + 'deg' },
            ],
          }}
        />
      ))}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  layer: { position: 'absolute', bottom: 108, left: 0, height: 0, overflow: 'visible' },
});
