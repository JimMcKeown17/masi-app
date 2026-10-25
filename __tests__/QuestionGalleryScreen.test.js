import React from 'react';
import { StyleSheet, View } from 'react-native';
import { fireEvent, waitFor } from '@testing-library/react-native';
import { AllProviders, renderWithProviders } from '../test-support/renderWithProviders';
import { renderInTestStack } from '../test-support/renderInTestStack';
import QuestionGalleryScreen from '../src/screens/dev/QuestionGalleryScreen';
import QuestionGalleryRunScreen from '../src/screens/dev/QuestionGalleryRunScreen';
import StandaloneTestScreen from '../src/screens/assessments/StandaloneTestScreen';
import TestFrame from '../src/components/assessments/TestFrame';
import { BottomBar } from '../src/assessment-questions/ui/BottomBar';
import { AuthContext } from '../src/context/AuthContext';
import { WELA_PLUS_FULL_2024_1, CURRENT_ITEM_SETS, testFixtures, questionComponentFor } from '../src/assessment-questions';
import { STANDALONE_TESTS } from '../src/utils/assessmentRegistry';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }), { virtual: true });
jest.mock('../src/context/OfflineContext', () => ({ useOffline: () => ({ triggerBackgroundSync: jest.fn() }) }));
const noMotion = { motionLevel: 'still', reduceMotion: true, tier: 'static' };
const routes = [
  { name: 'QuestionGallery', component: QuestionGalleryScreen },
  { name: 'QuestionGalleryRun', component: QuestionGalleryRunScreen },
];
const gallery = () => renderInTestStack({ routes, initialIndex: 0, motion: noMotion });
const openFixture = screen => {
  fireEvent.press(screen.getByRole('button', { name: 'Content, Bundled card' }));
  fireEvent.press(screen.getByRole('button', { name: 'Test fixture' }));
};

test('the gallery lists standalone, WelaPLUS and all EGRA Questions', () => {
  const navigation = { navigate: jest.fn() };
  const screen = renderWithProviders(<QuestionGalleryScreen navigation={navigation} />);
  expect(screen.getByRole('header', { name: 'Standalone tests' })).toBeTruthy();
  expect(screen.getByRole('header', { name: 'WelaPLUS battery' })).toBeTruthy();
  const entryButtons = screen.getAllByRole('button').filter(button => !/^(Language|Content),/.test(button.props.accessibilityLabel));
  expect(entryButtons).toHaveLength(26);
  entryButtons.slice(0, 13).forEach((button, index) => {
    fireEvent.press(button);
    const code = index < 2 ? STANDALONE_TESTS[index].code : WELA_PLUS_FULL_2024_1.questions[index - 2].question_code;
    expect(navigation.navigate).toHaveBeenLastCalledWith('QuestionGalleryRun', {
      entryKey: `${index < 2 ? 'standalone' : 'battery'}:${code}`, languageCode: 'en', contentMode: 'bundled',
    });
  });
});

test('running a gallery entry mounts its Question and shows its result', async () => {
  const navigation = { goBack: jest.fn() };
  const screen = renderWithProviders(<QuestionGalleryRunScreen navigation={navigation}
    route={{ params: { entryKey: 'null_question', languageCode: 'en', contentMode: 'bundled' } }} />,
  { motion: noMotion });
  expect(await screen.findByRole('header', { name: 'Result' })).toBeTruthy();
  expect(screen.getByText('stopped_reason: completed')).toBeTruthy();
  expect(screen.getByText('—')).toBeTruthy();
  expect(screen.getByText('duration_ms: 0')).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: 'Run again' }));
  expect(await screen.findByRole('header', { name: 'Result' })).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: 'Done' }));
  expect(navigation.goBack).toHaveBeenCalledTimes(1);
});

