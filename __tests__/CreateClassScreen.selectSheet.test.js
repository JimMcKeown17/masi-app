jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }), { virtual: true });
jest.mock('../src/context/AuthContext', () => ({ useAuth: () => ({ user: { id: '11111111-1111-4111-8111-111111111111' }, profile: {} }) }));
import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { AllProviders } from '../test-support/renderWithProviders';
import CreateClassScreen from '../src/screens/children/CreateClassScreen';

jest.mock('../src/context/ClassesContext', () => ({
  useClasses: () => ({
    schools: [{ id: 'school-1', name: 'Sunrise Primary' }],
    addClass: jest.fn(),
  }),
}));

test.each([
  [/^School \*,/, 'Select school'],
  [/^Grade \*,/, 'Select grade'],
  [/^Home language \*,/, 'Select home language'],
])('Create class uses sentence case for %s', (field, title) => {
  const screen = render(<AllProviders><CreateClassScreen navigation={{ goBack: jest.fn() }} /></AllProviders>);
  fireEvent.press(screen.getByRole('button', { name: field }));
  expect(screen.getByRole('header', { name: title })).toBeTruthy();
});

test('Create class uses curly quotes in its example placeholder', () => {
  const screen = render(<AllProviders><CreateClassScreen navigation={{ goBack: jest.fn() }} /></AllProviders>);
  expect(screen.getByPlaceholderText('e.g. “1A”, “2B”')).toBeTruthy();
});

test('CreateClassScreen keeps the visible Cancel action on the school picker', () => {
  const screen = render(
    <AllProviders>
      <CreateClassScreen navigation={{ goBack: jest.fn() }} />
    </AllProviders>,
  );

  fireEvent.press(screen.getByRole('button', { name: /^School \*,/ }));

  expect(screen.getByText('Cancel')).toBeTruthy();
});

test('CreateClassScreen enables search only for the school picker', () => {
  const screen = render(
    <AllProviders>
      <CreateClassScreen navigation={{ goBack: jest.fn() }} />
    </AllProviders>,
  );

  fireEvent.press(screen.getByRole('button', { name: /^School \*,/ }));
  expect(screen.getByLabelText('Search options')).toBeTruthy();

  fireEvent.press(screen.getByText('Cancel'));
  fireEvent.press(screen.getByRole('button', { name: /^Grade \*,/ }));
  expect(screen.queryByLabelText('Search options')).toBeNull();
});
