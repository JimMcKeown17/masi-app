import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';
import ChildOnboardingScreen from '../src/screens/onboarding/ChildOnboardingScreen';

const mockNavigate = jest.fn();
const mockPopToTop = jest.fn();
const mockAddListener = jest.fn();
const mockCompleteClassOnboarding = jest.fn();
let mockChildren = [];

jest.mock('../src/context/ChildrenContext', () => ({
  useChildren: () => ({ children: mockChildren }),
}));

jest.mock('../src/context/ClassesContext', () => ({
  useClasses: () => ({
    classes: [{ id: 'class-new', name: '1A' }],
    completeClassOnboarding: mockCompleteClassOnboarding,
  }),
}));

const renderScreen = () => render(
  <PaperProvider>
    <ChildOnboardingScreen
      route={{ params: { classId: 'class-new' } }}
      navigation={{
        navigate: mockNavigate,
        popToTop: mockPopToTop,
        addListener: mockAddListener,
      }}
    />
  </PaperProvider>
);

describe('ChildOnboardingScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockChildren = [];
    mockCompleteClassOnboarding.mockResolvedValue({ success: true });
    mockAddListener.mockReturnValue(jest.fn());
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('requires the first child, blocks route removal, and opens Add Child', () => {
    const alertSpy = jest.spyOn(Alert, 'alert');
    const screen = renderScreen();

    expect(screen.getByText('0 children added')).toBeTruthy();
    expect(screen.getByText(/Add at least one child to finish setup/)).toBeTruthy();

    fireEvent.press(screen.getByText('Finish Setup'));
    expect(mockPopToTop).not.toHaveBeenCalled();

    const beforeRemove = mockAddListener.mock.calls.find(([event]) => event === 'beforeRemove')[1];
    const routeRemoval = { preventDefault: jest.fn() };
    act(() => beforeRemove(routeRemoval));
    expect(routeRemoval.preventDefault).toHaveBeenCalledTimes(1);
    expect(alertSpy).toHaveBeenCalledWith(
      'Add a child before leaving',
      expect.stringContaining('at least one child')
    );

    fireEvent.press(screen.getByText('Add First Child'));
    expect(mockNavigate).toHaveBeenCalledWith('AddChild', { classId: 'class-new' });
  });

  test('keeps the under-10 warning and confirms before finishing', async () => {
    mockChildren = [{ id: 'child-1', class_id: 'class-new' }];
    const alertSpy = jest.spyOn(Alert, 'alert');
    const screen = renderScreen();

    expect(screen.getByText('1 child added')).toBeTruthy();
    expect(screen.getByText(/recommended 10 children/)).toBeTruthy();

    fireEvent.press(screen.getByText('Add Another Child'));
    expect(mockNavigate).toHaveBeenCalledWith('AddChild', { classId: 'class-new' });

    fireEvent.press(screen.getByText('Finish Setup'));
    expect(mockPopToTop).not.toHaveBeenCalled();
    expect(alertSpy).toHaveBeenCalledWith(
      'Finish with fewer than 10 children?',
      expect.stringContaining('1 child'),
      expect.arrayContaining([
        expect.objectContaining({ text: 'Keep Adding' }),
        expect.objectContaining({ text: 'Finish Setup' }),
      ])
    );

    const finishAction = alertSpy.mock.calls[0][2]
      .find(action => action.text === 'Finish Setup');
    await act(async () => finishAction.onPress());
    expect(mockCompleteClassOnboarding).toHaveBeenCalledWith('class-new');
    expect(mockPopToTop).toHaveBeenCalledTimes(1);
  });

  test('removes the warning at 10 children and finishes directly', async () => {
    mockChildren = [
      ...Array.from({ length: 10 }, (_, index) => ({
        id: `child-${index}`,
        class_id: 'class-new',
      })),
      { id: 'other-class-child', class_id: 'class-other' },
    ];
    const alertSpy = jest.spyOn(Alert, 'alert');
    const screen = renderScreen();

    expect(screen.getByText('10 children added')).toBeTruthy();
    expect(screen.getByText('Recommended roster reached')).toBeTruthy();
    expect(screen.queryByText('Keep adding children')).toBeNull();

    fireEvent.press(screen.getByText('Finish Setup'));

    expect(alertSpy).not.toHaveBeenCalled();
    await waitFor(() => expect(mockCompleteClassOnboarding).toHaveBeenCalledWith('class-new'));
    expect(mockPopToTop).toHaveBeenCalledTimes(1);
  });

  test('stays in onboarding when durable completion fails', async () => {
    mockChildren = [{ id: 'child-1', class_id: 'class-new' }];
    mockCompleteClassOnboarding.mockResolvedValueOnce({ success: false });
    const alertSpy = jest.spyOn(Alert, 'alert');
    const screen = renderScreen();

    fireEvent.press(screen.getByText('Finish Setup'));
    const finishAction = alertSpy.mock.calls[0][2]
      .find(action => action.text === 'Finish Setup');
    await act(async () => finishAction.onPress());

    expect(mockPopToTop).not.toHaveBeenCalled();
    expect(alertSpy).toHaveBeenLastCalledWith(
      'Could not finish setup',
      expect.stringContaining('saved children are still safe')
    );
  });
});
