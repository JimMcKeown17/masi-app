import React, { createContext, useContext, ReactNode } from 'react';

const DEFAULT_SCALE = 1.0;

const ChildReadingFontSizeContext = createContext<number>(DEFAULT_SCALE);

export function ChildReadingFontSizeProvider({
  value,
  children,
}: {
  value: number;
  children: ReactNode;
}) {
  return (
    <ChildReadingFontSizeContext.Provider value={value}>
      {children}
    </ChildReadingFontSizeContext.Provider>
  );
}

export function useChildReadingFontSize(): number {
  return useContext(ChildReadingFontSizeContext);
}
