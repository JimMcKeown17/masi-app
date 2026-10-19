import React from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import { NavigationContext } from '@react-navigation/native';
import { renderWithProviders } from '../test-support/renderWithProviders';
import ScreenHeader, { useHeaderHairline } from '../src/components/common/ScreenHeader';
import { colors, tints } from '../src/constants/colors';
import { typeRoles } from '../src/constants/typography';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }), { virtual: true });
const navigation = { goBack: jest.fn(), setOptions: jest.fn() };
const route = { name: 'Example' };
const style = (node) => StyleSheet.flatten(node.props.style);
const renderHeader = (props = {}) => renderWithProviders(
  <ScreenHeader navigation={navigation} route={route} options={{ title: 'Assessment history' }} {...props} />,
  { insets: { top: 47, bottom: 0, left: 0, right: 0 } },
);
beforeEach(() => jest.clearAllMocks());

test('the title is a left-aligned header that wraps', () => {
  const screen = renderHeader();
  const title = screen.getByRole('header');
  expect(title).toHaveTextContent('Assessment history');
  expect(style(title)).toMatchObject({ ...typeRoles.displayTitle, color: colors.text, textAlign: 'left', flex: 1, paddingTop: 6 });
  expect(title.props.numberOfLines).toBeUndefined();
  expect(title.props.maxFontSizeMultiplier).toBe(1.3);
});

test('paddingTop is inset + 9 and the row grows from its minimum height', () => {
  const screen = renderHeader();
  expect(style(screen.getByTestId('screen-header'))).toMatchObject({ backgroundColor: colors.background, paddingTop: 56, paddingHorizontal: 24, paddingBottom: 6 });
  expect(style(screen.getByTestId('screen-header-row'))).toMatchObject({ minHeight: 44, flexDirection: 'row', alignItems: 'flex-start', gap: 12 });
  expect(style(screen.getByTestId('screen-header-row')).height).toBeUndefined();
});

test('with back it shows a Back circle that goes back', () => {
  const screen = renderHeader({ back: { title: 'Previous' } });
  const back = screen.getByRole('button', { name: 'Back' });
  expect(style(back)).toMatchObject({ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface });
  fireEvent.press(back);
  expect(navigation.goBack).toHaveBeenCalledTimes(1);
});

test('headerLeftIcon close shows Close and goes back even without back', () => {
  const screen = renderHeader({ options: { title: 'New session', headerLeftIcon: 'close' } });
  fireEvent.press(screen.getByRole('button', { name: 'Close' }));
  expect(navigation.goBack).toHaveBeenCalledTimes(1);
  expect(screen.queryByLabelText('Back')).toBeNull();
});

test.each([{ headerLeftIcon: 'none' }, { headerBackVisible: false }])('no Back button with %o', (options) => {
  const screen = renderHeader({ options, back: { title: 'Previous' } });
  expect(screen.queryByRole('button')).toBeNull();
});

test('without back there is no button', () => {
  expect(renderHeader().queryByRole('button')).toBeNull();
});

test('headerRight renders with the native-stack back state and ink tint', () => {
  const headerRight = jest.fn(() => <Text>Manage classes</Text>);
  const screen = renderHeader({ back: { title: 'Previous' }, options: { title: 'Class details', headerRight } });
  expect(screen.getByText('Manage classes')).toBeTruthy();
  expect(headerRight).toHaveBeenCalledWith({ canGoBack: true, tintColor: colors.text });
  screen.rerender(<ScreenHeader navigation={navigation} route={route} options={{ headerRight }} />);
  expect(headerRight).toHaveBeenLastCalledWith({ canGoBack: false, tintColor: colors.text });
});

test('the hairline shows only when headerScrolled and takes no layout space', () => {
  const screen = renderHeader();
  expect(screen.queryByTestId('screen-header-hairline')).toBeNull();
  screen.rerender(<ScreenHeader navigation={navigation} route={route} options={{ headerScrolled: true }} />);
  expect(style(screen.getByTestId('screen-header-hairline'))).toMatchObject({ position: 'absolute', bottom: 0, height: 1, backgroundColor: tints.rule });
});

test.each([
  [{ headerTitle: 'Custom title', title: 'Fallback' }, 'Custom title'],
  [{ headerTitle: () => null, title: 'Fallback' }, 'Fallback'],
  [{ title: '' }, ''],
  [{}, 'Example'],
])('title fallback for %o', (options, title) => {
  expect(renderHeader({ options }).getByRole('header').props.children).toBe(title);
});

function ScrollProbe({ navigation: explicitNavigation }) {
  const onScroll = useHeaderHairline(explicitNavigation);
  return <ScrollView testID="scroll" onScroll={onScroll} scrollEventThrottle={16} />;
}
const scroll = (screen, y) => fireEvent.scroll(screen.getByTestId('scroll'), { nativeEvent: { contentOffset: { y } } });
test.each([true, false])('the hairline updates only when scrolled flips (explicit navigation=%s)', (explicit) => {
  const screen = render(<NavigationContext.Provider value={navigation}><ScrollProbe navigation={explicit ? navigation : undefined} /></NavigationContext.Provider>);
  [0, 10, 20, 0, 0].forEach((y) => scroll(screen, y));
  expect(navigation.setOptions.mock.calls).toEqual([[{ headerScrolled: true }], [{ headerScrolled: false }]]);
});

test('without navigation the scroll handler is a no-op', () => {
  const screen = render(<ScrollProbe />);
  expect(() => scroll(screen, 10)).not.toThrow();
  expect(navigation.setOptions).not.toHaveBeenCalled();
});

test('switching between explicit navigation and context keeps the hook order', () => {
  const explicit = { setOptions: jest.fn() };
  const screen = render(<NavigationContext.Provider value={navigation}><ScrollProbe navigation={explicit} /></NavigationContext.Provider>);
  scroll(screen, 10);
  expect(explicit.setOptions).toHaveBeenCalledWith({ headerScrolled: true });
  expect(navigation.setOptions).not.toHaveBeenCalled();
  screen.rerender(<NavigationContext.Provider value={navigation}><ScrollProbe /></NavigationContext.Provider>);
  scroll(screen, 0);
  expect(navigation.setOptions).toHaveBeenCalledWith({ headerScrolled: false });
});
