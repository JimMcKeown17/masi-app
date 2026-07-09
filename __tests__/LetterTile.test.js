import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import LetterTile from '../src/components/assessment/LetterTile';

describe('LetterTile', () => {
  test('is a memoized component', () => {
    expect(LetterTile.$$typeof).toBe(Symbol.for('react.memo'));
  });

  test('renders an accessible label reflecting state and fires onPress with index', () => {
    const onPress = jest.fn();
    const { getByLabelText } = render(
      <LetterTile index={3} letter="a" state={undefined} isCurrent={false} onPress={onPress}
        disabled={false} readOnly={false} width={50} height={50} fontSize={18} />
    );
    fireEvent.press(getByLabelText('a, not marked'));
    expect(onPress).toHaveBeenCalledWith(3);
  });

  test('read-only tile does not fire onPress', () => {
    const onPress = jest.fn();
    const { getByLabelText } = render(
      <LetterTile index={1} letter="b" state={true} isCurrent={false} onPress={onPress}
        disabled={false} readOnly width={50} height={50} fontSize={18} />
    );
    fireEvent.press(getByLabelText('b, correct'));
    expect(onPress).not.toHaveBeenCalled();
  });
});
