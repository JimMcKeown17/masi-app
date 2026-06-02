import { renderHook, act } from '@testing-library/react-native';
import { useToggleMark } from '../useToggleMark';

describe('useToggleMark', () => {
  test('toggle marks an item correct', () => {
    const { result } = renderHook(() => useToggleMark());

    act(() => {
      result.current.toggle('a');
    });

    expect(result.current.isMarked('a')).toBe(true);
  });

  test('second toggle clears the mark', () => {
    const { result } = renderHook(() => useToggleMark());

    act(() => {
      result.current.toggle('a');
    });
    act(() => {
      result.current.toggle('a');
    });

    expect(result.current.isMarked('a')).toBe(false);
  });

  test('marks multiple items independently', () => {
    const { result } = renderHook(() => useToggleMark());

    act(() => {
      result.current.toggle('a');
    });
    act(() => {
      result.current.toggle('b');
    });

    expect(result.current.isMarked('a')).toBe(true);
    expect(result.current.isMarked('b')).toBe(true);
    expect(result.current.isMarked('c')).toBe(false);
  });
});
