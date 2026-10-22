import React from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { fireEvent, render } from '@testing-library/react-native';
import { tokens } from '../../theme/tokens';
import { ConfirmSheet } from '../ConfirmSheet';
import { TextLink } from '../Button';

afterEach(() => jest.restoreAllMocks());

test('the testID is on the scrim overlay and the title is a header', () => {
  const r = render(<ConfirmSheet testID="end-confirmation" title="End the test?" confirmLabel="Yes, finish" onConfirm={jest.fn()} />);
  const overlay = r.getByTestId('end-confirmation');
  expect(overlay).toHaveStyle({ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, justifyContent: 'flex-end', backgroundColor: tokens.color.scrim });
  expect(overlay.props.accessibilityViewIsModal).toBe(true);
  expect(r.getByRole('header', { name: 'End the test?' })).toBeTruthy();
  expect(r.queryByRole('button', { name: 'Cancel' })).toBeNull();
});

test('panel order, inset, danger confirm, cancel and child actions are preserved', () => {
  jest.replaceProperty(Platform, 'OS', 'ios');
  const onConfirm = jest.fn(), onCancel = jest.fn(), onUndo = jest.fn();
  const r = render(<SafeAreaInsetsContext.Provider value={{ top: 0, left: 0, right: 0, bottom: 34 }}><ConfirmSheet testID="end" title="End the test?" confirmLabel="Yes, finish" onConfirm={onConfirm} cancelLabel="Cancel" onCancel={onCancel} confirmTone="danger"><TextLink label="Undo last mark" onPress={onUndo} /></ConfirmSheet></SafeAreaInsetsContext.Provider>);
  expect(r.getAllByRole('button').map(button => button.props.accessibilityLabel)).toEqual(['Yes, finish', 'Cancel', 'Undo last mark']);
  expect(r.getByRole('button', { name: 'Yes, finish' })).toHaveStyle({ backgroundColor: tokens.color.primary });
  let panel = r.getByRole('header').parent;
  while (panel && typeof panel.type !== 'string') panel = panel.parent;
  expect(panel).toHaveStyle({ borderTopLeftRadius: tokens.radius.card, borderTopRightRadius: tokens.radius.card, padding: tokens.space.xl, paddingBottom: 34 });
  fireEvent.press(r.getByText('Yes, finish'));
  fireEvent.press(r.getByText('Cancel'));
  fireEvent.press(r.getByText('Undo last mark'));
  expect(onConfirm).toHaveBeenCalledTimes(1);
  expect(onCancel).toHaveBeenCalledTimes(1);
  expect(onUndo).toHaveBeenCalledTimes(1);
});

test('default confirm is ink and cancelLabel alone safely renders a cancel button', () => {
  const r = render(<ConfirmSheet testID="sheet" title="Finish?" confirmLabel="Finish" onConfirm={jest.fn()} cancelLabel="Cancel" />);
  expect(r.getByRole('button', { name: 'Finish' })).toHaveStyle({ backgroundColor: tokens.color.ink });
  fireEvent.press(r.getByRole('button', { name: 'Cancel' }));
});


test.each([['android', 0, 24], ['ios', 0, 24], ['ios', 34, 34]] as const)(
  'confirmation panel on %s with inset %s keeps bottom padding %s', (os, inset, paddingBottom) => {
    jest.replaceProperty(Platform, 'OS', os);
    const r = render(
      <SafeAreaInsetsContext.Provider value={{ top: 0, bottom: inset, left: 0, right: 0 }}>
        <ConfirmSheet testID="confirmation" title="End the test?" confirmLabel="Yes, finish" onConfirm={jest.fn()} />
      </SafeAreaInsetsContext.Provider>,
    );
    const panel = r.UNSAFE_getAllByType(View).find((view: { props: { style?: StyleProp<ViewStyle> } }) => StyleSheet.flatten(view.props.style)?.borderTopLeftRadius === tokens.radius.card);
    expect(panel).toBeDefined();
    expect(StyleSheet.flatten(panel!.props.style)).toMatchObject({ padding: tokens.space.xl, paddingBottom });
  },
);
