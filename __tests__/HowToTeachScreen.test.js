import React from 'react';
import { renderWithProviders } from '../test-support/renderWithProviders';
import { getCurriculum, getStep } from '../content/numeracy-curriculum';
import { keepSumsTogether } from '../src/numeracyLesson/copy';
import HowToTeachScreen from '../src/screens/numeracy/HowToTeachScreen';
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }), { virtual: true });
const navigation = { setOptions: jest.fn() };
test('How to teach it shows goal, numbered steps and needs, never the partner note', () => {
  const step = getStep(getCurriculum(), 'add.5'); const activity = step.activities[0];
  const view = renderWithProviders(<HowToTeachScreen navigation={navigation} route={{ params: { stepKey: step.key, activity: activity.name } }} />);
  expect(view.getByText(keepSumsTogether(step.goal))).toBeTruthy();
  expect(view.getByText(keepSumsTogether(`${activity.name} · ${activity.minutes} min`))).toBeTruthy();
  activity.how.forEach((text, index) => { expect(view.getByText(`${index + 1}.`)).toBeTruthy(); expect(view.getByText(keepSumsTogether(text))).toBeTruthy(); });
  expect(view.getByText(keepSumsTogether(`You need: ${activity.needs}`))).toBeTruthy();
  expect(view.queryByText(step.note_for_partner)).toBeNull(); expect(view.queryByText(activity.source_ref)).toBeNull();
});
test.each([{ stepKey: 'unknown', activity: 'unknown' }, { stepKey: 'add.5', activity: 'unknown' }])('unknown content shows only the version note: %j', params => {
  const view = renderWithProviders(<HowToTeachScreen navigation={navigation} route={{ params }} />);
  expect(view.getByText("This step isn't in this version of the app.")).toBeTruthy(); expect(view.queryByText(/You need:/)).toBeNull();
});
test('the last line clears the bottom safe area (Android navigation bar)', () => {
  const { ScrollView } = require('react-native');
  const { SafeAreaInsetsContext } = require('react-native-safe-area-context');
  const { spacing } = require('../src/constants/colors');
  const step = getStep(getCurriculum(), 'add.5'); const activity = step.activities[0];
  const view = renderWithProviders(<SafeAreaInsetsContext.Provider value={{ top: 24, right: 0, bottom: 48, left: 0 }}>
    <HowToTeachScreen navigation={navigation} route={{ params: { stepKey: step.key, activity: activity.name } }} />
  </SafeAreaInsetsContext.Provider>);
  const style = [view.UNSAFE_getByType(ScrollView).props.contentContainerStyle].flat(Infinity).reduce((all, part) => ({ ...all, ...part }), {});
  expect(style.paddingBottom).toBe(48 + spacing.lg);
});
