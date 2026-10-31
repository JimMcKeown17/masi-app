import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useActiveProgrammeSubject } from '../src/hooks/useActiveProgrammeSubject';
const mockGate = jest.fn();
let mockFocus;
// A fresh handle per test: the hook caches the last known subject per signed-in EA handle.
let mockHandle;
jest.mock('../src/context/SignedInEAContext', () => ({ useSignedInEA: () => ({ handle: mockHandle }) }));
jest.mock('../src/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'ea' } }) }));
jest.mock('../src/services/activeProgrammeGate', () => ({ getActiveProgrammeGate: (...args) => mockGate(...args) }));
jest.mock('@react-navigation/native', () => ({
  useFocusEffect: cb => { mockFocus = cb; require('react').useEffect(cb, [cb]); },
}));
beforeEach(() => { jest.clearAllMocks(); mockHandle = { isCurrent: jest.fn(() => true) }; });
test('resolves the subject', async () => {
  mockGate.mockResolvedValue({ programme: { code: 'numeracy' } });
  const { result } = renderHook(useActiveProgrammeSubject);
  expect(result.current.loading).toBe(true);
  await waitFor(() => expect(result.current).toEqual({ subject: 'maths', isMaths: true, loading: false }));
  expect(mockGate).toHaveBeenCalledWith({ handle: mockHandle, userId: 'ea' });
});
test('useActiveProgrammeSubject settles on error', async () => {
  mockGate.mockRejectedValue(new Error('read failed'));
  const { result } = renderHook(useActiveProgrammeSubject);
  await waitFor(() => expect(result.current).toEqual({ subject: null, isMaths: false, loading: false }));
});
test('a stale handle never publishes', async () => {
  let resolve;
  mockGate.mockReturnValue(new Promise(done => { resolve = done; }));
  const { result } = renderHook(useActiveProgrammeSubject);
  mockHandle.isCurrent.mockReturnValue(false);
  await act(async () => resolve({ programme: { code: 'numeracy' } }));
  expect(result.current).toEqual({ subject: null, isMaths: false, loading: true });
});
test('a refocus keeps the known subject while it re-reads', async () => {
  mockGate.mockResolvedValue({ programme: { code: 'numeracy' } });
  const { result } = renderHook(useActiveProgrammeSubject);
  await waitFor(() => expect(result.current.loading).toBe(false));
  mockGate.mockReturnValue(new Promise(() => {}));
  act(() => { mockFocus(); });
  expect(result.current).toEqual({ subject: 'maths', isMaths: true, loading: false });
});
test('a newly mounted screen starts from the last known subject', async () => {
  mockGate.mockResolvedValue({ programme: { code: 'numeracy' } });
  const first = renderHook(useActiveProgrammeSubject);
  await waitFor(() => expect(first.result.current.loading).toBe(false));
  first.unmount();
  mockGate.mockReturnValue(new Promise(() => {}));
  const { result } = renderHook(useActiveProgrammeSubject);
  expect(result.current).toEqual({ subject: 'maths', isMaths: true, loading: false });
});
test('a failed re-read keeps the last known subject', async () => {
  mockGate.mockResolvedValue({ programme: { code: 'numeracy' } });
  const { result } = renderHook(useActiveProgrammeSubject);
  await waitFor(() => expect(result.current.loading).toBe(false));
  mockGate.mockRejectedValue(new Error('read failed'));
  await act(async () => { mockFocus(); });
  expect(result.current).toEqual({ subject: 'maths', isMaths: true, loading: false });
});