test('choosing Test fixture on the list and opening story writing shows the fixture picture and anchors', async () => {
  const screen = gallery();
  openFixture(screen);
  fireEvent.press(screen.getByRole('button', { name: /Q11.*Story Writing/ }));
  expect(screen.navigationRef.getCurrentRoute().params).toEqual({
    entryKey: 'battery:wela_plus_story_writing', languageCode: 'en', contentMode: 'fixture',
  });
  fireEvent.press(screen.getByText('Start'));
  expect(screen.getByLabelText(testFixtures.FIXTURE_STORY_WRITING_EN.picture.alt)).toBeTruthy();
  fireEvent.press(screen.getByTestId('view-rubric-meaning_making'));
  expect(screen.getByText('sophisticated, fully developed')).toBeTruthy();
  fireEvent.press(screen.getByLabelText('Close'));
  fireEvent.press(screen.getByText('Finish'));
  fireEvent.press(screen.getByText('Yes, finish'));
  expect(await screen.findByRole('header', { name: 'Result' })).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: 'Run again' }));
  await waitFor(() => expect(screen.getByText('Start')).toBeTruthy());
  fireEvent.press(screen.getByText('Start'));
  expect(screen.getByLabelText(testFixtures.FIXTURE_STORY_WRITING_EN.picture.alt)).toBeTruthy();
  fireEvent.press(screen.getByTestId('view-rubric-meaning_making'));
  expect(screen.getByText('sophisticated, fully developed')).toBeTruthy();
  expect(screen.navigationRef.getCurrentRoute().params.contentMode).toBe('fixture');
});

test('isiXhosa with Test fixture explicitly uses the English fixture', async () => {
  const screen = gallery();
  fireEvent.press(screen.getByRole('button', { name: 'Language, English' }));
  fireEvent.press(screen.getByRole('button', { name: 'isiXhosa' }));
  openFixture(screen);
  expect(screen.getByRole('button', { name: /Content, Test fixture.*English/ })).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: /Q11.*Story Writing/ }));
  fireEvent.press(screen.getByText('Start'));
  expect(screen.getByLabelText(testFixtures.FIXTURE_STORY_WRITING_EN.picture.alt)).toBeTruthy();
  fireEvent.press(screen.getByText('Finish'));
  fireEvent.press(screen.getByText('Yes, finish'));
  expect(await screen.findByRole('header', { name: 'Result' })).toBeTruthy();
});

test.each(['StandaloneTest', 'QuestionGalleryRun'])('TestFrame owns the top inset and leaves the bottom to the Question: %s', host => {
  const wrapper = ({ children }) => <AllProviders insets={{ top: 47, bottom: 34, left: 0, right: 0 }}>
    <AuthContext.Provider value={{ user: { id: 'gallery-tester' } }}>{children}</AuthContext.Provider>
  </AllProviders>;
  const screen = renderInTestStack({ routes: [{ name: host,
    component: host === 'StandaloneTest' ? StandaloneTestScreen : QuestionGalleryRunScreen,
    params: host === 'StandaloneTest'
      ? { testCode: 'letter_sounds', languageCode: 'en', child: { id: 'child', first_name: 'Gallery' } }
      : { entryKey: 'battery:letter_sounds', languageCode: 'en', contentMode: 'bundled' },
  }], wrapper });
  const frame = screen.UNSAFE_getByType(TestFrame);
  const rootStyle = StyleSheet.flatten(frame.findAllByType(View)[0].props.style);
  expect(rootStyle.paddingTop).toBe(47);
  expect(rootStyle.paddingBottom).toBeUndefined();
  expect(screen.UNSAFE_getAllByType(BottomBar)).toHaveLength(1);
  expect(StyleSheet.flatten(screen.UNSAFE_getByType(BottomBar).findByType(View).props.style).paddingBottom).toBe(34);
  const padded = frame.findAllByType(View).filter(view => StyleSheet.flatten(view.props.style)?.paddingBottom === 34);
  expect(padded).toHaveLength(1);
});

test.each([
  ['standalone:word_reading', 'xh', 'bundled', 'word_reading', 'sequential'],
  ['battery:wela_plus_read_words', 'xh', 'bundled', 'wela_plus_read_words', undefined],
  ['battery:wela_plus_story_writing', 'xh', 'fixture', 'wela_plus_story_writing', undefined],
])('run resolves %s in %s with %s content', (entryKey, languageCode, contentMode, code, captureMode) => {
  const screen = renderWithProviders(<QuestionGalleryRunScreen navigation={{ goBack: jest.fn() }}
    route={{ params: { entryKey, languageCode, contentMode } }} />);
  const props = screen.UNSAFE_getByType(questionComponentFor(code).Component).props;
  expect(props).toMatchObject({ language: languageCode, childName: 'Gallery child',
    endNoun: entryKey.startsWith('standalone:') ? 'test' : 'question' });
  expect(props.captureMode).toBe(captureMode);
  if (contentMode === 'fixture') expect(props.itemSet).toBe(testFixtures.FIXTURE_STORY_WRITING_EN);
  else if (entryKey.startsWith('standalone:')) expect(props.itemSet).toBe(CURRENT_ITEM_SETS[code][languageCode]);
  else expect(props.itemSet).toBeUndefined();
});


