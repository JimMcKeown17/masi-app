import Constants from 'expo-constants';
import { isQuestionGalleryEnabled } from '../src/utils/questionGallery';

let mockUpdatesChannel = null;
let mockEmbeddedLaunch = true;
jest.mock('expo-updates', () => ({
  get channel() { return mockUpdatesChannel; },
  get isEmbeddedLaunch() { return mockEmbeddedLaunch; },
}));

const originalDev = global.__DEV__;
const originalExtra = Constants.expoConfig?.extra;
const originalProfile = process.env.EAS_BUILD_PROFILE;
beforeEach(() => {
  mockUpdatesChannel = null;
  mockEmbeddedLaunch = true;
});
afterEach(() => {
  global.__DEV__ = originalDev;
  Constants.expoConfig.extra = originalExtra;
  if (originalProfile === undefined) delete process.env.EAS_BUILD_PROFILE;
  else process.env.EAS_BUILD_PROFILE = originalProfile;
});

test('the gallery build flag is on only for development and preview builds', () => {
  for (const [profile, expected] of [['development', true], ['preview', true], ['pilot', false], ['production', false], ['something-else', false], [undefined, false]]) {
    if (profile === undefined) delete process.env.EAS_BUILD_PROFILE;
    else process.env.EAS_BUILD_PROFILE = profile;
    jest.isolateModules(() => {
      expect(require('../app.config')().expo.extra.questionGallery).toBe(expected);
    });
  }
});

test.each([undefined, false, 'true', 1, {}])('release runtime fails closed for flag %p', flag => {
  global.__DEV__ = false;
  Constants.expoConfig.extra = flag === undefined ? {} : { questionGallery: flag };
  expect(isQuestionGalleryEnabled()).toBe(false);
});
test('release runtime fails closed without extra or expoConfig', () => {
  global.__DEV__ = false;
  Constants.expoConfig.extra = undefined;
  expect(isQuestionGalleryEnabled()).toBe(false);
  const config = Constants.expoConfig;
  try {
    Constants.expoConfig = undefined;
    expect(isQuestionGalleryEnabled()).toBe(false);
  } finally { Constants.expoConfig = config; }
});
test('development runtime and an explicit boolean build flag enable the gallery', () => {
  global.__DEV__ = true;
  Constants.expoConfig.extra = {};
  expect(isQuestionGalleryEnabled()).toBe(true);
  global.__DEV__ = false;
  Constants.expoConfig.extra = { questionGallery: true };
  expect(isQuestionGalleryEnabled()).toBe(true);
});


test.each([
  [true, null, true],
  [true, undefined, true],
  [true, '', true],
  [true, 'preview', false],
  [false, 'preview', false],
  [true, 'production', false],
  [false, 'production', false],
  [false, null, false],
  [undefined, null, false],
  ['true', null, false],
])('release runtime with flag true, embedded=%p and native channel=%p enables gallery=%p', (embedded, channel, expected) => {
  global.__DEV__ = false;
  mockEmbeddedLaunch = embedded;
  mockUpdatesChannel = channel;
  Constants.expoConfig.extra = { questionGallery: true };
  expect(isQuestionGalleryEnabled()).toBe(expected);
});

test('development runtime enables the gallery even on an OTA with a native channel and no build flag', () => {
  global.__DEV__ = true;
  mockEmbeddedLaunch = false;
  mockUpdatesChannel = 'production';
  Constants.expoConfig.extra = {};
  expect(isQuestionGalleryEnabled()).toBe(true);
});

test('EGRA gallery has every form and section with fixed source language and exact item set', () => {
  const { EGRA_GALLERY_ENTRIES, questionGalleryEntry } = require('../src/utils/questionGallery');
  const { EGRA_FORMS, egraItemSetFor } = require('../src/assessment-questions');
  expect(EGRA_GALLERY_ENTRIES).toHaveLength(52);
  for (const form of EGRA_FORMS) {
    for (const code of ['letter_sounds', 'word_reading', 'oral_reading', 'reading_comprehension']) {
      const key = `egra:${form.id}:${code}`;
      const entry = questionGalleryEntry(key);
      expect(entry.fixedLanguage).toBe(form.languageCode);
      expect(entry.itemSet).toBe(egraItemSetFor(code, form.id, form.languageCode));
      expect(entry.title).toMatch(form.title);
      expect(entry.instructions[form.languageCode]).toBeTruthy();
      expect(entry.durationSec).toBe(code === 'reading_comprehension' ? undefined : 60);
    }
  }
});
