import React, { createContext, useState, useEffect, useContext, useRef, useCallback, useMemo } from 'react';
import { supabase } from '../services/supabaseClient';
import { ensureReferenceData, fetchAndCacheSchools } from '../services/offlineSync';
import { enqueueSupabaseRequest } from '../services/supabaseRequestQueue';
import {
  academicYearsRepository,
  schoolsRepository,
} from '../db/repositories/referenceDataRepository';
import { getActiveProgrammeId } from '../db/repositories/domainRepositoryUtils';
import { classesRepository } from '../db/repositories/classesRepository';
import { classEaAssignmentsRepository } from '../db/repositories/classEaAssignmentsRepository';
import { syncStateRepository } from '../db/repositories/syncStateRepository';
import {
  classifyPullFailureKind,
  PULL_SCOPE_COMPLETENESS_LIMIT,
} from '../services/preloadedChildData';
import { resolveDatabase } from '../db/repositories/repositoryRuntime';
import { useAuth } from './AuthContext';
import { useOffline } from './OfflineContext';
import { useChildren } from './ChildrenContext';
import { v4 as uuidv4 } from 'uuid';

const ClassesContext = createContext({});

const successfulPullScope = (rows = []) => ({
  ok: true,
  rows,
  complete: rows.length < PULL_SCOPE_COMPLETENESS_LIMIT,
  failureKind: null,
});

const failedPullScope = (failureKind, error) => ({
  ok: false,
  rows: [],
  complete: false,
  failureKind,
  ...(error ? { error } : {}),
});

const dependencyPullScope = () => failedPullScope('dependency');

