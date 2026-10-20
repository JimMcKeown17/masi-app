jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));
jest.mock('../src/services/supabaseClient', () => ({
  ...require('../test-support/supabaseTestConfig'), supabase: {},
}));
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useFocusEffect: callback => require('react').useEffect(callback, [callback]),
}));
jest.mock('../src/context/ChildrenContext', () => ({ useChildren: jest.fn() }));

import React from 'react';
import { fireEvent, within } from '@testing-library/react-native';
import { v4 as uuid } from 'uuid';
import { renderWithProviders } from '../test-support/renderWithProviders';
import { createFamilySyncFixture, questionResult } from '../test-support/assessmentFamilySyncTestUtils';
import { LETTER_SOUNDS_2026_1_EN } from '../src/assessment-questions/itemsets';
import { AuthContext } from '../src/context/AuthContext';
import { SignedInEAContext } from '../src/context/SignedInEAContext';
import { useChildren } from '../src/context/ChildrenContext';
import AssessmentHistoryScreen from '../src/screens/assessments/AssessmentHistoryScreen';
import AssessmentDetailScreen from '../src/screens/assessments/AssessmentDetailScreen';
import { createChildClassMembershipsRepository } from '../src/db/repositories/childClassMembershipsRepository';
import { bindTestActor } from '../test-support/actorTestUtils';
import {
  getAssessmentCoverage, getCoverageFromCounts, getAssessmentsTabStats, getChildrenTabStats, getLetterScoreRanking,
} from '../src/utils/dashboardStats';

const letterResult = (score = 20) => questionResult(60, {
  items: LETTER_SOUNDS_2026_1_EN.rows.flatMap((row, rowIndex) => row.map((prompt, column) => {
    const position = rowIndex * row.length + column;
    return {
      position, item_key: `${position}-${prompt}`, prompt, is_correct: position < score,
      metadata: { row: rowIndex, column, reached: true },
    };
  })),
  derived: { total_correct: score, total_attempted: 60, percent: score / 60 * 100, last_attempted_position: 59 },
});

