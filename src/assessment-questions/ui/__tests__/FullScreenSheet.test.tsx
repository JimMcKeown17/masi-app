import React from 'react';
import { Modal, Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { tokens } from '../../theme/tokens';
import { fireEvent, render } from '@testing-library/react-native';
import { FullScreenSheet } from '../FullScreenSheet';
import { UiText } from '../Text';

test('hidden sheet renders nothing; visible sheet shows a single Close', () => {
  const onClose = jest.fn();
  const content = (visible: boolean) => <FullScreenSheet visible={visible} title="Story" onClose={onClose}><UiText>Once upon a time</UiText></FullScreenSheet>;
  const r = render(content(false));
  expect(r.toJSON()).toBeNull();
  r.rerender(content(true));
  expect(r.getByRole('header', { name: 'Story' })).toBeTruthy();
  expect(r.getByText('Once upon a time')).toBeTruthy();
  expect(r.getAllByRole('button', { name: 'Close' })).toHaveLength(1);
  expect(r.UNSAFE_getByType(Modal).props.animationType).toBe('slide');
  fireEvent.press(r.getByRole('button', { name: 'Close' }));
  expect(onClose).toHaveBeenCalledTimes(1);
  r.UNSAFE_getByType(Modal).props.onRequestClose();
  expect(onClose).toHaveBeenCalledTimes(2);
  r.rerender(content(false));
  expect(r.toJSON()).toBeNull();
});

test('title is optional', () => {
  const r = render(<FullScreenSheet visible onClose={jest.fn()}><UiText>Rubric</UiText></FullScreenSheet>);
  expect(r.queryByRole('header')).toBeNull();
  expect(r.getByRole('button', { name: 'Close' })).toBeTruthy();
});


afterEach(() => jest.restoreAllMocks());

test.each([
  ['titled', 'Story', { top: 47, bottom: 34, left: 0, right: 0 }, 47, 34],
  ['titleless', undefined, { top: 47, bottom: 34, left: 0, right: 0 }, 47, 34],
  ['titled without a provider', 'Story', null, 0, 16],
  ['titleless without a provider', undefined, null, 0, 16],
] as const)('%s sheet owns its top safe area and leaves bottom padding to the footer', (_label, title, insets, top, bottom) => {
  jest.replaceProperty(Platform, 'OS', 'ios');
  const r = render(
    <SafeAreaInsetsContext.Provider value={insets}>
      <FullScreenSheet visible title={title} onClose={jest.fn()}><UiText>First row</UiText></FullScreenSheet>
    </SafeAreaInsetsContext.Provider>,
  );
  const root = r.UNSAFE_getByType(Modal).findAllByType(View)[0];
  expect(StyleSheet.flatten(root.props.style)).toMatchObject({ flex: 1, paddingTop: top });
  expect(StyleSheet.flatten(root.props.style).paddingBottom ?? 0).toBe(0);
  expect(root.findAllByType(UiText).some((text: { props: { children?: React.ReactNode } }) => text.props.children === 'First row')).toBe(true);
  if (title) {
    expect(r.getByRole('header', { name: title })).toHaveStyle({ padding: tokens.space.lg });
  } else {
    expect(r.queryByRole('header')).toBeNull();
  }
  const panels = root.findAllByType(View).filter((view: { props: { style?: StyleProp<ViewStyle> } }) => StyleSheet.flatten(view.props.style)?.borderTopWidth === 1);
  expect(panels).toHaveLength(1);
  expect(StyleSheet.flatten(panels[0].props.style)).toMatchObject({ paddingBottom: bottom });
});
