import React from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { BottomBar } from '../BottomBar';
import { UiText } from '../Text';
import { fireEvent, render, within } from '@testing-library/react-native';
import { tokens } from '../../theme/tokens';
import { DecisionBar, ToggleBar } from '../ActionBar';

const props = () => ({ testIDPrefix: 'letter', onCorrect: jest.fn(), onIncorrect: jest.fn(), onBack: jest.fn(), backDisabled: false, onEnd: jest.fn() });

test('decision layout: Correct/Incorrect side by side, Back full width below, End centred last', () => {
  const callbacks = props();
  const r = render(<DecisionBar {...callbacks} />);
  const decisions = r.getByTestId('letter-decisions');
  const navigation = r.getByTestId('letter-navigation');
  expect(decisions).toHaveStyle({ flexDirection: 'row', gap: 12 });
  expect(within(decisions).getByRole('button', { name: 'Correct' })).toHaveStyle({ flex: 1, backgroundColor: tokens.color.marked });
  expect(within(decisions).getByRole('button', { name: 'Incorrect' })).toHaveStyle({ flex: 1, backgroundColor: tokens.color.error });
  expect(within(decisions).queryByRole('button', { name: 'Back' })).toBeNull();
  expect(navigation).toHaveStyle({ justifyContent: 'center' });
  expect(within(navigation).getByRole('button', { name: 'End test' })).toBe(r.getByTestId('letter-end'));
  expect(r.getAllByRole('button').map(button => button.props.accessibilityLabel)).toEqual(['Correct', 'Incorrect', 'Back', 'End test']);
  for (const [label, callback] of [['Correct', callbacks.onCorrect], ['Incorrect', callbacks.onIncorrect], ['Back', callbacks.onBack], ['End test', callbacks.onEnd]] as const) {
    fireEvent.press(r.getByRole('button', { name: label }));
    expect(callback).toHaveBeenCalledTimes(1);
  }
});

test('Skip question appears only when onSkip is given, End copy is configurable, Back can be disabled', () => {
  const callbacks = props();
  const onSkip = jest.fn();
  const r = render(<DecisionBar {...callbacks} />);
  expect(r.queryByText('Skip question')).toBeNull();
  r.rerender(<DecisionBar {...callbacks} backDisabled onSkip={onSkip} endLabel="End" />);
  expect(r.getByRole('button', { name: 'Back' })).toBeDisabled();
  fireEvent.press(r.getByText('Back'));
  expect(callbacks.onBack).not.toHaveBeenCalled();
  expect(within(r.getByTestId('letter-navigation')).getByText('Skip question')).toBeTruthy();
  fireEvent.press(r.getByText('Skip question'));
  expect(onSkip).toHaveBeenCalledTimes(1);
  expect(r.getByTestId('letter-end')).toHaveAccessibleName('End');
});

test('ToggleBar has one full-width ink primary followed by an optional centred Skip question', () => {
  const onPress = jest.fn(), onSkip = jest.fn();
  const r = render(<ToggleBar primary={{ label: 'Finish', onPress }} />);
  expect(r.getByRole('button', { name: 'Finish' })).toHaveStyle({ backgroundColor: tokens.color.ink });
  expect(r.queryByText('Skip question')).toBeNull();
  fireEvent.press(r.getByText('Finish'));
  expect(onPress).toHaveBeenCalledTimes(1);
  r.rerender(<ToggleBar primary={{ label: 'Finish', onPress }} onSkip={onSkip} />);
  expect(r.getAllByRole('button').map(button => button.props.accessibilityLabel)).toEqual(['Finish', 'Skip question']);
  let navigation = r.getByRole('button', { name: 'Skip question' }).parent;
  while (navigation && typeof navigation.type !== 'string') navigation = navigation.parent;
  expect(navigation).toHaveStyle({ justifyContent: 'center' });
  fireEvent.press(r.getByText('Skip question'));
  expect(onSkip).toHaveBeenCalledTimes(1);
});


afterEach(() => jest.restoreAllMocks());

