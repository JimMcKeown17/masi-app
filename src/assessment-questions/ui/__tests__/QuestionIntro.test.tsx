import React from 'react';
import { ScrollView } from 'react-native';
import { fireEvent, render, within } from '@testing-library/react-native';
import { tokens } from '../../theme/tokens';
import { QuestionIntro } from '../QuestionIntro';
import { UiText } from '../Text';

test('long instructions and children share one scroller and Start stays outside it', () => {
  const instructions = 'Read these instructions. '.repeat(100);
  const onStart = jest.fn();
  const r = render(<QuestionIntro testID="intro" instructions={instructions} onStart={onStart}><UiText>Story content</UiText></QuestionIntro>);
  expect(r.getByTestId('intro')).toHaveStyle({ flex: 1, backgroundColor: tokens.color.canvas });
  expect(r.UNSAFE_getAllByType(ScrollView)).toHaveLength(1);
  const scroll = r.getByTestId('intro-scroll');
  expect(scroll).toHaveStyle({ flex: 1 });
  expect(within(scroll).getByText(instructions)).toBeTruthy();
  expect(within(scroll).getByText('Story content')).toBeTruthy();
  expect(within(scroll).queryByRole('button', { name: 'Start' })).toBeNull();
  let card = r.getByText(instructions).parent;
  while (card && typeof card.type !== 'string') card = card.parent;
  expect(card).toHaveStyle({ backgroundColor: tokens.color.surface, borderRadius: tokens.radius.card, padding: tokens.space.lg });
  fireEvent.press(r.getByRole('button', { name: 'Start' }));
  expect(onStart).toHaveBeenCalledTimes(1);
});

test('optional instructions and children may be omitted and startLabel overrides Start', () => {
  const onStart = jest.fn();
  const r = render(<QuestionIntro startLabel="I've finished reading" onStart={onStart} />);
  expect(r.queryByText('Start')).toBeNull();
  fireEvent.press(r.getByRole('button', { name: "I've finished reading" }));
  expect(onStart).toHaveBeenCalledTimes(1);
});
