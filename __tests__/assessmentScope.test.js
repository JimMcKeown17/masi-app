global.__MASI_NO_DEFAULT_HANDLE__ = true;
jest.mock('../src/services/assessmentHistoryStatus', () => ({
  ...jest.requireActual('../src/services/assessmentHistoryStatus'),
  useAssessmentHistoryStatus: () => ({ running: false, pageVersion: 0, runVersion: 0 }),
}));
jest.mock('../src/services/sessionHistoryStatus', () => ({
  ...jest.requireActual('../src/services/sessionHistoryStatus'),
  useSessionHistoryStatus: () => ({ pageVersion: 0, runVersion: 0 }),
}));
jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));
jest.mock('@expo/vector-icons', () => new Proxy({}, { get: (target, key) => {
  if (key === '__esModule') return true;
  return target[key] || (target[key] = () => null);
} }), { virtual: true });
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useIsFocused: () => true,
  useFocusEffect: callback => require('react').useEffect(callback, [callback]),
}));
jest.mock('../src/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'user-1' }, profile: {} }) }));
jest.mock('../src/context/OfflineContext', () => ({ useOffline: () => ({
  isOnline: false, isSyncing: false, waitingCount: 0, needsAttentionCount: 0,
  refreshSyncStatus: jest.fn(async () => {}), syncNow: jest.fn(async () => ({})),
}) }));
jest.mock('../src/hooks/useTimeTracking', () => ({ useTimeTracking: () => ({
  isSignedIn: false, activeEntry: null, loadingLocation: false,
  handleSignIn: jest.fn(), handleSignOut: jest.fn(), autoClockOutNotice: null,
}) }));
let mockChildrenState, mockClassesState;
jest.mock('../src/context/ChildrenContext', () => ({ useChildren: () => mockChildrenState }));
jest.mock('../src/context/ClassesContext', () => ({ useClasses: () => mockClassesState }));

import React from 'react';
import { act, cleanup, configure, fireEvent } from '@testing-library/react-native';
import { renderWithProviders } from '../test-support/renderWithProviders';
import { SignedInEAContext } from '../src/context/SignedInEAContext';
import { createMigratedDatabase, seedCoreData } from '../test-support/sqliteRepositoryTestUtils';
import { runMigrations } from '../src/db/migrations';
import { createChildrenRepository } from '../src/db/repositories/childrenRepository';
import { createAssessmentsRepository } from '../src/db/repositories/assessmentsRepository';
import { createReferenceDataRepository } from '../src/db/repositories/referenceDataRepository';
import { createSessionsRepository } from '../src/db/repositories/sessionsRepository';
import { createChildClassMembershipsRepository } from '../src/db/repositories/childClassMembershipsRepository';
import { createMasteryRepository } from '../src/db/repositories/masteryRepository';
import { createBatteryRunsRepository } from '../src/db/repositories/batteryRunsRepository';
import AssessmentsScreen from '../src/screens/main/AssessmentsScreen';
import HomeScreen from '../src/screens/main/HomeScreen';
import ChildrenListScreen from '../src/screens/main/ChildrenListScreen';
import AssessmentRankingScreen from '../src/screens/insights/AssessmentRankingScreen';
import ChildSelector from '../src/components/children/ChildSelector';
import GroupPickerBottomSheet from '../src/components/children/GroupPickerBottomSheet';
import ClassDetailScreen from '../src/screens/children/ClassDetailScreen';
import SessionCountRankingScreen from '../src/screens/insights/SessionCountRankingScreen';
import LetterMasteryRankingScreen from '../src/screens/insights/LetterMasteryRankingScreen';
import { getSessionsTabStats } from '../src/utils/dashboardStats';
import { getSessionsTodayGoal } from '../src/services/sessionsTodayGoal';
import { createGroupsRepository } from '../src/db/repositories/groupsRepository';
import AssessmentChildSelectScreen from '../src/screens/assessments/AssessmentChildSelectScreen';

let db, repositories, signedIn, delivery, assessable;
const navigation = { navigate: jest.fn(), setOptions: jest.fn() };
const renderScreen = element => renderWithProviders(
  <SignedInEAContext.Provider value={signedIn}>{element}</SignedInEAContext.Provider>
);
beforeEach(async () => {
  configure({ asyncUtilTimeout: 30000 });
  db = await createMigratedDatabase(runMigrations);
  await seedCoreData(db);
  await db.runAsync("update classes set home_language = 'Afrikaans', grade = '2' where id = 'class-1'");
  await db.runAsync(`insert into class_ea_assignments (id, class_id, ea_user_id, programme_id, sync_status)
    values ('class-grant', 'class-1', 'user-1', 'programme-a', 'synced')`);
  const children = createChildrenRepository({ database: db });
  await children.save({ id: 'delivery', first_name: 'Dina', last_name: 'Delivery', class_id: 'class-1',
    created_by: 'office', synced: true }, { actorUserId: 'user-1' });
  await children.saveChildRecord({ id: 'control', first_name: 'Cora', last_name: 'Control',
    class_id: null, created_by: 'office', synced: true });
  await children.saveChildClassMembership({ id: 'control-membership', child_id: 'control', class_id: 'class-1',
    academic_year_id: 'year-2026', enrolled_at: '2026-01-15', synced: true });
  await db.runAsync(`insert into groups (id, name, class_id, programme_id, created_by, display_number, sync_status)
    values ('delivery-group', 'Group 1', 'class-1', 'programme-a', 'user-1', 1, 'synced')`);
  await db.runAsync(`insert into group_ea_assignments (id, group_id, ea_user_id, programme_id, created_by, sync_status)
    values ('group-grant', 'delivery-group', 'user-1', 'programme-a', 'user-1', 'synced')`);
  await db.runAsync(`insert into child_group_memberships (id, group_id, child_id, created_by, sync_status)
    values ('delivery-group-member', 'delivery-group', 'delivery', 'user-1', 'synced')`);
  await db.runAsync('delete from sync_outbox');
  repositories = { children, assessments: createAssessmentsRepository({ database: db }),
    academicYears: createReferenceDataRepository({ database: db, tableName: 'academic_years' }),
    programmes: createReferenceDataRepository({ database: db, tableName: 'programmes' }),
    sessions: createSessionsRepository({ database: db }),
    childClassMemberships: createChildClassMembershipsRepository({ database: db }),
    mastery: createMasteryRepository({ database: db }), batteryRuns: createBatteryRunsRepository({ database: db }),
  };
  await db.runAsync("update programmes set daily_session_target = 3, daily_session_ceiling = 5 where id = 'programme-a'");
  const handle = { userId: 'user-1', isCurrent: () => true, getReader: async () => db, repositories };
  signedIn = { handle, repositories, services: {
    homeAttention: { getAssessmentDismissedOn: async () => null, dismissAssessmentForDay: jest.fn() },
    assessmentHistory: { store: { getPullStates: async () => ({ batteryRuns: null, assessments: null }) }, start: async () => {} },
  } };
  delivery = await children.getMyChildren('user-1');
  assessable = await children.getAssessableChildren('user-1');
  const groupsRepository = createGroupsRepository({ database: db });
  const groups = await groupsRepository.getGroups({ userId: 'user-1' });
  const childrenGroups = await groupsRepository.getVisibleChildrenGroups({ userId: 'user-1' });
  mockChildrenState = { children: delivery, allChildren: delivery, childrenGroups, groups,
    getChildrenInGroup: groupId => delivery.filter(child => childrenGroups.some(member => member.child_id === child.id && member.group_id === groupId)),
    loading: false, loadChildren: jest.fn() };

  mockClassesState = { classes: [{ id: 'class-1', name: 'Class 1', grade: '1', home_language: 'English' }],
    loading: false, assignmentsVersion: 0, classBootstrapStatus: 'available',
    getChildrenInClass: () => delivery, schools: [], loadClasses: jest.fn() };
  navigation.navigate.mockClear();
});
afterEach(async () => { cleanup(); jest.restoreAllMocks(); await db.closeAsync(); });

test('the standalone picker separates delivery and control children and launches with membership language', async () => {
  const screen = renderScreen(<AssessmentChildSelectScreen navigation={navigation} route={{ params: { testCode: 'letter_sounds' } }} />);
  expect(await screen.findByRole('header', { name: 'Your children' })).toBeTruthy();
  expect(await screen.findByRole('header', { name: 'Rest of the class' })).toBeTruthy();
  expect(screen.getAllByRole('button', { name: /^Select .* for assessment$/ }).map(row => row.props.accessibilityLabel))
    .toEqual(['Select Dina Delivery for assessment', 'Select Cora Control for assessment']);
  fireEvent.press(screen.getByRole('button', { name: 'Select Cora Control for assessment' }));
  expect(navigation.navigate).toHaveBeenCalledWith('StandaloneTest', {
    testCode: 'letter_sounds', child: expect.objectContaining({ id: 'control', class_id: 'class-1',
      grade: '2', home_language: 'Afrikaans', is_delivery: false }), languageCode: 'af',
  });
});


const saveDeliveryAssessment = () => db.runAsync(`
  insert into assessments (id, user_id, child_id, programme_id, assessment_type, question_code,
    assessment_date, score, total_items, language, stopped_reason, derived, sync_status)
  values ('delivery-result', 'user-1', 'delivery', 'programme-a', 'letter_sounds', 'letter_sounds',
    '2026-06-01', 1, 1, 'af', 'completed', '{"percent":100}', 'synced')
`);

test('Assessments coverage includes the control child in its denominator', async () => {
  await saveDeliveryAssessment();
  const screen = renderScreen(<AssessmentsScreen navigation={navigation} />);
  expect(await screen.findByText('50%')).toBeTruthy();
});

test('Home coverage and assessment-due card include the control child without changing the daily target', async () => {
  await saveDeliveryAssessment();
  const screen = renderScreen(<HomeScreen navigation={navigation} />);
  expect(await screen.findByText('1 of 2 children assessed')).toBeTruthy();
  expect(screen.getByText('1 child to assess')).toBeTruthy();
  expect(screen.getByLabelText('0 of 3 sessions today. Below target.')).toBeTruthy();
});

test('Children tab counts delivery children but includes the control child in Unassessed', async () => {
  const screen = renderScreen(<ChildrenListScreen navigation={navigation} />);
  expect(await screen.findByLabelText('1 child')).toBeTruthy();
  expect(await screen.findByRole('button', { name: '2 unassessed children. Open Assess' })).toBeTruthy();
  expect(screen.queryByText('Cora Control')).toBeNull();
});

test('assessment ranking includes the control child among the not-assessed rows', async () => {
  const screen = renderScreen(<AssessmentRankingScreen navigation={navigation} />);
  expect(await screen.findByText('Cora C.')).toBeTruthy();
  expect(screen.getAllByText('Not assessed')).toHaveLength(2);
});


test('search covers both picker sections and hides an empty section', async () => {
  const screen = renderScreen(<AssessmentChildSelectScreen navigation={navigation} route={{ params: { testCode: 'letter_sounds' } }} />);
  await screen.findByText('Cora Control');
  fireEvent.changeText(screen.getByLabelText('Search children...'), 'cOrA');
  expect(screen.getByRole('header', { name: 'Rest of the class' })).toBeTruthy();
  expect(screen.queryByRole('header', { name: 'Your children' })).toBeNull();
  expect(screen.queryByText('Dina Delivery')).toBeNull();
  fireEvent.changeText(screen.getByLabelText('Search children...'), 'dINa');
  expect(screen.getByRole('header', { name: 'Your children' })).toBeTruthy();
  expect(screen.queryByRole('header', { name: 'Rest of the class' })).toBeNull();
  fireEvent.changeText(screen.getByLabelText('Search children...'), 'missing');
  expect(screen.queryAllByRole('header')).toHaveLength(0);
  expect(screen.getByText('No children match your search.')).toBeTruthy();
});

test('an empty Rest of the class section is omitted from an otherwise populated picker', async () => {
  await db.runAsync("update child_class_memberships set exited_at = '2026-10-23' where child_id = 'control'");
  const screen = renderScreen(<AssessmentChildSelectScreen navigation={navigation} route={{ params: { testCode: 'letter_sounds' } }} />);
  expect(await screen.findByRole('header', { name: 'Your children' })).toBeTruthy();
  expect(screen.queryByRole('header', { name: 'Rest of the class' })).toBeNull();
});

test('an empty Your children section is omitted when a class-only EA opens the picker', async () => {
  await db.runAsync('update child_ea_assignments set unassigned_at = ?', new Date().toISOString());
  mockChildrenState = { ...mockChildrenState, children: [], allChildren: [] };
  const screen = renderScreen(<AssessmentChildSelectScreen navigation={navigation} route={{ params: { testCode: 'letter_sounds' } }} />);
  expect(await screen.findByRole('header', { name: 'Rest of the class' })).toBeTruthy();
  expect(screen.queryByRole('header', { name: 'Your children' })).toBeNull();
});

test('My Children and the session attendee picker stay delivery-scoped even though assessment scope has both children', async () => {
  expect(delivery.map(child => child.id)).toEqual(['delivery']);
  expect(assessable.map(child => child.id).sort()).toEqual(['control', 'delivery']);
  const selection = jest.fn();
  const screen = renderScreen(<ChildSelector selectedChildren={[]} onSelectionChange={selection} />);
  expect(await screen.findByRole('checkbox', { name: 'Dina Delivery, Class 1' })).toBeTruthy();
  expect(screen.queryByText('Cora Control')).toBeNull();
  fireEvent.press(screen.getByRole('checkbox', { name: 'Dina Delivery, Class 1' }));
  expect(selection).toHaveBeenCalledWith([expect.objectContaining({ id: 'delivery' })]);
});

test('group picker membership counts stay delivery-scoped', async () => {
  const screen = renderScreen(<GroupPickerBottomSheet visible onDismiss={jest.fn()}
    childId="delivery" childName="Dina Delivery" currentGroupId={null} />);
  expect(await screen.findByRole('button', { name: 'Assign Dina Delivery to Group 1' })).toBeTruthy();
  expect(screen.getByText('1 child')).toBeTruthy();
  expect(screen.queryByText('2 children')).toBeNull();
  expect(screen.queryByText('Cora Control')).toBeNull();
});

test('daily targets and sessions tab statistics do not gain control children', async () => {
  expect(await getSessionsTodayGoal({ handle: signedIn.handle, userId: 'user-1' }))
    .toMatchObject({ target: 3, ceiling: 5, count: 0 });
  const stats = getSessionsTabStats([], delivery, 'user-1');
  expect(stats.notSeenThisWeek.map(child => child.id)).toEqual(['delivery']);
  expect(stats.avgPerChild).toBe(0);
});

test.each([
  ['session count ranking', SessionCountRankingScreen],
  ['letter mastery ranking', LetterMasteryRankingScreen],
])('%s stays delivery-scoped', async (_name, Screen) => {
  const screen = renderScreen(<Screen navigation={navigation} />);
  expect(await screen.findByText('Dina D.')).toBeTruthy();
  expect(screen.queryByText('Cora C.')).toBeNull();
});

test('ClassDetail continues to show delivery children only', async () => {
  const screen = renderScreen(<ClassDetailScreen navigation={navigation} route={{ params: { classId: 'class-1' } }} />);
  expect(await screen.findByText('Dina Delivery')).toBeTruthy();
  expect(screen.queryByText('Cora Control')).toBeNull();
});

test('each picker section keeps the existing unassessed-first and oldest-result-first ordering', async () => {
  await repositories.children.save({ id: 'new-delivery', first_name: 'Zola', last_name: 'Delivery',
    class_id: 'class-1', created_by: 'office', synced: true }, { actorUserId: 'user-1' });
  await repositories.children.saveChildRecord({ id: 'new-control', first_name: 'Ava', last_name: 'Control',
    created_by: 'office', synced: true });
  await repositories.children.saveChildClassMembership({ id: 'new-control-member', child_id: 'new-control',
    class_id: 'class-1', academic_year_id: 'year-2026', enrolled_at: '2026-01-15', synced: true });
  mockChildrenState = { ...mockChildrenState, children: await repositories.children.getMyChildren('user-1') };
  await saveDeliveryAssessment();
  await db.runAsync(`insert into assessments (id, user_id, child_id, programme_id, assessment_type, question_code,
    assessment_date, score, total_items, language, stopped_reason, sync_status)
    values ('control-result', 'other-ea', 'control', 'programme-a', 'letter_sounds', 'letter_sounds',
      '2026-05-01', 1, 1, 'af', 'completed', 'synced')`);
  const screen = renderScreen(<AssessmentChildSelectScreen navigation={navigation} route={{ params: { testCode: 'letter_sounds' } }} />);
  await screen.findByText('Zola Delivery');
  await screen.findByText(/Last assessed: Jun 1/);
  expect(screen.getAllByRole('header').map(header => header.props.children)).toEqual(['Your children', 'Rest of the class']);
  expect(screen.getAllByRole('button', { name: /^Select .* for assessment$/ }).map(row => row.props.accessibilityLabel))
    .toEqual(['Select Zola Delivery for assessment', 'Select Dina Delivery for assessment',
      'Select Ava Control for assessment', 'Select Cora Control for assessment']);
});

test('the picker waits for its SQLite roster instead of claiming no children exist', async () => {
  let release;
  const read = repositories.children.getAssessableChildren;
  jest.spyOn(repositories.children, 'getAssessableChildren').mockImplementationOnce(async actor => {
    await new Promise(resolve => { release = resolve; });
    return read(actor);
  });
  const screen = renderScreen(<AssessmentChildSelectScreen navigation={navigation} route={{ params: { testCode: 'letter_sounds' } }} />);
  expect(screen.getByText('Loading children…')).toBeTruthy();
  expect(screen.queryByText('No children found. Add children first.')).toBeNull();
  await act(async () => { release(); });
  expect(await screen.findByRole('header', { name: 'Rest of the class' })).toBeTruthy();
});
