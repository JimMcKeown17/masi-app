import { colors } from '../src/constants/colors';
import { tokens } from '../src/assessment-questions/theme/tokens';

test.each([
  ['ink', 'text'], ['muted', 'textSecondary'], ['line', 'border'],
  ['canvas', 'background'], ['surface', 'surface'], ['primary', 'primary'],
  ['error', 'error'], ['errorSoft', 'errorBg'], ['warning', 'warning'],
  ['markedSoft', 'successBg'], ['notReached', 'disabled'],
])('package %s copies host %s', (packageName, hostName) => {
  expect(tokens.color[packageName]).toBe(colors[hostName]);
});

test('marked is the package-only AA green', () => {
  expect(tokens.color.marked).toBe('#2E7D27');
});
