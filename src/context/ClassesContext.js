import React, { createContext, useState, useEffect, useContext, useRef } from 'react';
import { supabase } from '../services/supabaseClient';
import { storage, STORAGE_KEYS } from '../utils/storage';
import { fetchAndCacheSchools } from '../services/offlineSync';
import { useAuth } from './AuthContext';
import { useOffline } from './OfflineContext';
import { useChildren } from './ChildrenContext';
import { v4 as uuidv4 } from 'uuid';

const ClassesContext = createContext({});

export const ClassesProvider = ({ children: reactChildren }) => {
  const { user } = useAuth();
  const { isOnline, refreshSyncStatus, isSyncing } = useOffline();
  const { children: childrenList, updateChild } = useChildren();

  const [schools, setSchools] = useState([]);
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(false);

  // Load data on mount when user is authenticated
  useEffect(() => {
    if (user?.id) {
      loadSchools();
      loadClasses();
    }
  }, [user?.id]);

  // Re-fetch schools when connectivity is restored (they may have failed on mount)
  const prevOnlineRef = useRef(isOnline);
  useEffect(() => {
    if (!prevOnlineRef.current && isOnline && user?.id && schools.length === 0) {
      loadSchools();
    }
    prevOnlineRef.current = isOnline;
  }, [isOnline]);

  // Reload from storage after sync completes to pick up updated synced flags
  const prevSyncingRef = useRef(isSyncing);
  useEffect(() => {
    if (prevSyncingRef.current && !isSyncing && user?.id) {
      loadClasses();
    }
    prevSyncingRef.current = isSyncing;
  }, [isSyncing]);

  /**
   * Load schools — cache-first, then always attempt a server fetch.
   * We don't gate on isOnline because it can be stale (race condition on mount).
   * If the fetch fails (offline / network error), we just keep the cached data.
   */
  const loadSchools = async () => {
    try {
      const cached = await storage.getSchools();
      setSchools(cached);

      try {
        const serverSchools = await fetchAndCacheSchools();
        setSchools(serverSchools);
      } catch (error) {
        console.log('Could not fetch schools from server (likely offline):', error.message);
        // Keep cached data — it's fine to be stale
      }
    } catch (error) {
      console.error('Error in loadSchools:', error);
    }
  };

  /**
   * Load classes for current user — cache-first, merge from server if online.
   * Same pattern as loadGroups in ChildrenContext.
   */
  const loadClasses = async () => {
    try {
      setLoading(true);

      const cached = await storage.getClasses();
      setClasses(cached);

      if (isOnline && user?.id) {
        const { data, error } = await supabase
          .from('classes')
          .select('*')
          .eq('staff_id', user.id)
          .order('name', { ascending: true });

        if (error) {
          console.error('Error loading classes from server:', error);
        } else if (data) {
          const serverClasses = data.map(c => ({ ...c, synced: true }));
          const localUnsynced = cached.filter(c => c.synced === false);
          const serverIds = new Set(serverClasses.map(c => c.id));
          const unsyncedToKeep = localUnsynced.filter(c => !serverIds.has(c.id));
          const merged = [...serverClasses, ...unsyncedToKeep];
          await storage.setItem(STORAGE_KEYS.CLASSES, merged);
          setClasses(merged);
        }
      }
    } catch (error) {
      console.error('Error in loadClasses:', error);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Add a new class
   */
  const addClass = async (classData) => {
    try {
      const newClass = {
        id: uuidv4(),
        ...classData,
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
  };

  /**
   * Update a class
   */
  const updateClass = async (classId, updates) => {
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
  };

  /**
   * Delete a class
   * Also nulls out class_id on affected children in storage.
   */
  const deleteClass = async (classId) => {
    try {
      await storage.deleteClass(classId);
      setClasses(prev => prev.filter(c => c.id !== classId));

      // Null out class_id on affected children
      const allChildren = await storage.getChildren();
      const affected = allChildren.filter(c => c.class_id === classId);
      for (const child of affected) {
        await storage.updateChild(child.id, {
          class_id: null,
          updated_at: new Date().toISOString(),
          synced: false,
        });
      }
      // Update children state via context if any were affected
      if (affected.length > 0) {
        // Trigger a re-render by updating each affected child in state
        for (const child of affected) {
          await updateChild(child.id, { class_id: null });
        }
      }

      return { success: true };
    } catch (error) {
      console.error('Error deleting class:', error);
      return { success: false, error };
    }
  };

  /**
   * Get children in a specific class
   */
  const getChildrenInClass = (classId) => {
    return childrenList.filter(c => c.class_id === classId);
  };

  return (
    <ClassesContext.Provider
      value={{
        schools,
        classes,
        loading,
        loadSchools,
        loadClasses,
        addClass,
        updateClass,
        deleteClass,
        getChildrenInClass,
      }}
    >
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