test('decision navigation is a centred wrapping row with Skip before End', () => {
  const r = render(<DecisionBar {...props()} onSkip={jest.fn()} />);
  const navigation = r.getByTestId('letter-navigation');
  expect(navigation).toHaveStyle({ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', columnGap: tokens.space.xl, rowGap: tokens.space.xs });
  expect(within(navigation).getAllByRole('button').map(button => button.props.accessibilityLabel)).toEqual(['Skip question', 'End test']);
});

test.each(['decision', 'toggle'] as const)('%s composition owns exactly one action panel and bottom inset', layout => {
  jest.replaceProperty(Platform, 'OS', 'ios');
  const r = render(
    <SafeAreaInsetsContext.Provider value={{ top: 47, bottom: 34, left: 0, right: 0 }}>
      {layout === 'decision' ? <DecisionBar {...props()} /> : <ToggleBar header={<UiText>Total: 3 / 4</UiText>} primary={{ label: 'Finish', onPress: jest.fn() }} onSkip={jest.fn()} />}
    </SafeAreaInsetsContext.Provider>,
  );
  expect(r.UNSAFE_getAllByType(BottomBar)).toHaveLength(1);
  const styles = r.UNSAFE_getAllByType(View).map((view: { props: { style?: StyleProp<ViewStyle> } }) => StyleSheet.flatten(view.props.style));
  const panels = styles.filter((style: ViewStyle | undefined) => style?.borderTopWidth === 1);
  expect(panels).toHaveLength(1);
  expect(panels[0]).toMatchObject({ borderTopColor: tokens.color.line, paddingHorizontal: 16, paddingBottom: 34 });
  expect(styles.reduce((sum: number, style: ViewStyle | undefined) => sum + (typeof style?.paddingBottom === 'number' ? style.paddingBottom : 0), 0)).toBe(34);
  if (layout === 'toggle') {
    const panel = r.UNSAFE_getByType(BottomBar);
    expect(panel.findAllByType(UiText).map((text: { props: { children?: React.ReactNode } }) => text.props.children)).toEqual(['Total: 3 / 4', 'Finish', 'Skip question']);
  }
});


test('review has Finish, Back and optional Skip, with no decisions or End link', () => {
  const callbacks = props(), onFinish = jest.fn(), onSkip = jest.fn();
  const r = render(<DecisionBar {...callbacks} mode="review" onFinish={onFinish} onSkip={onSkip} />);
  expect(r.getAllByRole('button').map(button => button.props.accessibilityLabel)).toEqual(['Finish', 'Back', 'Skip question']);
  expect(r.getByTestId('letter-finish')).toHaveStyle({ backgroundColor: tokens.color.ink });
  expect(r.queryByTestId('letter-decisions')).toBeNull();
  expect(r.queryByTestId('letter-end')).toBeNull();
  fireEvent.press(r.getByText('Finish'));
  fireEvent.press(r.getByText('Back'));
  fireEvent.press(r.getByText('Skip question'));
  expect(onFinish).toHaveBeenCalledTimes(1);
  expect(callbacks.onBack).toHaveBeenCalledTimes(1);
  expect(onSkip).toHaveBeenCalledTimes(1);
  expect(callbacks.onEnd).not.toHaveBeenCalled();
  r.rerender(<DecisionBar {...callbacks} mode="review" onFinish={onFinish} />);
  expect(r.queryByText('Skip question')).toBeNull();
});

const choices = [
  { key: 'count_all', label: 'Counted from 1' },
  { key: 'count_on', label: 'Started from the first number' },
  { key: 'known', label: 'Just knew' },
];

test.each(['deciding', 'review'] as const)('default buttons are unchanged (%s)', mode => {
  const r = render(<DecisionBar {...props()} mode={mode} onSkip={jest.fn()} onFinish={jest.fn()} />);
  expect(r.toJSON()).toMatchSnapshot();
});

test('choices replace Correct with one marked button per choice, then Incorrect', () => {
  const callbacks = props(), onChoose = jest.fn();
  const r = render(<DecisionBar {...callbacks} correctChoices={choices} onChoose={onChoose} />);
  const decisions = r.getByTestId('letter-decisions');
  expect(decisions).toHaveStyle({ flexDirection: 'column', gap: tokens.space.md });
  expect(within(decisions).getAllByRole('button').map(b => b.props.accessibilityLabel)).toEqual([
    ...choices.map(c => c.label), 'Incorrect',
  ]);
  expect(r.queryByText('Correct')).toBeNull();
  for (const choice of choices) {
    const button = r.getByTestId(`letter-choice-${choice.key}`);
    expect(button).toHaveAccessibleName(choice.label);
    expect(button).toHaveStyle({ backgroundColor: tokens.color.marked, minHeight: 52 });
    fireEvent.press(button);
    expect(onChoose).toHaveBeenLastCalledWith(choice.key);
  }
  expect(onChoose).toHaveBeenCalledTimes(3);
  expect(callbacks.onCorrect).not.toHaveBeenCalled();
  fireEvent.press(r.getByText('Incorrect'));
  expect(callbacks.onIncorrect).toHaveBeenCalledTimes(1);
});

test('two choices keep the decision row horizontal', () => {
  const r = render(<DecisionBar {...props()} correctChoices={choices.slice(0, 2)} onChoose={jest.fn()} />);
  expect(r.getByTestId('letter-decisions')).toHaveStyle({ flexDirection: 'row' });
});

test.each(['deciding', 'review'] as const)('correcting shows the title, muted current mark and Cancel, and hides Back, End and Skip (%s)', mode => {
  const onCancel = jest.fn();
  const r = render(<DecisionBar {...props()} mode={mode} onSkip={jest.fn()} correctChoices={choices}
    onChoose={jest.fn()} correcting={{ title: 'Change item 2', detail: '4 + 3 · Marked: Incorrect', onCancel }} />);
  expect(r.getByRole('header', { name: 'Change item 2' })).toBeTruthy();
  expect(r.getByText('4 + 3 · Marked: Incorrect')).toHaveStyle({ color: tokens.color.muted });
  expect(r.getAllByRole('button').map(b => b.props.accessibilityLabel)).toEqual([
    ...choices.map(c => c.label), 'Incorrect', 'Cancel',
  ]);
  expect(r.queryByText('Back')).toBeNull();
  expect(r.queryByText('Finish')).toBeNull();
  expect(r.queryByTestId('letter-navigation')).toBeNull();
  fireEvent.press(r.getByRole('button', { name: 'Cancel' }));
  expect(onCancel).toHaveBeenCalledTimes(1);
});
