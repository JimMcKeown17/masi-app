import { render, fireEvent } from '@testing-library/react-native';
import EgraLetterGrid from '../src/components/assessment/EgraLetterGrid';

test('readOnly blocks onToggle (no toggle on press)', () => {
  const onToggle = jest.fn();
  const { getByLabelText } = render(
    <EgraLetterGrid letters={['a','b']} pageOffset={0} letterStates={{}} onToggle={onToggle} readOnly currentIndex={1} tileSize={60} gap={8} />
  );
  fireEvent.press(getByLabelText(/^a,/));
  expect(onToggle).not.toHaveBeenCalled();
});

test('currentIndex marks the current tile (accessibility)', () => {
  const { getByLabelText } = render(
    <EgraLetterGrid letters={['a','b']} pageOffset={0} letterStates={{}} onToggle={() => {}} readOnly currentIndex={1} tileSize={60} gap={8} />
  );
  expect(getByLabelText(/^b,.*current/i)).toBeTruthy();
});

test('backward compatible: without readOnly, onToggle still fires', () => {
  const onToggle = jest.fn();
  const { getByLabelText } = render(
    <EgraLetterGrid letters={['a','b']} pageOffset={0} letterStates={{}} onToggle={onToggle} tileSize={60} gap={8} />
  );
  fireEvent.press(getByLabelText(/^a,/));
  expect(onToggle).toHaveBeenCalledWith(0);
});