test('Bundled card with isiXhosa keeps bundled story writing content', () => {
  const screen = gallery();
  fireEvent.press(screen.getByRole('button', { name: 'Language, English' }));
  fireEvent.press(screen.getByRole('button', { name: 'isiXhosa' }));
  fireEvent.press(screen.getByRole('button', { name: /Q11.*Story Writing/ }));
  const props = screen.UNSAFE_getByType(questionComponentFor('wela_plus_story_writing').Component).props;
  const definition = WELA_PLUS_FULL_2024_1.questions[10];
  expect(props.itemSet).toBeUndefined();
  expect(props.instructions).toBe(definition.instructions.xh);
  expect(props.durationSec).toBe(definition.durationSec);
  fireEvent.press(screen.getByText('Start'));
  expect(screen.queryByTestId('picture-thumbnail')).toBeNull();
  fireEvent.press(screen.getByTestId('view-rubric-meaning_making'));
  expect(screen.getByText('Rubric descriptions coming soon')).toBeTruthy();
});

test.each(WELA_PLUS_FULL_2024_1.questions.map(question => [question.question_code, question]))(
  'battery entry %s receives its isiXhosa instructions, duration and English fixture', (code, definition) => {
    const screen = renderWithProviders(<QuestionGalleryRunScreen navigation={{ goBack: jest.fn() }}
      route={{ params: { entryKey: `battery:${code}`, languageCode: 'xh', contentMode: 'fixture' } }} />);
    const props = screen.UNSAFE_getByType(questionComponentFor(code).Component).props;
    expect(props.instructions).toBe(definition.instructions.xh);
    expect(props.durationSec).toBe(definition.durationSec);
    expect(props.itemSet).toBeDefined();
    expect(props.itemSet.language).toBe('en');
    expect(props.itemSet.question_code).toBe(code);
    expect(props.language).toBe('xh');
  },
);

test('EGRA rows always open their own form language and bundled content', () => {
  const { EGRA_GALLERY_ENTRIES } = require('../src/utils/questionGallery');
  const navigation = { navigate: jest.fn() };
  const screen = renderWithProviders(<QuestionGalleryScreen navigation={navigation} />);
  openFixture(screen);
  let expanded;
  for (const entry of EGRA_GALLERY_ENTRIES) {
    if (expanded !== entry.formId) {
      fireEvent.press(screen.getByRole('button', { name: entry.formTitle }));
      expanded = entry.formId;
    }
    fireEvent.press(screen.getByRole('button', { name: entry.title }));
    expect(navigation.navigate).toHaveBeenLastCalledWith('QuestionGalleryRun', {
      entryKey: entry.entryKey, languageCode: entry.fixedLanguage, contentMode: 'bundled',
    });
  }
});

test('EGRA run uses its exact item set and fixed language even with conflicting route preferences', () => {
  const { EGRA_GALLERY_ENTRIES } = require('../src/utils/questionGallery');
  const entry = EGRA_GALLERY_ENTRIES.find(value => value.fixedLanguage === 'af' && value.questionCode === 'reading_comprehension');
  const screen = renderWithProviders(<QuestionGalleryRunScreen navigation={{ goBack: jest.fn() }}
    route={{ params: { entryKey: entry.entryKey, languageCode: 'xh', contentMode: 'fixture' } }} />);
  const props = screen.UNSAFE_getByType(questionComponentFor(entry.questionCode).Component).props;
  expect(props.itemSet).toBe(entry.itemSet);
  expect(props.language).toBe('af');
  expect(props.instructions).toBe(entry.instructions.af);
  fireEvent.press(screen.getByText('Ask the questions'));
  fireEvent.press(screen.getByTestId('story-end'));
  fireEvent.press(screen.getByText('End question'));
  expect(screen.getByText('stopped_reason: ea_ended')).toBeTruthy();
  expect(screen.getByText('—')).toBeTruthy();
});
