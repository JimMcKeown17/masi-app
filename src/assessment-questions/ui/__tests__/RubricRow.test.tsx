import React from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import { tokens } from '../../theme/tokens';
import { toneColor, UiText } from '../Text';
import { RubricPictureThumbnail, RubricRow, ScoreChip } from '../RubricRow';

test('a selected chip is ink, never red', () => {
  const onPress = jest.fn();
  const r = render(<ScoreChip score={3} selected accessibilityLabel="Spelling score 3, selected" onPress={onPress} testID="score" />);
  const chip = r.getByRole('button', { name: 'Spelling score 3, selected' });
  expect(chip).toHaveStyle({ width: 52, height: 52, borderRadius: tokens.radius.tile, backgroundColor: tokens.color.ink });
  expect(r.getByText('3')).toHaveStyle({ color: toneColor('onInk') });
  fireEvent.press(chip);
  expect(onPress).toHaveBeenCalledTimes(1);
  r.rerender(<ScoreChip score={3} selected={false} accessibilityLabel="Spelling score 3" onPress={onPress} testID="score" />);
  expect(r.getByTestId('score')).toHaveStyle({ backgroundColor: tokens.color.surface, borderWidth: 1, borderColor: tokens.color.line });
  expect(r.getByText('3')).toHaveStyle({ color: tokens.color.ink });
});

test('a rubric card labels its wrapping chips, gloss and ink rubric link with shared typography', () => {
  const onViewRubric = jest.fn();
  const r = render(
    <RubricRow label="Spelling" chipsTestID="chips" viewRubricTestID="rubric" onViewRubric={onViewRubric} gloss="none → strong">
      <ScoreChip score={1} selected={false} accessibilityLabel="Spelling score 1" onPress={jest.fn()} testID="score" />
    </RubricRow>,
  );
  expect(StyleSheet.flatten(r.UNSAFE_getAllByType(View)[0].props.style)).toMatchObject({ backgroundColor: tokens.color.surface, borderRadius: tokens.radius.card });
  expect(r.getByTestId('chips')).toHaveStyle({ flexDirection: 'row', flexWrap: 'wrap', gap: 8 });
  expect(r.UNSAFE_getAllByType(UiText).find(text => text.props.children === 'Spelling')?.props.variant).toBe('label');
  expect(r.getByText('View full rubric')).toHaveStyle({ color: tokens.color.ink });
  expect(r.getByText('none → strong')).toBeTruthy();
  fireEvent.press(r.getByTestId('rubric'));
  expect(onViewRubric).toHaveBeenCalledTimes(1);
});

test('the optional picture thumbnail preserves the image, alt fallback and enlarge callback', () => {
  const source = { uri: 'fixture-story.png' };
  const onPress = jest.fn();
  const r = render(<RubricPictureThumbnail source={source} alt="A story picture" onPress={onPress} />);
  expect(r.UNSAFE_getByType(Image).props).toMatchObject({ source, accessibilityLabel: 'A story picture' });
  expect(r.getByText('A story picture')).toBeTruthy();
  fireEvent.press(r.getByTestId('picture-thumbnail'));
  expect(onPress).toHaveBeenCalledTimes(1);
  r.rerender(<RubricPictureThumbnail source={null} alt="A story picture" onPress={onPress} />);
  expect(r.UNSAFE_queryByType(Image)).toBeNull();
  expect(r.getByRole('button', { name: 'A story picture' })).toBeTruthy();
});
