import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import { colors, tints } from '../src/constants/colors';
import StepHeader from '../src/components/forms/StepHeader';
import CountChip from '../src/components/forms/CountChip';
import SelectableRow from '../src/components/forms/SelectableRow';

jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }), { virtual: true });
const flat = (node) => StyleSheet.flatten(node.props.style);

test.each([['todo', ''], ['done', ', complete'], ['error', ', needs attention']])('step header announces %s', (status, suffix) => {
  const ref = React.createRef();
  const onLayout = jest.fn();
  const ui = render(<StepHeader ref={ref} step={4} label="Session reading level" status={status} right="Optional" onLayout={onLayout} />);
  const header = ui.getByRole('header', { name: `Step 4: Session reading level${suffix}` });
  expect(ref.current).toBeTruthy();
  expect(ui.getByText('Optional')).toBeTruthy();
  expect(ui.getByText('Session reading level').props.numberOfLines).toBeUndefined();
  fireEvent(header, 'layout', { nativeEvent: { layout: { height: 32 } } });
  expect(onLayout).toHaveBeenCalledTimes(1);
});

test('step header accepts a right-hand node', () => {
  const ui = render(<StepHeader step={2} label="Select children" right={<Text>2 selected</Text>} />);
  expect(ui.getByText('2 selected')).toBeTruthy();
});

test.each([true, false])('count chip active=%s is decorative and token coloured', (active) => {
  const ui = render(<CountChip label="2 selected" active={active} />);
  expect(ui.getByText('2 selected')).toBeTruthy();
  expect(flat(ui.getByTestId('count-chip')).backgroundColor).toBe(active ? colors.text : colors.surface);
  expect(ui.getByTestId('count-chip').props.accessible).toBe(false);
});

test.each(['checkbox', 'radio'])('%s row announces selection and presses once', (variant) => {
  const onPress = jest.fn();
  const ui = render(<SelectableRow variant={variant} title="Amahle Dlamini" subtitle="Grade 1A" selected height={74} position="only" onPress={onPress} accessibilityLabel="Amahle Dlamini, Grade 1A" />);
  const row = ui.getByRole(variant, { name: 'Amahle Dlamini, Grade 1A' });
  expect(row.props.accessibilityState).toMatchObject({ checked: true });
  expect(ui.getByText('Amahle Dlamini').props.numberOfLines).toBe(1);
  fireEvent.press(row);
  expect(onPress).toHaveBeenCalledTimes(1);
});

test.each(['first', 'middle', 'last', 'only'])('%s edges stay inside the exact row height', (position) => {
  const ui = render(<SelectableRow variant="checkbox" title="Child" selected={false} height={74} position={position} />);
  const style = flat(ui.getByRole('checkbox'));
  expect(style).toMatchObject({ height: 74, borderLeftWidth: 1, borderRightWidth: 1, borderColor: tints.rule });
  expect(style.borderTopWidth).toBe(['first', 'only'].includes(position) ? 1 : 0);
  expect(style.borderBottomWidth).toBe(['last', 'only'].includes(position) ? 1 : 0);
  expect(ui.queryByTestId('row-divider') !== null).toBe(['first', 'middle'].includes(position));
});
