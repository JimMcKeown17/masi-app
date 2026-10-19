import { StyleSheet } from 'react-native';
import { typeRoles } from '../src/constants/typography';

test.each([
  ['displayCount', { ...typeRoles.displayM, lineHeight: 24 }],
  ['textOptionSelected', { ...typeRoles.textButton, fontSize: 17, lineHeight: 22 }],
  ['textBodyLStrong', { ...typeRoles.textBodyStrong, fontSize: 17, lineHeight: 22 }],
])('%s preserves Home typography exactly', (role, previousStyle) => {
  expect(StyleSheet.flatten(typeRoles[role])).toEqual(StyleSheet.flatten(previousStyle));
});
