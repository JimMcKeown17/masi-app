import React from 'react';
import { StyleSheet } from 'react-native';
import { within } from '@testing-library/react-native';
import { renderWithProviders } from '../test-support/renderWithProviders';
import AssessmentDetailGrid from '../src/components/assessment/AssessmentDetailGrid';
import { colors } from '../src/constants/colors';

const item = (position, overrides = {}) => ({ id: `item-${position}`, position, prompt: `stored-${position}`, is_correct: true, metadata: {}, ...overrides });

test('stored row metadata preserves five rows of twelve and renders stored prompts in position order', () => {
  const items = Array.from({ length: 60 }, (_, position) => item(position, { metadata: { row: Math.floor(position / 12), reached: position < 59 } }));
  items[0].is_correct = false;
  const screen = renderWithProviders(<AssessmentDetailGrid assessment={{ question_code: 'letter_sounds', items: [...items].reverse() }} />);
  const rows = screen.getAllByTestId('assessment-detail-row');
  expect(rows).toHaveLength(5);
  rows.forEach(row => expect(within(row).getAllByTestId('assessment-detail-item')).toHaveLength(12));
  expect(within(rows[0]).getByText('stored-0')).toBeTruthy();
  expect(within(rows[4]).getByText('stored-59')).toBeTruthy();
  const tiles = screen.getAllByTestId('assessment-detail-item');
  expect(StyleSheet.flatten(tiles[0].props.style).backgroundColor).toBe(colors.emphasis);
  expect(StyleSheet.flatten(tiles[1].props.style).backgroundColor).toBe(colors.success);
  expect(StyleSheet.flatten(tiles[59].props.style).backgroundColor).toBe(colors.border);
});

test('words without row metadata use the stored bundled set id, even when its layout differs from the current language set', () => {
  const screen = renderWithProviders(<AssessmentDetailGrid assessment={{ question_code: 'word_reading', language: 'en', item_set_id: 'wela_plus_read_words@2024.1.en', items: Array.from({ length: 40 }, (_, position) => item(position)) }} />);
  expect(screen.getAllByTestId('assessment-detail-row').map(row => within(row).getAllByTestId('assessment-detail-item').length)).toEqual([7, 7, 7, 7, 7, 5]);
  expect(screen.getByText('stored-39')).toBeTruthy();
});

test('stored rows take precedence over word set layout and unknown item sets wrap every stored item', () => {
  const screen = renderWithProviders(<AssessmentDetailGrid assessment={{ question_code: 'word_reading', item_set_id: 'word_reading@2026.1.en', items: [item(0, { metadata: { row: 1 } }), item(1, { metadata: { row: 1 } }), item(2, { metadata: { row: 2 } })] }} />);
  expect(screen.getAllByTestId('assessment-detail-row').map(row => within(row).getAllByTestId('assessment-detail-item').length)).toEqual([2, 1]);
  screen.rerender(<AssessmentDetailGrid assessment={{ question_code: 'word_reading', item_set_id: 'unbundled-old-version', items: [item(0), item(4), item(9)] }} />);
  expect(screen.getAllByTestId('assessment-detail-item')).toHaveLength(3);
  expect(StyleSheet.flatten(screen.getByTestId('assessment-detail-row').props.style).flexWrap).toBe('wrap');
});
