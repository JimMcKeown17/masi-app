import React, { createContext, useState, useEffect, useContext, useRef, useCallback, useMemo } from 'react';
import { supabase } from '../services/supabaseClient';
import { storage } from '../utils/storage';
import { fetchAndCacheSchools } from '../services/offlineSync';
import { enqueueSupabaseRequest } from '../services/supabaseRequestQueue';
import { academicYearsRepository } from '../db/repositories/referenceDataRepository';
import { getActiveProgrammeId } from '../db/repositories/domainRepositoryUtils';
import { mergeServerRows } from '../utils/mergeServerRows';
import { resolveDatabase } from '../db/repositories/repositoryRuntime';
import { useAuth } from './AuthContext';
import { useOffline } from './OfflineContext';
import { useChildren } from './ChildrenContext';
import { v4 as uuidv4 } from 'uuid';

const ClassesContext = createContext({});

const saveRows = async (rows, saveRow) => {
  for (const row of rows || []) {
    await saveRow(row);
  }
};

export const ClassesProvider = ({ children: reactChildren }) => {
  const { user } = useAuth();
  const { isOnline, refreshSyncStatus, isSyncing } = useOffline();
  const { children: childrenList } = useChildren();

  const [schools, setSchools] = useState([]);
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(false);
  const activeUserIdRef = useRef(null);

  /**
   * Load schools — cache-first, then always attempt a server fetch.
   * We don't gate on isOnline because it can be stale (race condition on mount).
   * If the fetch fails (offline / network error), we just keep the cached data.
   */
  const loadSchools = useCallback(async () => {
    try {
      const activeUserId = user?.id;
      const cached = await storage.getSchools();
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

  /**
   * Load classes for current user — cache-first, merge from server if online.
   * Same pattern as loadGroups in ChildrenContext.
   */
  const loadClasses = useCallback(async () => {
    try {
      setLoading(true);
      const activeUserId = user?.id;
      if (!activeUserId) {
        setClasses([]);
        return;
      }

      const [cached, unsyncedClasses] = await Promise.all([
        storage.getClasses({ userId: activeUserId }),
        storage.getUnsyncedClasses(),
      ]);
      if (activeUserIdRef.current !== activeUserId) return;
      setClasses(cached);

      if (activeUserIdRef.current === activeUserId) {
        const { data, error } = await enqueueSupabaseRequest(async () => {
          const { data: assignments, error: assignmentError } = await supabase
            .from('staff_programme_assignments')
            .select('programme_id')
            .eq('user_id', activeUserId)
            .is('ended_at', null)
            .order('assigned_at', { ascending: false })
            .limit(1);

          if (assignmentError || !assignments?.[0]?.programme_id) {
            return {
              data: [],
              error: assignmentError || null,
            };
          }

          return supabase
            .from('classes')
            .select(`
              *,
              class_ea_assignments!inner(*)
            `)
            .eq('class_ea_assignments.ea_user_id', activeUserId)
            .eq('class_ea_assignments.programme_id', assignments[0].programme_id)
            .is('class_ea_assignments.unassigned_at', null)
            .order('name', { ascending: true });
        });

        if (error) {
          console.error('Error loading classes from server:', error);
        } else if (data && activeUserIdRef.current === activeUserId) {
          const serverAssignments = data.flatMap(({ class_ea_assignments }) => (
            (class_ea_assignments || []).map(assignment => ({
              ...assignment,
              synced: true,
              sync_status: assignment.sync_status || 'synced',
            }))
          ));
          const serverClasses = data.map(({ class_ea_assignments, ...classItem }) => ({
            ...classItem,
            synced: true,
            sync_status: classItem.sync_status || 'synced',
          }));
          const merged = mergeServerRows(cached, serverClasses, { unpushedRows: unsyncedClasses });
          // No caller-side dirty filtering: the repository pull guard decides,
          // inside the write transaction, whether a server row may land.
          await saveRows(serverClasses, storage.saveClass);
          await saveRows(serverAssignments, storage.saveClassEaAssignment);
          setClasses(merged);
        }
      }
    } catch (error) {
      console.error('Error in loadClasses:', error);
    } finally {
      if (activeUserIdRef.current === user?.id) {
        setLoading(false);
      }
    }
  }, [user?.id]);

  // Load data on mount when user is authenticated
  useEffect(() => {
    activeUserIdRef.current = user?.id || null;
    if (user?.id) {
      loadSchools();
      loadClasses();
      return;
    }
    setSchools([]);
    setClasses([]);
    setLoading(false);
  }, [user?.id, loadSchools, loadClasses]);

  // Re-fetch schools when connectivity is restored (they may have failed on mount)
  const prevOnlineRef = useRef(isOnline);
  useEffect(() => {
    if (!prevOnlineRef.current && isOnline && user?.id && schools.length === 0) {
      loadSchools();
    }
    prevOnlineRef.current = isOnline;
  }, [isOnline, user?.id, schools.length, loadSchools]);

  // Reload from storage after sync completes to pick up updated synced flags
  const prevSyncingRef = useRef(isSyncing);
  useEffect(() => {
    if (prevSyncingRef.current && !isSyncing && user?.id) {
      loadClasses();
    }
    prevSyncingRef.current = isSyncing;
  }, [isSyncing, user?.id, loadClasses]);

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

      await storage.saveClass(newClass);
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

      await storage.updateClass(classId, updated);
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
   * Archive a class through the storage facade.
   * Child membership/assignment side effects belong in the repository transaction,
   * so the context should not double-write child rows here.
   */
  const deleteClass = useCallback(async (classId) => {
    try {
      await storage.deleteClass(classId);
      setClasses(prev => prev.filter(c => c.id !== classId));
      await refreshSyncStatus();

      return { success: true };
    } catch (error) {
      console.error('Error deleting class:', error);
      return { success: false, error };
    }
  }, [refreshSyncStatus]);

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
