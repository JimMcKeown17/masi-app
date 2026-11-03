jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));
import React, { useState } from 'react';
import { fireEvent } from '@testing-library/react-native';
import { renderWithProviders } from '../test-support/renderWithProviders';
import { getCurriculum } from '../content/numeracy-curriculum';
import { buildTrackerModel } from '../src/numeracyLesson/trackerModel';
import { stepPhrase, tickWhenLines } from '../src/numeracyLesson/copy';
import NumberTrackerGrid from '../src/components/numeracy/NumberTrackerGrid';
import StepSheet from '../src/components/numeracy/StepSheet';

const curriculum = getCurriculum();
const ticks = keys => keys.map(step_key => ({ step_key, confirmed: true, changed_by: 'ea', changed_at: '2026-11-03T08:00:00Z' }));
const modelFor = keys => buildTrackerModel({ curriculum, ticks: ticks(keys), userId: 'ea' });
const addRow = model => model.sections.flatMap(s => s.rows).find(r => r.skillKey === 'add');
const motion = { motionLevel: 'still', reduceMotion: true, tier: 'static' };
const sheet = (row, props = {}) => <StepSheet visible onDismiss={jest.fn()} curriculum={curriculum} row={row} childFirstName="Lwazi" onTick={jest.fn()} {...props} />;

test('tapping the skill name opens the step sheet with Tick when', async () => {
  function Harness() {
    const [row, setRow] = useState(null);
    const model = modelFor(['add.5', 'count.10']);
    return <><NumberTrackerGrid model={model} curriculum={curriculum} onPressSkill={setRow} />{sheet(row, { visible: !!row, onDismiss: () => setRow(null) })}</>;
  }
  const screen = renderWithProviders(<Harness />, { motion });
  fireEvent.press(screen.getByRole('button', { name: 'Add, steps' }));
  expect(await screen.findByText('Ask Lwazi on their own:')).toBeTruthy();
  expect(screen.getByText('All 3 right? Tick it.')).toBeTruthy();
  const lines = tickWhenLines(curriculum, 'add.10');
  expect(screen.getByText(lines.setup)).toBeTruthy();
  for (const line of lines.items) expect(screen.getByText(`${line.ask} → ${line.expected}`)).toBeTruthy();
  for (const step of curriculum.skills.find(s => s.key === 'add').steps) expect(screen.getByText(stepPhrase(curriculum, step.key))).toBeTruthy();
  expect(screen.getByText('Ticked by you · 3 Nov')).toBeTruthy();
});

test('the Tick button ticks the next step', async () => {
  const row = addRow(modelFor(['add.5', 'count.10']));
  const onTick = jest.fn();
  const screen = renderWithProviders(sheet(row, { onTick }), { motion });
  fireEvent.press(await screen.findByRole('button', { name: 'Tick' }));
  expect(onTick).toHaveBeenCalledWith('add.10');
  screen.rerender(sheet(row, { onTick, readOnly: true }));
  expect(screen.queryByRole('button', { name: 'Tick' })).toBeNull();
  expect(screen.getByText('Tick when')).toBeTruthy();
});

test('a finished skill shows no Tick when box', () => {
  const keys = curriculum.skills.find(s => s.key === 'add').steps.map(s => s.key);
  const screen = renderWithProviders(sheet(addRow(modelFor(keys))), { motion });
  expect(screen.queryByText('Tick when')).toBeNull();
  expect(screen.queryByText('Ask Lwazi on their own:')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Tick' })).toBeNull();
});
