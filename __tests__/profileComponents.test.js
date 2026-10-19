import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { fireEvent } from '@testing-library/react-native';
import { renderWithProviders as render } from '../test-support/renderWithProviders';
import Avatar from '../src/components/common/Avatar';
import ProfileIdentity from '../src/components/profile/ProfileIdentity';
import AppReleaseInfo, { formatReleaseLines } from '../src/components/profile/AppReleaseInfo';
import ExportDatabaseSheet from '../src/components/profile/ExportDatabaseSheet';
import { colors, spacing } from '../src/constants/colors';
import { typeRoles } from '../src/constants/typography';

jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }), { virtual: true });
jest.mock('react-native-safe-area-context', () => {
  const ReactForMock = require('react');
  const insets = { top: 0, right: 0, bottom: 0, left: 0 };
  return {
    useSafeAreaInsets: () => insets,
    SafeAreaInsetsContext: ReactForMock.createContext(insets),
    SafeAreaProvider: ({ children }) => <>{children}</>,
  };
});

const profile = { first_name: 'Test', last_name: 'User', jobTitleName: 'Education Assistant' };
const releaseMetadata = { supabaseTarget: 'sqlite-staging', supabaseProjectId: 'segygjzpujphwvrubusm' };
const runtimeDiagnostics = {
  application: { version: '1.2.0', build: '7' },
  device: { modelName: 'iPhone', osName: 'iOS', osVersion: '18.0' },
  update: { id: null },
};
const lines = [
  'Version\u00a01.2.0\u00a0(Build\u00a07) · Backend\u00a0sqlite-staging',
  'Project\u00a0segygjzpujphwvrubusm',
  'Device\u00a0iPhone · iOS\u00a018.0 · Update\u00a0Embedded',
];
const parentView = (node) => {
  let parent = node.parent;
  while (parent && parent.type !== 'View') parent = parent.parent;
  return parent;
};

test('ProfileIdentity shows name, job title and initials', () => {
  const ui = render(<ProfileIdentity profile={profile} email="test@masinyusane.org" />);
  expect(ui.getByRole('header', { name: 'Test User' })).toHaveStyle({ ...typeRoles.displaySheetTitle, color: colors.text });
  expect(ui.getByText('Education Assistant')).toHaveStyle({ ...typeRoles.textParagraph, color: colors.textSecondary, marginTop: 2 });
  expect(ui.getByText('TU', { includeHiddenElements: true })).toBeTruthy();
  expect(ui.UNSAFE_getByType(Avatar).props.size).toBe(64);
});

test.each([null, {}, { first_name: '  ', last_name: '\t' }])('ProfileIdentity falls back to email for a missing or blank profile: %p', (value) => {
  const ui = render(<ProfileIdentity profile={value} email="test@masinyusane.org" />);
  expect(ui.getByRole('header', { name: 'test@masinyusane.org' })).toBeTruthy();
  expect(ui.queryByText('Education Assistant')).toBeNull();
  expect(ui.queryByText('TU', { includeHiddenElements: true })).toBeNull();
  expect(ui.UNSAFE_getByType(Avatar).props.icon).toBe('person-outline');
});

test('ProfileIdentity tolerates a missing email too', () => {
  const ui = render(<ProfileIdentity profile={{}} />);
  expect(ui.getByRole('header').props.children).toBe('');
});

test('ProfileIdentity never truncates and centres its avatar beside wrapping text', () => {
  const ui = render(<ProfileIdentity profile={profile} />);
  const heading = ui.getByRole('header');
  expect(heading.props.numberOfLines).toBeUndefined();
  expect(ui.getByText('Education Assistant').props.numberOfLines).toBeUndefined();
  const column = parentView(heading);
  expect(StyleSheet.flatten(column.props.style)).toMatchObject({ flex: 1 });
  expect(StyleSheet.flatten(parentView(column).props.style)).toMatchObject({ flexDirection: 'row', alignItems: 'center', gap: spacing.md });
});

test('formatReleaseLines preserves the facts and only breaks spaces at separators', () => {
  expect(formatReleaseLines({ releaseMetadata, runtimeDiagnostics })).toEqual(lines);
});

test('formatReleaseLines keeps build, device, OS and update fallbacks', () => {
  expect(formatReleaseLines({ releaseMetadata, runtimeDiagnostics: {
    application: { version: '1.2.0', build: null },
    device: { modelName: null, osName: null, osVersion: null },
    update: { id: 'ota-id' },
  }, platform: { OS: 'android', Version: 35 } })).toEqual([
    'Version\u00a01.2.0\u00a0(Build\u00a0?) · Backend\u00a0sqlite-staging',
    lines[1],
    'Device\u00a0Unknown · android\u00a035 · Update\u00a0ota-id',
  ]);
});

test('AppReleaseInfo renders three centred tabular lines without truncation or outer spacing', () => {
  const ui = render(<AppReleaseInfo releaseMetadata={releaseMetadata} runtimeDiagnostics={runtimeDiagnostics} />);
  const texts = ui.UNSAFE_getAllByType(Text);
  expect(texts).toHaveLength(3);
  texts.forEach((node, index) => {
    expect(node.props.children).toBe(lines[index]);
    expect(StyleSheet.flatten(node.props.style)).toMatchObject({ ...typeRoles.textCaption, color: colors.textSecondary, fontVariant: ['tabular-nums'], textAlign: 'center' });
    expect(node.props.numberOfLines).toBeUndefined();
  });
  expect(StyleSheet.flatten(texts[0].parent.props.style)?.marginTop).toBeUndefined();
});

test('ExportDatabaseSheet presents the warning and routes Export and Cancel separately', () => {
  const onExport = jest.fn();
  const onCancel = jest.fn();
  const ui = render(<ExportDatabaseSheet visible onExport={onExport} onCancel={onCancel} />);
  expect(ui.getByRole('header', { name: 'Export database' })).toBeTruthy();
  expect(ui.getByText('Sensitive')).toHaveStyle({ color: colors.warningText });
  expect(ui.getByText('This will export all local data including sensitive information. Only share with Masi support staff.')).toBeTruthy();
  expect(ui.getByRole('button', { name: 'Export' })).toHaveStyle({ backgroundColor: colors.error });
  fireEvent.press(ui.getByRole('button', { name: 'Export' }));
  expect(onExport).toHaveBeenCalledTimes(1);
  expect(onCancel).not.toHaveBeenCalled();
  fireEvent.press(ui.getByRole('button', { name: 'Cancel' }));
  expect(onCancel).toHaveBeenCalledTimes(1);
});

test('ExportDatabaseSheet renders nothing while hidden', () => {
  const ui = render(<ExportDatabaseSheet visible={false} onExport={jest.fn()} onCancel={jest.fn()} />);
  expect(ui.queryByText('Export database')).toBeNull();
  expect(ui.queryByText('Sensitive')).toBeNull();
  expect(ui.queryByRole('button', { name: 'Export' })).toBeNull();
});
