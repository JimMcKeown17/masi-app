import { useState, useCallback } from 'react';

export function useToggleMark() {
  const [marked, setMarked] = useState<Set<string>>(new Set());

  const toggle = useCallback((key: string) => {
    setMarked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const isMarked = useCallback(
    (key: string) => marked.has(key),
    [marked]
  );

  return { toggle, isMarked };
}
