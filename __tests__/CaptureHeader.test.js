import React from 'react';
import { render } from '@testing-library/react-native';
import { colors } from '../src/constants/colors';

jest.mock('../src/components/assessment/CountdownTimer', () => {
  const ReactLib = require('react');
  const { Text } = require('react-native');
  const timerRenderSpy = jest.fn();
  const Timer = ({ getElapsedMs }) => {
    timerRenderSpy(getElapsedMs);
    return ReactLib.createElement(Text, null, 'Countdown');
  };
  return { __esModule: true, default: Timer, timerRenderSpy };
});

import CaptureHeader from '../src/components/assessment/CaptureHeader';
import { timerRenderSpy } from '../src/components/assessment/CountdownTimer';

describe('CaptureHeader', () => {
  beforeEach(() => {
    timerRenderSpy.mockClear();
  });

  test('renders the countdown, page progress, and active page dot', () => {
    const getElapsedMs = jest.fn(() => 0);
    const { getByText, getAllByTestId, getByTestId, rerender } = render(
      <CaptureHeader
        getElapsedMs={getElapsedMs}
        pageLabel="Page"
        currentPage={1}
        totalPages={3}
      />
    );

    expect(getByText('Countdown')).toBeTruthy();
    expect(getByText('Page 2 of 3')).toBeTruthy();
    expect(getAllByTestId(/capture-page-dot-/)).toHaveLength(3);
    expect(getByTestId('capture-page-dot-1')).toHaveStyle({ backgroundColor: colors.primary });
    expect(timerRenderSpy).toHaveBeenCalledWith(getElapsedMs);

    rerender(
      <CaptureHeader
        getElapsedMs={getElapsedMs}
        pageLabel="Page"
        currentPage={1}
        totalPages={3}
      />
    );

    expect(timerRenderSpy).toHaveBeenCalledTimes(1);
  });
});
