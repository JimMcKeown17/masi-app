import React from 'react';
import { View } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import { Canvas } from '..';
import { tokens } from '../../theme/tokens';

test('Canvas provides the full-height canvas surface and renders its children', () => {
  const r = render(<Canvas testID="canvas"><View testID="child" /></Canvas>);
  expect(r.getByTestId('canvas')).toHaveStyle({ flex: 1, backgroundColor: tokens.color.canvas });
  expect(r.getByTestId('child')).toBeTruthy();
});

test('Canvas forwards View props and appends caller styles after its defaults', () => {
  const onLayout = jest.fn();
  const r = render(<Canvas testID="canvas" pointerEvents="none" accessibilityElementsHidden
    importantForAccessibility="no-hide-descendants" accessibilityLabel="covered capture" onLayout={onLayout}
    style={[{ flex: 2 }, { backgroundColor: tokens.color.surface, padding: 12 }]} />);
  const canvas = r.getByTestId('canvas', { includeHiddenElements: true });
  expect(canvas.props).toMatchObject({
    pointerEvents: 'none', accessibilityElementsHidden: true,
    importantForAccessibility: 'no-hide-descendants', accessibilityLabel: 'covered capture',
  });
  expect(canvas).toHaveStyle({ flex: 2, backgroundColor: tokens.color.surface, padding: 12 });
  fireEvent(canvas, 'layout', { nativeEvent: { layout: { width: 360, height: 300 } } });
  expect(onLayout).toHaveBeenCalledTimes(1);
});
