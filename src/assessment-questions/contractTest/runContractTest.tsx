import React from 'react';
import { render } from '@testing-library/react-native';
import { validateResult, ValidationVerdict } from './validateResult';
import type { StopRule } from '../progress/stepByStep';
import type { Result } from '../types/Result';
import type { QuestionProps } from '../types/QuestionProps';

export interface ContractTestHandle {
  rendered: ReturnType<typeof render>;
  verdict: Promise<ValidationVerdict>;
}

export function runContractTest<P extends Partial<QuestionProps>>(
  Component: React.ComponentType<QuestionProps>,
  props: P,
  opts?: { stopRule?: StopRule; extraValidators?: Array<(r: Result) => ValidationVerdict> },
): ContractTestHandle {
  let resolveVerdict: (v: ValidationVerdict) => void;
  const verdict = new Promise<ValidationVerdict>((resolve) => {
    resolveVerdict = resolve;
  });

  const propsWithCapture: QuestionProps = {
    language: 'en',
    ...props,
    onComplete: (result: Result) => {
      const base = validateResult(result, { stopRule: opts?.stopRule });
      const errors = [...base.errors];
      for (const validate of opts?.extraValidators ?? []) errors.push(...validate(result).errors);

      if (props.durationSec !== undefined) {
        const derived = result?.derived as
          | Record<string, unknown>
          | null
          | undefined;
        const wasTimed = derived?.was_timed === true;
        const positionSet = typeof derived?.last_attempted_position === 'number';
        if (!wasTimed && !positionSet) {
          errors.push(
            `durationSec=${props.durationSec} was supplied but the Result has derived.was_timed !== true and derived.last_attempted_position is not a number — timed Questions must report progress`
          );
        }
      }

      resolveVerdict({ valid: errors.length === 0, errors });
    },
  };

  const rendered = render(<Component {...propsWithCapture} />);
  return { rendered, verdict };
}