describe('readers share stored standalone and battery Question evidence', () => {
  let f, children, year, ids;
  beforeEach(async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-10-20T12:00:00.000Z'));
    f = await createFamilySyncFixture();
    year = { id: uuid(), label: '2026', starts_on: '2026-01-15', ends_on: '2026-12-15', is_active: 1 };
    await f.db.runAsync(`insert into academic_years (id, label, starts_on, ends_on, is_active)
      values (?, ?, ?, ?, ?)`, year.id, year.label, year.starts_on, year.ends_on, year.is_active);
    children = ['A', 'B', 'C', 'D'].map((name, index) => ({
      id: index === 0 ? f.childId : uuid(), first_name: name, last_name: 'Child',
    }));
    await f.db.runAsync("update children set first_name = 'A' where id = ?", f.childId);
    for (const child of children.slice(1)) {
      await f.db.runAsync('insert into children (id, first_name, last_name, created_by) values (?, ?, ?, ?)',
        child.id, child.first_name, child.last_name, f.userId);
    }
    const a = await f.save(60, { result: letterResult(20) });
    const runB = await f.start({ childId: children[1].id });
    const b = await f.save(60, {
      childId: children[1].id, batteryRunId: runB.id, result: letterResult(30),
    });
    await f.save(40, {
      childId: children[1].id, batteryRunId: runB.id,
      result: questionResult(40, {
        question_code: 'wela_plus_read_words', question_version: '2024.1',
        item_set_id: 'wela_plus_read_words@2024.1.en',
      }),
    });
    await f.runs.finalizeRun(runB.id);
    const runC = await f.start({ childId: children[2].id });
    await f.save(0, {
      childId: children[2].id, batteryRunId: runC.id,
      result: questionResult(0, { stopped_reason: 'skipped_child_refused', duration_ms: 0 }),
    });
    const d = await f.save(50, {
      childId: children[3].id,
      result: questionResult(50, { question_code: 'word_reading', item_set_id: 'word_reading@2026.1.en' }),
    });
    ids = { a: a.id, b: b.id, d: d.id, runB: runB.id, runC: runC.id };
    useChildren.mockReturnValue({ children, allChildren: children });
  });
  afterEach(async () => {
    await f?.db.closeAsync();
    jest.useRealTimers();
  });

  test('letters alone rank A and B and count their two results, irrespective of battery membership', async () => {
    const results = await f.assessments.getQuestionResults({ userId: f.userId, includeSkipped: true });
    expect(getLetterScoreRanking(children, results).map(row => row.child.id))
      .toEqual([children[1].id, children[0].id]);
    expect(getAssessmentsTabStats(children, results, year))
      .toEqual({ totalAssessments: 2, percentAssessed: 50, avgScore: 25 });
    expect(getChildrenTabStats(children, [], results, year).unassessedCount).toBe(2);
    const counts = await f.assessments.getAssessmentCountsSince({ userId: f.userId });
    expect(counts).toEqual(expect.arrayContaining([
      { child_id: children[0].id, count: 1 }, { child_id: children[1].id, count: 1 },
    ]));
    expect(counts).toHaveLength(2);
    expect(getCoverageFromCounts(children, counts)).toEqual({ assessed: 2, total: 4, percent: 50 });
    expect(getAssessmentCoverage(children, results, year)).toEqual({ assessed: 2, total: 4, percent: 50 });
  });

  const renderReader = element => renderWithProviders(
    <AuthContext.Provider value={{ user: { id: f.userId } }}>
      <SignedInEAContext.Provider value={{ repositories: { assessments: f.assessments, batteryRuns: f.runs } }}>
        {element}
      </SignedInEAContext.Provider>
    </AuthContext.Provider>
  );

  test('history renders four rows, keeps both runs read-only, and opens standalone detail by id', async () => {
    const navigation = { navigate: jest.fn() };
    const screen = renderReader(<AssessmentHistoryScreen navigation={navigation} />);
    await screen.findByText('WelaPLUS · Completed · 2 Questions');
    expect(screen.getByText('WelaPLUS · In progress · 1 Questions')).toBeTruthy();
    expect(screen.getAllByText(/^[ABCD] Child$/)).toHaveLength(4);
    expect(screen.getByText('Letter Sounds')).toBeTruthy();
    expect(screen.getByText('Word Reading')).toBeTruthy();
    fireEvent.press(screen.getByText('B Child'));
    fireEvent.press(screen.getByText('C Child'));
    expect(navigation.navigate).not.toHaveBeenCalled();
    fireEvent.press(screen.getByText('A Child'));
    expect(navigation.navigate).toHaveBeenCalledWith('AssessmentDetail', {
      assessmentId: ids.a, childName: 'A Child',
    });
  });

  test('the saved standalone letter result opens a detail grid of five stored rows of twelve', async () => {
    const screen = renderReader(<AssessmentDetailScreen route={{ params: { assessmentId: ids.a, childName: 'A Child' } }} />);
    const rows = await screen.findAllByTestId('assessment-detail-row');
    expect(rows).toHaveLength(5);
    rows.forEach(row => expect(within(row).getAllByTestId('assessment-detail-item')).toHaveLength(12));
    expect(screen.getByText('20 / 60')).toBeTruthy();
  });

  test.each([
    ['2026-01-14', 2], ['2026-01-15', 3], ['2026-12-15', 3], ['2026-12-16', 2],
  ])('academic-year DATE boundaries include only eligible results on %s', async (date, assessed) => {
    jest.setSystemTime(new Date(`${date}T12:00:00.000Z`));
    await f.save(60, { childId: children[2].id, result: letterResult(60) });
    const results = await f.assessments.getLetterResults({ userId: f.userId });
    expect(getAssessmentsTabStats(children, results, year).totalAssessments).toBe(assessed);
    const counts = await f.assessments.getAssessmentCountsSince({ userId: f.userId });
    expect(getCoverageFromCounts(children, counts).assessed).toBe(assessed);
  });

  test('without an active academic year all assessed counts and Avg score are zero', async () => {
    await f.db.runAsync('update academic_years set is_active = 0');
    const results = await f.assessments.getLetterResults({ userId: f.userId });
    const counts = await f.assessments.getAssessmentCountsSince({ userId: f.userId });
    expect(counts).toEqual([]);
    expect(getCoverageFromCounts(children, counts)).toEqual({ assessed: 0, total: 4, percent: 0 });
    expect(getAssessmentsTabStats(children, results, null))
      .toEqual({ totalAssessments: 0, percentAssessed: 0, avgScore: 0 });
    expect(getChildrenTabStats(children, [], results, null).unassessedCount).toBe(4);
    expect(getAssessmentCoverage(children, results, null)).toEqual({ assessed: 0, total: 4, percent: 0 });
  });

  test('Avg score averages only each active child’s latest raw letter score within the active year', async () => {
    jest.setSystemTime(new Date('2026-10-21T12:00:00.000Z'));
    await f.save(60, { result: letterResult(41) });
    jest.setSystemTime(new Date('2026-12-16T12:00:00.000Z'));
    await f.save(60, { result: letterResult(60) });
    const results = await f.assessments.getQuestionResults({ userId: f.userId });
    expect(getAssessmentsTabStats(children, results, year))
      .toEqual({ totalAssessments: 3, percentAssessed: 50, avgScore: 36 });
    expect(getAssessmentsTabStats(children.slice(1), results, year))
      .toEqual({ totalAssessments: 1, percentAssessed: 33, avgScore: 30 });
  });

  test('another EA’s saved letter result counts and ranks but stays out of this EA’s history', async () => {
    const otherUser = uuid();
    await f.db.runAsync(`insert into staff_programme_assignments (id, user_id, programme_id, assigned_at)
      values (?, ?, ?, '2026-01-15T00:00:00.000Z')`, uuid(), otherUser, f.programmeId);
    bindTestActor(f.db, otherUser);
    await f.save(60, { userId: otherUser, childId: children[2].id, result: letterResult(40) });
    bindTestActor(f.db, f.userId);
    const results = await f.assessments.getQuestionResults({ userId: f.userId });
    expect(getLetterScoreRanking(children, results).map(row => row.child.id))
      .toEqual([children[2].id, children[1].id, children[0].id]);
    expect(getAssessmentsTabStats(children, results, year).totalAssessments).toBe(3);
    const counts = await f.assessments.getAssessmentCountsSince({ userId: f.userId });
    expect(getCoverageFromCounts(children, counts).assessed).toBe(3);
    const screen = renderReader(<AssessmentHistoryScreen navigation={{ navigate: jest.fn() }} />);
    await screen.findByText('WelaPLUS · Completed · 2 Questions');
    expect(screen.getAllByText(/^[ABCD] Child$/)).toHaveLength(4);
  });

  test.each([
    ['midday', '2026-01-15T18:00:00.000Z', '2026-07-01T18:00:00.000Z'],
    ['after local midnight', '2026-01-14T23:30:00.000Z', '2026-06-30T23:30:00.000Z'],
  ])('grade bands follow local membership DATE boundaries (%s) and otherwise the current class', async (_, enrolledAt, exitedAt) => {
    const schoolId = uuid();
    await f.db.runAsync('insert into schools (id, name) values (?, ?)', schoolId, 'Test school');
    const classes = [{ id: uuid(), grade: 'R' }, { id: uuid(), grade: '1' }];
    for (const cls of classes) {
      await f.db.runAsync('insert into classes (id, school_id, name, grade, academic_year_id) values (?, ?, ?, ?, ?)',
        cls.id, schoolId, `Grade ${cls.grade}`, cls.grade, year.id);
    }
    const child = { ...children[0], class_id: classes[1].id };
    const memberships = createChildClassMembershipsRepository({ database: f.db });
    await memberships.save({
      id: uuid(), child_id: child.id, class_id: classes[0].id, academic_year_id: year.id,
      enrolled_at: enrolledAt, exited_at: exitedAt, created_by: f.userId,
    });
    await memberships.save({
      id: uuid(), child_id: child.id, class_id: classes[1].id, academic_year_id: year.id,
      enrolled_at: exitedAt, exited_at: null, created_by: f.userId,
    });
    const storedMemberships = await memberships.getAll();
    for (const [date, grade, band] of [
      ['2026-01-14', '1', 'okay'], // Before either membership: current class.
      ['2026-01-15', 'R', 'great'], // Enrollment date included even before its clock time.
      ['2026-06-30', 'R', 'great'],
      ['2026-07-01', '1', 'okay'], // Local exit date excluded; next class starts this date.
    ]) {
      // 00:30 SAST, before the move's clock time; the local DATE owns the boundary.
      jest.setSystemTime(new Date(`${date}T00:30:00.000+02:00`));
      const saved = await f.save(60, { result: letterResult(20) });
      const [result] = await f.assessments.getQuestionResults({ userId: f.userId, assessmentId: saved.id });
      expect(result.assessment_date).toBe(date);
      expect(getLetterScoreRanking([child], [result], classes, storedMemberships)[0])
        .toMatchObject({ score: 20, total: 60, grade, band });
    }
  });
});
