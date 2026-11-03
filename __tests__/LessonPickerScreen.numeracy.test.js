import React from 'react';
import { Text } from 'react-native';
import { act, cleanupAsync, fireEvent, waitFor } from '@testing-library/react-native';
import { SignedInEAContext } from '../src/context/SignedInEAContext';
import { getDefaultTestHandle } from '../test-support/defaultTestHandle';
import { AllProviders } from '../test-support/renderWithProviders';
import { renderInTestStack } from '../test-support/renderInTestStack';
import { seedCoreData } from '../test-support/sqliteRepositoryTestUtils';
import { createLessonDraftController } from '../src/services/lessonDraftController';
import { loadLessonBase, loadPickerRanking } from '../src/lessonPlan/inputs/lessonInputs';
import { loadNumeracyPickerNext } from '../src/numeracyLesson/inputs/numeracyPicker';
import * as numeracyInputs from '../src/numeracyLesson/inputs/numeracyInputs';
import * as gate from '../src/services/activeProgrammeGate';
import { rememberProgrammeSubject } from '../src/utils/programmeSubject';
import { PROGRAMME_CHANGED_NOTE } from '../src/numeracyLesson/copy';
import LessonPickerScreen from '../src/screens/lessons/LessonPickerScreen';
import SessionFormScreen from '../src/screens/sessions/SessionFormScreen';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }), { virtual: true });
let handle, mockRoster;
jest.mock('../src/context/ChildrenContext', () => ({ useChildren: () => mockRoster }));
jest.mock('../src/context/ClassesContext', () => ({ useClasses: () => ({ classes: [] }) }));
jest.mock('../src/context/AuthContext', () => ({ useAuth: () => ({ user: { id: mockRoster.userId },
  profile: { jobTitleCode: require('../src/constants/jobTitles').JOB_TITLE_CODES.LITERACY_COACH } }) }));
const wrapper = ({ children }) => <AllProviders><SignedInEAContext.Provider value={{ handle,
  repositories: handle.repositories, services: handle.services }}>{children}</SignedInEAContext.Provider></AllProviders>;
const Stub = () => <Text>Lesson route</Text>;
const mount = (kind = 'numeracy', sessionForm = false) => {
  const Picker = props => sessionForm ? <SessionFormScreen {...props} /> : <LessonPickerScreen {...props} kind={kind} />;
  return renderInTestStack({ wrapper, initialIndex: 1,
    motion: { tier: 'static', motionLevel: 'still', reduceMotion: true },
    routes: [{ name: 'Home', component: Stub }, { name: 'SessionForm', component: Picker, options: { title: 'Who are you teaching?' } },
      { name: 'Lesson', component: Stub }, { name: 'NumeracyLesson', component: Stub }] });
};
const testPicker = (name, run) => test(name, async () => { try { await run(); } finally { await cleanupAsync(); } });
const count = async () => (await (await handle.getReader()).getFirstAsync('select count(*) as n from lesson_drafts')).n;
const seedDraft = async (kind, corrupt = false) => {
  // Seed below the controller: the picker must attach the cold-start row before discarding.
  await handle.withTransaction(db => db.runAsync(`insert into lesson_drafts
    (id, session_id, programme_id, group_id, lesson_date, attendance, ticks, tracker_changes, reading_level_changes, created_at, updated_at, kind)
    values ('draft-1', 'session-1', 'programme-b', 'g1', '2026-11-01', ?, ?, '{}', '{}', ?, ?, ?)`,
    JSON.stringify({ childIds: ['c1'], absentChildIds: [], addedChildIds: [] }),
    corrupt ? 'broken' : JSON.stringify(kind === 'numeracy' ? { taught: null } : { letters: [], blends: [], books: [] }),
    new Date().toISOString(), new Date().toISOString(), kind));
  handle.services.lessonDraft = createLessonDraftController({ repositories: handle.repositories, onClose: listener => handle.onClose(listener) });
};
const discard = async (view, subject) => {
  expect(view.queryByText('Up next')).toBeNull();
  expect(view.queryByRole('button', { name: 'Start lesson' })).toBeNull();
  expect(view.routeNames()).toEqual(['Home', 'SessionForm']);
  fireEvent.press(view.getByRole('button', { name: 'Discard it' }));
  await view.findByText(`Discard the ${subject} lesson?`);
  fireEvent.press(view.getByRole('button', { name: 'Discard' }));
  await view.findByText('Up next');
  expect(await count()).toBe(0);
};
beforeEach(async () => {
  handle = getDefaultTestHandle();
  const children = Array.from({ length: 36 }, (_, i) => ({ id: `c${i + 1}`, first_name: `Child ${i + 1}`, last_name: 'Test', class_id: 'class-1' }));
  const groups = Array.from({ length: 6 }, (_, i) => ({ id: `g${i + 1}`, name: `Group ${i + 1}`, programme_id: 'programme-b', class_id: 'class-1' }));
  mockRoster = { userId: handle.userId, children, groups, childrenGroups: children.map((c, i) => ({ child_id: c.id, group_id: groups[Math.floor(i / 6)].id })),
    getChildrenInGroup: id => children.filter(c => mockRoster.childrenGroups.some(m => m.group_id === id && m.child_id === c.id)), makeGroup: jest.fn(), addChildToGroup: jest.fn() };
  await handle.withTransaction(async db => {
    await seedCoreData(db);
    await db.runAsync("update staff_programme_assignments set user_id = ?, programme_id = 'programme-b'", handle.userId);
    for (const c of children) {
      await db.runAsync("insert into children (id, first_name, last_name, class_id, created_by) values (?, ?, 'Test', 'class-1', ?)", c.id, c.first_name, handle.userId);
      await db.runAsync('insert into child_ea_assignments (id, user_id, child_id) values (?, ?, ?)', c.id, handle.userId, c.id);
    }
    for (const g of groups) await db.runAsync("insert into groups (id, name, programme_id, class_id) values (?, ?, 'programme-b', 'class-1')", g.id, g.name);
  });
});
afterEach(() => jest.restoreAllMocks());

