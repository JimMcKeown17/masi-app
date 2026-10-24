jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));
jest.mock('../src/context/SignedInEAContext', () => ({ useSignedInEA: jest.fn() }));
jest.mock('../src/context/ChildrenContext', () => ({ useChildren: jest.fn() }));
jest.mock('../src/context/ClassesContext', () => ({ useClasses: jest.fn() }));

import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { NavigationContext } from '@react-navigation/native';
import { useAssessableChildren } from '../src/hooks/useAssessableChildren';
import { useSignedInEA } from '../src/context/SignedInEAContext';
import { useChildren } from '../src/context/ChildrenContext';
import { useClasses } from '../src/context/ClassesContext';
import { runMigrations } from '../src/db/migrations';
import { createChildrenRepository } from '../src/db/repositories/childrenRepository';
import { createMigratedDatabase, seedCoreData } from '../test-support/sqliteRepositoryTestUtils';
import { StaleActorError } from '../src/session/staleActor';

let db;
let repository;
let handle;
let navigation;
let childrenValue;
let classesValue;
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const seedChild = async (id, firstName, isDelivery = false) => {
  await db.runAsync(`insert into children (id, first_name, last_name, class_id)
    values (?, ?, 'Surname', 'class-1')`, id, firstName);
  await db.runAsync(`insert into child_class_memberships (id, child_id, class_id, academic_year_id)
    values (?, ?, 'class-1', 'year-2026')`, `membership-${id}`, id);
  if (isDelivery) {
    await db.runAsync(`insert into child_ea_assignments (id, user_id, child_id)
      values (?, 'user-1', ?)`, `delivery-${id}`, id);
    await db.runAsync(`insert into child_programme_enrollments (id, child_id, programme_id)
      values (?, ?, 'programme-a')`, `enrollment-${id}`, id);
  }
};
const wrapper = ({ children }) => (
  <NavigationContext.Provider value={navigation}>{children}</NavigationContext.Provider>
);

beforeEach(async () => {
  db = await createMigratedDatabase(runMigrations);
  await seedCoreData(db);
  await db.runAsync(`insert into class_ea_assignments (id, class_id, ea_user_id, programme_id)
    values ('grant-1', 'class-1', 'user-1', 'programme-a')`);
  repository = createChildrenRepository({ database: db });
  handle = { userId: 'user-1', isCurrent: jest.fn(() => true) };
  useSignedInEA.mockImplementation(() => ({ handle, repositories: { children: repository } }));
  childrenValue = { children: [] };
  classesValue = { classes: [] };
  useChildren.mockImplementation(() => childrenValue);
  useClasses.mockImplementation(() => classesValue);
  let focused = true;
  const listeners = { focus: new Set(), blur: new Set() };
  navigation = {
    isFocused: () => focused,
    addListener: (event, callback) => {
      listeners[event].add(callback);
      return () => listeners[event].delete(callback);
    },
    emit: (event) => {
      focused = event === 'focus';
      listeners[event].forEach(callback => callback());
    },
  };
});
afterEach(async () => { jest.restoreAllMocks(); await db.closeAsync(); });

it('returns the exact shape, sorted delivery/rest sections, and delivery-first all rows from SQLite', async () => {
  await seedChild('delivery-z', 'Zola', true);
  await seedChild('delivery-b', 'Buhle', true);
  await seedChild('control-m', 'Mila');
  await seedChild('control-a', 'Amahle');
  const { result } = renderHook(useAssessableChildren, { wrapper });
  expect(result.current.loading).toBe(true);
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(Object.keys(result.current).sort()).toEqual(['all', 'loading', 'restOfClass', 'yourChildren']);
  expect(result.current.yourChildren.map(row => row.first_name)).toEqual(['Buhle', 'Zola']);
  expect(result.current.restOfClass.map(row => row.first_name)).toEqual(['Amahle', 'Mila']);
  expect(result.current.all.map(row => row.id)).toEqual(['delivery-b', 'delivery-z', 'control-a', 'control-m']);
  expect(result.current.all.every(row => typeof row.is_delivery === 'boolean')).toBe(true);
});

