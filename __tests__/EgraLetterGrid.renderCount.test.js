import React, { useCallback, useState } from 'react';
import { render, fireEvent } from '@testing-library/react-native';

jest.mock('../src/components/assessment/LetterTile', () => {
  const ReactLib = require('react');
  const { Pressable } = require('react-native');
  const renderSpy = jest.fn();
  const Tile = ReactLib.memo(function MockTile({ index, letter, state, onPress }) {
    renderSpy(index);
    const label = `${letter}, ${state === true ? 'correct' : state === false ? 'incorrect' : 'not marked'}`;
    return ReactLib.createElement(Pressable, {
      accessibilityLabel: label,
      onPress: () => { if (onPress) onPress(index); },
    });
  });
  return { __esModule: true, default: Tile, renderSpy };
});

import EgraLetterGrid from '../src/components/assessment/EgraLetterGrid';
import { renderSpy } from '../src/components/assessment/LetterTile';

function Harness() {
  const [letterStates, setLetterStates] = useState({});
  const onToggle = useCallback((i) => setLetterStates((prev) => ({ ...prev, [i]: true })), []);
  return (
    <EgraLetterGrid
      letters={['a', 'b', 'c', 'd', 'e']} pageOffset={0} letterStates={letterStates}
      onToggle={onToggle} disabled={false} tileSize={50} gap={8}
    />
  );
}

describe('EgraLetterGrid render isolation', () => {
  beforeEach(() => renderSpy.mockClear());

  test('mount renders every tile once', () => {
    render(<Harness />);
    expect(renderSpy).toHaveBeenCalledTimes(5);
  });

  test('tapping one tile re-renders only that tile', () => {
    const { getByLabelText } = render(<Harness />);
    renderSpy.mockClear();
    fireEvent.press(getByLabelText('c, not marked'));
    expect(renderSpy).toHaveBeenCalledTimes(1);
    expect(renderSpy).toHaveBeenCalledWith(2);
  });
});