export const ClassesProvider = ({ children: reactChildren }) => {
  const { user } = useAuth();
  const { isOnline, refreshSyncStatus, isSyncing, domainPullNonce = 0 } = useOffline();
  const {
    children: childrenList,
    refreshFromCache: refreshChildrenFromCache,
  } = useChildren();

  const [schools, setSchools] = useState([]);
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(false);
  const activeUserIdRef = useRef(null);
  const activePullRef = useRef(null);
  const previousDomainPullNonceRef = useRef(domainPullNonce);
  activeUserIdRef.current = user?.id || null;

  const refreshFromCache = useCallback(async () => {
    const activeUserId = user?.id;
    if (!activeUserId) {
      setClasses([]);
      return;
    }

    const cached = await classesRepository.getClasses({ userId: activeUserId });
    if (activeUserIdRef.current !== activeUserId) return;
    setClasses(cached);
  }, [user?.id]);

  /**
   * Load schools — cache-first, then always attempt a server fetch.
   * We don't gate on isOnline because it can be stale (race condition on mount).
   * If the fetch fails (offline / network error), we just keep the cached data.
   */
  const loadSchools = useCallback(async () => {
    try {
      const activeUserId = user?.id;
      const cached = await schoolsRepository.getAll();
      if (activeUserIdRef.current !== activeUserId) return;
      setSchools(cached);

      try {
        const serverSchools = await fetchAndCacheSchools();
        if (activeUserIdRef.current !== activeUserId) return;
        setSchools(serverSchools);
      } catch (error) {
        console.log('Could not fetch schools from server (likely offline):', error.message);
        // Keep cached data — it's fine to be stale
      }
    } catch (error) {
      console.error('Error in loadSchools:', error);
    }
  }, [user?.id]);

  const performPullFromServer = useCallback(async () => {
    const activeUserId = user?.id;
    if (!activeUserId) {
      setClasses([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      await refreshFromCache();

      const pulled = await enqueueSupabaseRequest(async () => {
        const { data: assignments, error: assignmentError } = await supabase
          .from('staff_programme_assignments')
          .select('programme_id')
          .eq('user_id', activeUserId)
          .is('ended_at', null)
          .order('assigned_at', { ascending: false })
          .limit(1);

        if (assignmentError) {
          return {
            activeProgrammeId: null,
            scopes: {
              programmeAssignment: failedPullScope(classifyPullFailureKind(assignmentError), assignmentError),
              classes: dependencyPullScope(),
              classEaAssignments: dependencyPullScope(),
            },
          };
        }

        const programmeAssignment = successfulPullScope(assignments || []);
        const activeProgrammeId = assignments?.[0]?.programme_id || null;
        if (!activeProgrammeId) {
          return {
            activeProgrammeId: null,
            scopes: {
              programmeAssignment,
              classes: dependencyPullScope(),
              classEaAssignments: dependencyPullScope(),
            },
          };
        }

        const { data, error } = await supabase
          .from('classes')
          .select(`
            *,
            class_ea_assignments!inner(*)
          `)
          .eq('class_ea_assignments.ea_user_id', activeUserId)
          .eq('class_ea_assignments.programme_id', assignments[0].programme_id)
          .is('class_ea_assignments.unassigned_at', null)
          .order('name', { ascending: true });

        if (error) {
          return {
            activeProgrammeId,
            scopes: {
              programmeAssignment,
              classes: failedPullScope(classifyPullFailureKind(error), error),
              classEaAssignments: dependencyPullScope(),
            },
          };
        }

        const classRows = data || [];
        const serverAssignments = classRows.flatMap(({ class_ea_assignments }) => (
          (class_ea_assignments || []).map(assignment => ({
            ...assignment,
            synced: true,
            sync_status: assignment.sync_status || 'synced',
          }))
        ));
        const serverClasses = classRows.map(({ class_ea_assignments, ...classItem }) => ({
          ...classItem,
          synced: true,
          sync_status: classItem.sync_status || 'synced',
        }));

        return {
          activeProgrammeId,
          scopes: {
            programmeAssignment,
            classes: successfulPullScope(serverClasses),
            classEaAssignments: successfulPullScope(serverAssignments),
          },
        };
      });

      if (activeUserIdRef.current !== activeUserId) return;
      const { activeProgrammeId, scopes } = pulled;
      const pulledAt = new Date().toISOString();
      const stampPullIfComplete = async (reconcileResults = []) => {
        if (activeUserIdRef.current !== activeUserId) return;
        const transportFailed = Object.values(scopes)
          .some((scope) => scope.failureKind === 'transport');
        const reconcilesCompleted = reconcileResults
          .every((result) => result?.reconcileCompleted === true);
        if (!transportFailed && reconcilesCompleted) {
          await syncStateRepository.setPullState('classes_pull', { lastPulledAt: pulledAt });
        }
      };
      if (!scopes.classes.ok || !scopes.classEaAssignments.ok) {
        const error = scopes.programmeAssignment.error || scopes.classes.error;
        if (error) {
          console.error('Error loading classes from server:', error);
        }
        await stampPullIfComplete();
        return;
      }

      await ensureReferenceData({ userId: activeUserId });
      if (activeUserIdRef.current !== activeUserId) return;
      await classesRepository.saveServerClassRows(scopes.classes.rows);
      const shouldReconcileAssignments = Boolean(activeProgrammeId)
        && scopes.programmeAssignment.ok
        && scopes.classes.ok
        && scopes.classEaAssignments.complete;
      if (shouldReconcileAssignments) {
        const reconcileResult = await classEaAssignmentsRepository.saveServerRows(scopes.classEaAssignments.rows, {
          reconcile: {
            acknowledgedClassIds: scopes.classes.rows.map((row) => row.id),
            userId: activeUserId,
            programmeId: activeProgrammeId,
            pulledAt,
          },
        });
        await stampPullIfComplete([reconcileResult]);
      } else {
        await classEaAssignmentsRepository.saveServerRows(scopes.classEaAssignments.rows);
        await stampPullIfComplete();
      }

      const freshClasses = await classesRepository.getClasses({ userId: activeUserId });
      if (activeUserIdRef.current !== activeUserId) return;
      setClasses(freshClasses);
    } catch (error) {
      console.error('Error in pullFromServer:', error);
    } finally {
      if (activeUserIdRef.current === activeUserId) {
        setLoading(false);
      }
    }
  }, [user?.id, refreshFromCache]);

  const pullFromServer = useCallback(() => {
    const activeUserId = user?.id;
    if (activePullRef.current && activePullRef.current.userId === activeUserId) {
      return activePullRef.current.promise;
    }

    const pullPromise = (async () => {
      try {
        return await performPullFromServer();
      } finally {
        if (activePullRef.current?.promise === pullPromise) {
          activePullRef.current = null;
        }
      }
    })();
    activePullRef.current = { userId: activeUserId, promise: pullPromise };
    return pullPromise;
  }, [user?.id, performPullFromServer]);

  const loadClasses = useCallback(async () => {
    await pullFromServer();
  }, [pullFromServer]);

  // Load data on mount when user is authenticated
  useEffect(() => {
    if (user?.id) {
      loadSchools();
      loadClasses();
      return;
    }
    setSchools([]);
    setClasses([]);
    setLoading(false);
  }, [user?.id, loadSchools, loadClasses]);

  useEffect(() => {
    if (previousDomainPullNonceRef.current === domainPullNonce) return;
    previousDomainPullNonceRef.current = domainPullNonce;
    if (user?.id) {
      pullFromServer();
    }
  }, [domainPullNonce, user?.id, pullFromServer]);

  // Re-fetch schools when connectivity is restored (they may have failed on mount)
  const prevOnlineRef = useRef(isOnline);
  useEffect(() => {
    if (!prevOnlineRef.current && isOnline && user?.id && schools.length === 0) {
      loadSchools();
    }
    prevOnlineRef.current = isOnline;
  }, [isOnline, user?.id, schools.length, loadSchools]);

  // Reload from SQLite after sync completes to pick up updated synced flags.
  const prevSyncingRef = useRef(isSyncing);
  useEffect(() => {
    if (prevSyncingRef.current && !isSyncing && user?.id) {
      refreshFromCache();
    }
    prevSyncingRef.current = isSyncing;
  }, [isSyncing, user?.id, refreshFromCache]);

  /**
   * Add a new class
   */
  const addClass = useCallback(async (classData) => {
    try {
      const activeAcademicYear = classData.academic_year_id
        ? null
        : await academicYearsRepository.getActive();
      const academicYearId = classData.academic_year_id || activeAcademicYear?.id;
      if (!academicYearId) {
        throw new Error('No active academic year found for class creation');
      }
      const db = await resolveDatabase();
      const activeProgrammeId = await getActiveProgrammeId(db, user.id);
      if (!activeProgrammeId) {
        throw new Error('No active programme assignment found for class creation');
      }

      const newClass = {
        id: uuidv4(),
        ...classData,
        academic_year_id: academicYearId,
        programme_id: activeProgrammeId,
        staff_id: user.id,
        created_by: user.id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        synced: false,
      };

      await classesRepository.saveClass(newClass);
      setClasses(prev => [...prev, newClass]);
      await refreshSyncStatus();

      return { success: true, classData: newClass };
    } catch (error) {
      console.error('Error adding class:', error);
      return { success: false, error };
    }
  }, [user?.id, refreshSyncStatus]);

  /**
   * Update a class
   */
  const updateClass = useCallback(async (classId, updates) => {
    try {
      const updated = {
        ...updates,
        updated_at: new Date().toISOString(),
        synced: false,
      };

      await classesRepository.updateClass(classId, updated);
      setClasses(prev =>
        prev.map(c => c.id === classId ? { ...c, ...updated } : c)
      );
      await refreshSyncStatus();

      return { success: true };
    } catch (error) {
      console.error('Error updating class:', error);
      return { success: false, error };
    }
  }, [refreshSyncStatus]);

  /**
   * Archive a class through the repository transaction, then publish its child
   * assignment side effects from SQLite before returning.
   */
  const deleteClass = useCallback(async (classId) => {
    try {
      await classesRepository.deleteClass(classId, { actorUserId: user.id });
      await refreshChildrenFromCache();
      setClasses(prev => prev.filter(c => c.id !== classId));
      await refreshSyncStatus();

      return { success: true };
    } catch (error) {
      console.error('Error deleting class:', error);
      return { success: false, error };
    }
  }, [user?.id, refreshChildrenFromCache, refreshSyncStatus]);

  /**
   * Get children in a specific class
   */
  const getChildrenInClass = useCallback((classId) => {
    return childrenList.filter(c => c.class_id === classId);
  }, [childrenList]);

  const value = useMemo(() => ({
    schools,
    classes,
    loading,
    loadSchools,
    loadClasses,
    addClass,
    updateClass,
    deleteClass,
    getChildrenInClass,
  }), [
    schools, classes, loading, loadSchools, loadClasses, addClass,
    updateClass, deleteClass, getChildrenInClass,
  ]);

  return (
    <ClassesContext.Provider value={value}>
      {reactChildren}
    </ClassesContext.Provider>
  );
};

export const useClasses = () => {
  const context = useContext(ClassesContext);
  if (!context) {
    throw new Error('useClasses must be used within a ClassesProvider');
  }
  return context;
};
