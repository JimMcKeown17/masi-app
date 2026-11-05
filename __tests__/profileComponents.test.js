import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { fireEvent, within } from '@testing-library/react-native';
import { renderWithProviders as render } from '../test-support/renderWithProviders';
import Avatar from '../src/components/common/Avatar';
import ProfileIdentity from '../src/components/profile/ProfileIdentity';
import AppReleaseInfo from '../src/components/profile/AppReleaseInfo';
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
const release = {
  releaseLabel: '1.5.0+2', version: '1.5.0', build: '55', buildLabel: '1.5.0 (55)', channel: 'preview',
  runtimeVersion: '1.5.0', updateId: '0199a6f2-8add-7aae-9c11-3f0e5d1c2b4a', shortUpdateId: '0199a6f2',
  launch: 'Update', otaRelease: 2, publishedAt: '2026-11-05 09:12 UTC', publishedAtIso: '2026-11-05T09:12:47.000Z',
  sourceCommit: 'fd053cf', gitCommit: 'fd053cfc0a1b2c3d4e5f60718293a4b5c6d7e8f9',
  backendTarget: 'sqlite-staging', backendProjectId: 'segygjzpujphwvrubusm',
};
const device = { modelName: 'iPhone', osName: 'iOS', osVersion: '18.0' };
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

test('AppReleaseInfo is an App release section that shows the release large and every fact under its label', () => {
  const ui = render(<AppReleaseInfo release={release} device={device} />);
  expect(ui.getByRole('header', { name: 'App release' })).toBeTruthy();
  expect(ui.getByLabelText('Release, 1.5.0+2')).toBeTruthy();
  for (const [label, value] of [
    ['Build', '1.5.0 (55)'], ['Channel', 'preview'], ['Runtime', '1.5.0'], ['Update', '0199a6f2'],
    ['Running', 'Update'], ['Published', '2026-11-05 09:12 UTC'], ['Source', 'fd053cf'],
  ]) {
    const cell = ui.getByLabelText(`${label}, ${value}`);
    expect(within(cell).getByText(label)).toHaveStyle({ ...typeRoles.textLabel, color: colors.textSecondary });
    expect(within(cell).getByText(value)).toHaveStyle({ ...typeRoles.textData, color: colors.text });
  }
  expect(ui.getByLabelText('Backend, sqlite-staging, segygjzpujphwvrubusm')).toBeTruthy();
  // The full update id is never shown: the first 8 characters identify it.
  expect(ui.queryByText(release.updateId)).toBeNull();
});

test('AppReleaseInfo sets the release in large tabular numerals and lets support copy every value', () => {
  const ui = render(<AppReleaseInfo release={release} device={device} />);
  const value = ui.getByText('1.5.0+2');
  expect(StyleSheet.flatten(value.props.style)).toMatchObject({ ...typeRoles.displayTitle, color: colors.text, fontVariant: ['tabular-nums'] });
  for (const text of ['1.5.0+2', '1.5.0 (55)', '0199a6f2', '2026-11-05 09:12 UTC', 'fd053cf', 'sqlite-staging', 'segygjzpujphwvrubusm']) {
    const node = ui.getByText(text);
    expect(node.props.selectable).toBe(true);
    expect(node.props.numberOfLines).toBeUndefined();
  }
  expect(StyleSheet.flatten(ui.getByText('0199a6f2').props.style).fontVariant).toEqual(['tabular-nums']);
  expect(ui.getByText('Release')).toHaveStyle({ ...typeRoles.textLabel, color: colors.textSecondary });
  expect(ui.getByText('segygjzpujphwvrubusm')).toHaveStyle({ ...typeRoles.textCaption, color: colors.textSecondary });
});

test('AppReleaseInfo rows sit in one white group with a divider between rows, not after the last', () => {
  const ui = render(<AppReleaseInfo release={release} device={device} />);
  expect(ui.getAllByTestId('list-row-divider')).toHaveLength(5);
});

test('AppReleaseInfo pairs short facts and gives the long ones a full row, so none breaks mid-value on a 360dp phone', () => {
  // Measured with Figtree metrics: a half-width cell on 360dp is 131dp, but
  // "2026-11-05 09:12 UTC" (textData) is 154dp and the project id (textCaption) is 140dp.
  const ui = render(<AppReleaseInfo release={release} device={device} />);
  const rows = ui.getAllByTestId('release-fact-row').map(row => row
    .findAll(node => node.type === 'View' && node.props.accessible === true)
    .map(node => node.props.accessibilityLabel.split(',')[0]));
  expect(rows).toEqual([['Release'], ['Build', 'Channel'], ['Runtime', 'Update'], ['Running', 'Source'], ['Published'], ['Backend']]);
});

test('AppReleaseInfo centres each row\'s facts in the row height, as ListRow centres its text, and keeps paired facts top-aligned', () => {
  // ListRow (the Profile info rows above the card) is minHeight 64 with its content centred; a
  // label over a value is 36dp, so a top-aligned fact would sit 10dp from the top and 18dp from the bottom.
  const ui = render(<AppReleaseInfo release={release} device={device} />);
  for (const row of ui.getAllByTestId('release-fact-row')) {
    expect(StyleSheet.flatten(row.props.style)).toMatchObject({ minHeight: 64, paddingVertical: 10, paddingHorizontal: 16, justifyContent: 'center' });
    const facts = row.findAll(node => node.type === 'View' && node.props.accessible === true);
    const pair = parentView(facts[0]);
    expect(StyleSheet.flatten(pair.props.style)).toMatchObject({ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md });
    expect(parentView(pair)).toBe(row);
  }
});

test('AppReleaseInfo for the built-in bundle shows no published time and says it is running the built-in bundle', () => {
  const ui = render(<AppReleaseInfo device={device} release={{
    ...release, releaseLabel: '1.5.0', launch: 'Built-in', otaRelease: null, publishedAt: null, publishedAtIso: null,
    shortUpdateId: '7d3e1c55', updateId: '7d3e1c55-0b44-4f0e-8a9b-5c6d7e8f9a0b',
  }} />);
  expect(ui.getByLabelText('Release, 1.5.0')).toBeTruthy();
  expect(ui.getByLabelText('Running, Built-in')).toBeTruthy();
  expect(ui.getByLabelText('Published, \u2014')).toBeTruthy();
});

test('AppReleaseInfo shows a dash for each missing fact rather than leaving a gap', () => {
  const ui = render(<AppReleaseInfo device={device} release={{
    ...release, channel: null, runtimeVersion: null, updateId: null, shortUpdateId: null, publishedAt: null, sourceCommit: null,
  }} />);
  for (const label of ['Channel', 'Runtime', 'Update', 'Published', 'Source']) {
    expect(ui.getByLabelText(`${label}, \u2014`)).toBeTruthy();
  }
});

test('AppReleaseInfo keeps device and OS as one centred caption line under the card', () => {
  const ui = render(<AppReleaseInfo release={release} device={device} />);
  const line = ui.getByText('Device\u00a0iPhone · iOS\u00a018.0');
  expect(StyleSheet.flatten(line.props.style)).toMatchObject({ ...typeRoles.textCaption, color: colors.textSecondary, textAlign: 'center' });
  const fallback = render(<AppReleaseInfo release={release} device={{ modelName: null, osName: null, osVersion: null }}
    platform={{ OS: 'android', Version: 35 }} />);
  expect(fallback.getByText('Device\u00a0Unknown · android\u00a035')).toBeTruthy();
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
