import React, { useLayoutEffect } from 'react';
import { Text } from 'react-native';
import { act, screen } from '@testing-library/react-native';
import { ToastActorScope, useToast } from '../src/context/ToastContext';
import { renderWithProviders } from '../test-support/renderWithProviders';
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }), { virtual: true });

const makeHandle = (userId, epoch) => {
  let current = true;
  return { userId, epoch, isCurrent: () => current, retire: () => { current = false; } };
};
function Holder({ holder, publishOnMount }) {
  const toast = useToast();
  useLayoutEffect(() => {
    holder.current = toast;
    if (publishOnMount) toast.show({ message: 'Early message', tone: 'success' });
  }, [holder, toast, publishOnMount]);
  return null;
}
const show = (holder, message) => act(() => holder.current.show({ message, tone: 'success' }));
beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

test('a clock-out result held across sign-out publishes nothing on Login', () => {
  const a = makeHandle('a', 1);
  const held = {};
  const view = renderWithProviders(<ToastActorScope handle={a}><Holder holder={held} /></ToastActorScope>);
  view.rerender(<Text>Login</Text>);
  a.retire();
  show(held, 'Clocked out. 8.00 hours worked.');
  expect(screen.getByText('Login')).toBeTruthy();
  expect(screen.queryByText('Clocked out. 8.00 hours worked.')).toBeNull();
});

test('the same across an account switch, including a mismatched publisher before retirement', () => {
  const a = makeHandle('a', 1);
  const b = makeHandle('b', 2);
  const heldA = {};
  const heldB = {};
  const view = renderWithProviders(<ToastActorScope key="a" handle={a}><Holder holder={heldA} /></ToastActorScope>);
  show(heldA, 'A visible');
  view.rerender(<ToastActorScope key="b" handle={b}><Holder holder={heldB} /></ToastActorScope>);
  expect(screen.queryByText('A visible')).toBeNull();
  show(heldA, 'A late');
  expect(screen.queryByText('A late')).toBeNull();
  a.retire();
  show(heldA, 'A retired');
  expect(screen.queryByText('A retired')).toBeNull();
  show(heldB, 'B message');
  expect(screen.getByText('B message')).toBeTruthy();
  act(() => heldA.current.hide());
  expect(screen.getByText('B message')).toBeTruthy();
});

test('a toast on screen at sign-out is cleared', () => {
  const a = makeHandle('a', 1);
  const held = {};
  const view = renderWithProviders(<ToastActorScope handle={a}><Holder holder={held} /></ToastActorScope>);
  show(held, 'Clocked in at 08:00');
  expect(screen.getByText('Clocked in at 08:00')).toBeTruthy();
  view.rerender(<Text>Login</Text>);
  expect(screen.queryByText('Clocked in at 08:00')).toBeNull();
});

test('a signed-out toast is unscoped', () => {
  const held = {};
  renderWithProviders(<Holder holder={held} />);
  act(() => held.current.show({ message: 'Your access is paused. Please contact your supervisor.', tone: 'error' }));
  expect(screen.getByRole('alert')).toHaveTextContent('Your access is paused. Please contact your supervisor.');
});

test('a message published before the scope registered is kept', () => {
  renderWithProviders(<ToastActorScope handle={makeHandle('a', 1)}><Holder holder={{}} publishOnMount /></ToastActorScope>);
  expect(screen.getByText('Early message')).toBeTruthy();
});

test('an unscoped message clears on sign-in and cannot publish over the EA', () => {
  const held = {};
  const view = renderWithProviders(<Holder holder={held} />);
  show(held, 'Login message');
  view.rerender(<ToastActorScope handle={makeHandle('a', 1)}><Text>Home</Text></ToastActorScope>);
  expect(screen.queryByText('Login message')).toBeNull();
  show(held, 'Late login message');
  expect(screen.queryByText('Late login message')).toBeNull();
});
