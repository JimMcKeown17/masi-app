import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { LETTER_PAGE_LAYOUT } from '../../ui';
import { flatCopy } from '../captureCopy';
import { SequentialCapture } from '../SequentialCapture';

describe('SequentialCapture countdown isolation', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('countdown ticks do not re-render the grid', () => {
    let promptRenderCount = 0;
    const item = Object.defineProperty(
      { item_key: 'a', row: 0 },
      'prompt',
      { get: () => { promptRenderCount += 1; return 'a'; } },
    );
    const screen = render(
      <SequentialCapture
        language="en"
        itemSet={{
          item_set_id: 'render-count@fixture.en',
          question_code: 'render-count',
          question_version: 'fixture',
          language: 'en',
        }}
        items={[item as { item_key: string; prompt: string; row: number }]}
        copy={flatCopy('letter', 1)}
        body={{ kind: 'grid', rows: [[0]], layout: LETTER_PAGE_LAYOUT, variant: 'letter', testID: 'letter-grid' }}
        stopRule={null}
        testIDPrefix="letter"
        durationSec={60}
        onComplete={jest.fn()}
      />,
    );
    fireEvent.press(screen.getByText('Start'));
    expect(promptRenderCount).toBeGreaterThan(0);
    promptRenderCount = 0;

    act(() => jest.advanceTimersByTime(1000));

    expect(screen.getByText('59s')).toBeTruthy();
    expect(promptRenderCount).toBe(0);
  });
});
