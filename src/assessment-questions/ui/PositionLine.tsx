import React from 'react';
import { UiText } from './Text';

export type LinePart = { text: string; strong?: boolean };

export function PositionLine({ parts, testID }: { parts: ReadonlyArray<LinePart>; testID?: string }) {
  return (
    <UiText testID={testID} variant="caption" tone="muted" align="center" accessibilityLabel={parts.map(part => part.text).join('')}>
      {parts.map((part, index) => part.strong
        ? <UiText key={index} variant="captionStrong" tone="ink">{part.text}</UiText>
        : part.text)}
    </UiText>
  );
}
