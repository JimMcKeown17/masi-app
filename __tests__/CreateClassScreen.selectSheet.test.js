import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';
import CreateClassScreen from '../src/screens/children/CreateClassScreen';

jest.mock('../src/context/ClassesContext', () => ({
  useClasses: () => ({
    schools: [{ id: 'school-1', name: 'Sunrise Primary' }],
    addClass: jest.fn(),
  }),
}));

test('CreateClassScreen keeps the visible Cancel action on the school picker', () => {
  const screen = render(
    <PaperProvider>
      <CreateClassScreen navigation={{ goBack: jest.fn() }} />
    </PaperProvider>,
  );

  fireEvent.press(screen.getAllByTestId('right-icon-adornment')[0]);

  expect(screen.getByText('Cancel')).toBeTruthy();
});