it('reloads after each context list identity changes but not an unrelated render', async () => {
  await seedChild('initial', 'Initial');
  const read = jest.spyOn(repository, 'getAssessableChildren');
  const { result, rerender } = renderHook(useAssessableChildren, { wrapper });
  await waitFor(() => expect(result.current.all).toHaveLength(1));
  rerender({});
  expect(read).toHaveBeenCalledTimes(1);
  await seedChild('children-change', 'Children change');
  childrenValue = { children: [] };
  rerender({});
  await waitFor(() => expect(result.current.all).toHaveLength(2));
  expect(read).toHaveBeenCalledTimes(2);
  await seedChild('classes-change', 'Classes change');
  classesValue = { classes: [] };
  rerender({});
  await waitFor(() => expect(result.current.all).toHaveLength(3));
  expect(read).toHaveBeenCalledTimes(3);
});

it.each(['children', 'classes', 'rosterVersion', 'assignmentsVersion'])(
  'keeps loading false and previous rows visible while a same-handle %s refetch is pending',
  async (dependency) => {
    await seedChild('initial', 'Initial');
    const { result, rerender } = renderHook(useAssessableChildren, { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    const previousRows = result.current.all;
    await seedChild('new', 'New');
    const newRows = await repository.getAssessableChildren(handle.userId);
    const pending = deferred();
    const read = jest.spyOn(repository, 'getAssessableChildren').mockReturnValueOnce(pending.promise);
    if (dependency === 'children') childrenValue = { ...childrenValue, children: [] };
    if (dependency === 'classes') classesValue = { ...classesValue, classes: [] };
    if (dependency === 'rosterVersion') childrenValue = { ...childrenValue, rosterVersion: 1 };
    if (dependency === 'assignmentsVersion') classesValue = { ...classesValue, assignmentsVersion: 1 };
    rerender({});
    expect(read).toHaveBeenCalledTimes(1);
    expect(result.current.loading).toBe(false);
    expect(result.current.all).toBe(previousRows);
    await act(async () => { pending.resolve(newRows); });
    expect(result.current.all.map(row => row.id)).toEqual(['initial', 'new']);
    expect(result.current.loading).toBe(false);
  },
);

it('reloads SQLite on screen focus even with unchanged context lists', async () => {
  await seedChild('initial', 'Initial');
  const { result } = renderHook(useAssessableChildren, { wrapper });
  await waitFor(() => expect(result.current.all).toHaveLength(1));
  act(() => navigation.emit('blur'));
  await seedChild('offline-change', 'Offline change');
  act(() => navigation.emit('focus'));
  await waitFor(() => expect(result.current.all).toHaveLength(2));
});

it('ignores an older pending read after a context refresh has published newer SQLite data', async () => {
  const pending = deferred();
  const read = repository.getAssessableChildren;
  jest.spyOn(repository, 'getAssessableChildren').mockImplementationOnce(() => pending.promise)
    .mockImplementation(read);
  const { result, rerender } = renderHook(useAssessableChildren, { wrapper });
  await seedChild('new', 'New');
  childrenValue = { children: [] };
  rerender({});
  await waitFor(() => expect(result.current.all.map(row => row.id)).toEqual(['new']));
  await act(async () => { pending.resolve([{ id: 'old', first_name: 'Old', is_delivery: false }]); });
  expect(result.current.all.map(row => row.id)).toEqual(['new']);
  expect(result.current.loading).toBe(false);
});

it('does not publish a read that completes while its screen is blurred', async () => {
  const pending = deferred();
  jest.spyOn(repository, 'getAssessableChildren').mockImplementationOnce(() => pending.promise);
  const { result } = renderHook(useAssessableChildren, { wrapper });
  act(() => navigation.emit('blur'));
  await act(async () => { pending.resolve([{ id: 'old', first_name: 'Old', is_delivery: false }]); });
  expect(result.current.all).toEqual([]);
  act(() => navigation.emit('focus'));
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.all).toEqual([]);
});

it('does not publish old-EA rows after the signed-in handle changes', async () => {
  const pending = deferred();
  jest.spyOn(repository, 'getAssessableChildren').mockImplementationOnce(() => pending.promise);
  const { result, rerender } = renderHook(useAssessableChildren, { wrapper });
  const oldHandle = handle;
  oldHandle.isCurrent.mockReturnValue(false);
  handle = { userId: 'user-2', isCurrent: () => true };
  rerender({});
  await waitFor(() => expect(result.current.loading).toBe(false));
  await act(async () => { pending.resolve([{ id: 'old-ea', first_name: 'Old EA', is_delivery: true }]); });
  expect(result.current.all).toEqual([]);
  expect(result.current.loading).toBe(false);
});

it('hides previous rows immediately on a handle change and loads until the new handle fetch settles', async () => {
  await seedChild('previous-ea', 'Previous EA');
  const { result, rerender } = renderHook(useAssessableChildren, { wrapper });
  await waitFor(() => expect(result.current.all).toHaveLength(1));
  const pending = deferred();
  jest.spyOn(repository, 'getAssessableChildren').mockImplementationOnce(() => pending.promise);
  handle.isCurrent.mockReturnValue(false);
  handle = { userId: 'user-2', isCurrent: () => true };
  rerender({});
  expect(result.current.all).toEqual([]);
  expect(result.current.loading).toBe(true);
  const newRows = [{ id: 'new-ea', first_name: 'New EA', is_delivery: false }];
  await act(async () => { pending.resolve(newRows); });
  expect(result.current.all).toEqual(newRows);
  expect(result.current.loading).toBe(false);
});

it('keeps previous rows and loading false after a same-handle refetch rejects', async () => {
  await seedChild('initial', 'Initial');
  const errorLog = jest.spyOn(console, 'error').mockImplementation(() => {});
  const { result, rerender } = renderHook(useAssessableChildren, { wrapper });
  await waitFor(() => expect(result.current.all).toHaveLength(1));
  const previousRows = result.current.all;
  const pending = deferred();
  const error = new Error('SQLite read failed');
  jest.spyOn(repository, 'getAssessableChildren').mockReturnValueOnce(pending.promise);
  classesValue = { classes: [] };
  rerender({});
  await act(async () => { pending.reject(error); });
  expect(result.current.loading).toBe(false);
  expect(result.current.all).toBe(previousRows);
  expect(errorLog).toHaveBeenCalledWith('Error loading assessable children:', error);
});

it('settles a first-load error with empty rows and loading false', async () => {
  const errorLog = jest.spyOn(console, 'error').mockImplementation(() => {});
  const error = new Error('SQLite read failed');
  const pending = deferred();
  jest.spyOn(repository, 'getAssessableChildren').mockReturnValueOnce(pending.promise);
  const { result } = renderHook(useAssessableChildren, { wrapper });
  expect(result.current.loading).toBe(true);
  expect(result.current.all).toEqual([]);
  await act(async () => { pending.reject(error); });
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.all).toEqual([]);
  expect(errorLog).toHaveBeenCalledWith('Error loading assessable children:', error);
});

it('refuses a stale actor failure without logging it as a database error or retrying', async () => {
  const errorLog = jest.spyOn(console, 'error').mockImplementation(() => {});
  const read = jest.spyOn(repository, 'getAssessableChildren').mockRejectedValue(new StaleActorError());
  const { result } = renderHook(useAssessableChildren, { wrapper });
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.all).toEqual([]);
  expect(read).toHaveBeenCalledTimes(1);
  expect(errorLog).not.toHaveBeenCalled();
});
