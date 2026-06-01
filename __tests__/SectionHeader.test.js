import React from 'react';
import { render } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';
import SectionHeader from '../src/components/common/SectionHeader';

const renderWithPaper = (ui) => render(<PaperProvider>{ui}</PaperProvider>);

describe('SectionHeader', () => {
  test('renders the title', () => {
    const { getByText } = renderWithPaper(<SectionHeader title="Assessments" />);
    expect(getByText('Assessments')).toBeTruthy();
  });

  test('renders the subtitle when provided, omits it otherwise', () => {
    const withSub = renderWithPaper(<SectionHeader title="Sessions" subtitle="Record new sessions." />);
    expect(withSub.getByText('Record new sessions.')).toBeTruthy();

    const noSub = renderWithPaper(<SectionHeader title="Sessions" />);
    expect(noSub.queryByText('Record new sessions.')).toBeNull();
  });
});
