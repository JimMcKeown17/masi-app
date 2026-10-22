import React, { createContext, useContext } from 'react';

export interface AssessmentFonts {
  content?: string;
  text?: string;
  textSemi?: string;
  textBold?: string;
}

const AssessmentTheme = createContext<AssessmentFonts>({});

export function AssessmentThemeProvider({ fonts, children }: {
  fonts: AssessmentFonts;
  children: React.ReactNode;
}): React.JSX.Element {
  return <AssessmentTheme.Provider value={fonts}>{children}</AssessmentTheme.Provider>;
}

export function useAssessmentFonts(): AssessmentFonts {
  return useContext(AssessmentTheme);
}
