import React from 'react';
import { Pressable, Text } from 'react-native';
import { fireEvent } from '@testing-library/react-native';
import { runContractTest } from '../contractTest/runContractTest';
import type { QuestionProps } from '../types/QuestionProps';
import type { Result } from '../types/Result';

const validResult: Result = {
  question_code: 'interactive_stub',
  question_version: '1.0',
  item_set_id: 'interactive_stub@1.0.en',
  language: 'en',
  duration_ms: 1234,
  stopped_reason: 'completed',
  items: [],
  derived: {
    total_correct: 0,
    total_attempted: 0,
    percent: 0,
    last_attempted_position: null,
  },
};

function InteractiveQuestion(props: QuestionProps) {
  return (
    <Pressable testID="finish" onPress={() => props.onComplete(validResult)}>
      <Text>End</Text>
    </Pressable>
  );
}

describe('runContractTest — interactive Questions', () => {
  test('returns the render result so tests can fire EA actions before completion', async () => {
    const { rendered, verdict } = runContractTest(InteractiveQuestion, {
      language: 'en',
    });

    fireEvent.press(rendered.getByTestId('finish'));

    await expect(verdict).resolves.toMatchObject({ valid: true });
  });

  test('flags a timed component that completes without reporting progress', async () => {
    function BrokenTimedStub(props: QuestionProps) {
      return (
        <Pressable
          testID="finish"
          onPress={() => props.onComplete(validResult)}
        >
          <Text>End</Text>
        </Pressable>
      );
    }

    const { rendered, verdict } = runContractTest(BrokenTimedStub, {
      language: 'en',
      durationSec: 60,
    });

    fireEvent.press(rendered.getByTestId('finish'));
    const v = await verdict;

    expect(v.valid).toBe(false);
    expect(v.errors.some((e) => e.includes('durationSec'))).toBe(true);
  });
});