testPicker('a numeracy EA sees Who are you teaching with Up next and a Next line', async () => {
  const view = mount();
  await view.findByText('Up next');
  // The shared StackRouter harness omits native headers; the existing Record title is unchanged.
  await waitFor(() => expect(view.getAllByText(/Next: Count objects up to 5 · Read numbers up to 5/).length).toBeGreaterThan(0));
});
testPicker('starting a group opens the numeracy lesson', async () => {
  const view = mount(); fireEvent.press(await view.findByRole('button', { name: 'Start lesson' }));
  await waitFor(() => expect(view.routeNames().at(-1)).toBe('NumeracyLesson'));
  expect(view.navigationRef.getCurrentRoute().params).toEqual({ groupId: 'g1', upNextGroupId: 'g1', programmeId: 'programme-b' });
});
testPicker('an open numeracy draft reopens the numeracy lesson', async () => {
  await seedDraft('numeracy'); const view = mount();
  await waitFor(() => expect(view.routeNames()).toEqual(['Home', 'NumeracyLesson']));
  expect(view.navigationRef.getCurrentRoute().params).toEqual({ draftId: 'draft-1' });
});
testPicker('a leftover literacy draft offers Discard it, then the numeracy picker', async () => {
  await seedDraft('literacy'); const view = mount();
  await view.findByText("An older reading lesson is still open. It can't be saved now.");
  await discard(view, 'reading');
});
testPicker('a leftover corrupt draft can be discarded the same way', async () => {
  await seedDraft('literacy', true); const view = mount();
  await view.findByText("An older reading lesson is still open. It can't be saved now."); await discard(view, 'reading');
});
testPicker('the literacy picker never opens a leftover numeracy draft', async () => {
  await handle.withTransaction(db => db.runAsync("update staff_programme_assignments set programme_id = 'programme-a'"));
  await seedDraft('numeracy'); const view = mount('literacy');
  await view.findByText("An older numeracy lesson is still open. It can't be saved now."); await discard(view, 'numeracy');
});
testPicker('the literacy picker never opens a leftover corrupt numeracy draft', async () => {
  await handle.withTransaction(db => db.runAsync("update staff_programme_assignments set programme_id = 'programme-a'"));
  await seedDraft('numeracy', true); const view = mount('literacy');
  await view.findByText("An older numeracy lesson is still open. It can't be saved now."); await discard(view, 'numeracy');
});
testPicker('cached maths after a move to literacy lists no groups', async () => {
  rememberProgrammeSubject(handle, { code: 'numeracy' });
  await handle.withTransaction(db => db.runAsync("update staff_programme_assignments set programme_id = 'programme-a'"));
  const realGate = gate.getActiveProgrammeGate;
  // A cached subject mounts the child picker immediately. Its focus read runs before
  // the parent subject hook's read: allow the fresh picker read, then fail the hook.
  jest.spyOn(gate, 'getActiveProgrammeGate').mockImplementationOnce(realGate).mockImplementation(() => Promise.reject(new Error('subject read failed')));
  const view = mount('numeracy', true); await view.findByText(PROGRAMME_CHANGED_NOTE);
  expect(view.queryByText('Up next')).toBeNull(); expect(view.queryByText('Other groups')).toBeNull();
  expect(view.queryByRole('button', { name: 'Start lesson' })).toBeNull(); expect(view.routeNames()).toEqual(['Home', 'SessionForm']);
});
testPicker('a literacy coach still gets the literacy picker and Lesson route', async () => {
  await handle.withTransaction(db => db.runAsync("update staff_programme_assignments set programme_id = 'programme-a'"));
  await seedDraft('literacy'); const view = mount('literacy', true);
  await waitFor(() => expect(view.routeNames()).toEqual(['Home', 'Lesson']));
});
testPicker('the numeracy coming-soon text is gone', async () => {
  const view = mount('numeracy', true); await view.findByText('Up next'); expect(view.queryByText(/coming soon/)).toBeNull();
});
testPicker('picker rows are ready within budget', async () => {
  jest.useRealTimers();
  const base = await loadLessonBase({ handle, repositories: handle.repositories, today: '2026-11-01', programmeId: 'programme-b' });
  const ranking = await loadPickerRanking({ handle, repositories: handle.repositories, base, ...mockRoster });
  const load = jest.spyOn(numeracyInputs, 'loadNumeracyLessonInputs');
  const start = performance.now();
  const result = await loadNumeracyPickerNext({ handle, repositories: handle.repositories, services: handle.services, base, ranking });
  const ms = performance.now() - start;
  console.log(`Numeracy picker: ${ms.toFixed(1)} ms (target < 500 ms; soft ceiling 5000 ms)`);
  expect(ms).toBeLessThan(5000); expect(Object.keys(result.nextByGroup)).toHaveLength(6);
  expect(load).toHaveBeenCalledTimes(1); expect(load.mock.calls[0][0].participantChildIds).toHaveLength(36);
  expect(result.nextByGroup.g1).toEqual(['Count objects up to 5', 'Read numbers up to 5']);
});
