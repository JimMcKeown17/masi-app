import React, { createContext, useState, useEffect, useContext, useRef, useMemo, useCallback } from 'react';
import { storage } from '../utils/storage';
import { pullPreloadedChildData } from '../services/preloadedChildData';
import { mergeServerRows } from '../utils/mergeServerRows';
import { useAuth } from './AuthContext';
import { useOffline } from './OfflineContext';
import { v4 as uuidv4 } from 'uuid';

const ChildrenContext = createContext({});

const shouldApplyPulledRows = (rows, errors) => (
  Array.isArray(rows) && (rows.length > 0 || errors.length === 0)
);

const saveRows = async (rows, saveRow) => {
  for (const row of rows || []) {
    await saveRow(row);
  }
};

export const ChildrenProvider = ({ children }) => {
  const { user } = useAuth();
  const { refreshSyncStatus, isSyncing } = useOffline();

  const [childrenList, setChildrenList] = useState([]);
  const [groups, setGroups] = useState([]);
  const [childrenGroups, setChildrenGroups] = useState([]);
  const [loading, setLoading] = useState(false);
  const activeUserIdRef = useRef(null);

  // Active children only — hidden_at IS NULL. This is what every list view,
  // picker, and stats helper should consume. Hidden children stay in
  // childrenList so allChildren can resolve their names in history views.
  const visibleChildren = useMemo(
    () => childrenList.filter(c => !c.hidden_at && !c.archived_at),
    [childrenList]
  );

  // Lookup by id that returns hidden children too — for name resolution in
  // historical contexts where dropping a name to "Unknown" would degrade UX.
  const getChildById = useCallback(
    (id) => childrenList.find(c => c.id === id) || null,
    [childrenList]
  );

  const loadPreloadedChildData = useCallback(async () => {
    const activeUserId = user?.id;
    if (!activeUserId) {
      setChildrenList([]);
      setGroups([]);
      setChildrenGroups([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      const [
        cachedChildren,
        cachedGroups,
        cachedMemberships,
        unsyncedChildren,
        unsyncedGroups,
        unsyncedMemberships,
        pendingChildDeleteIds,
      ] = await Promise.all([
        storage.getMyChildren(activeUserId),
        storage.getGroups({ userId: activeUserId }),
        storage.getChildrenGroups(),
        storage.getUnsyncedChildren(),
        storage.getUnsyncedGroups(),
        storage.getUnsyncedChildrenGroups(),
        storage.getPendingHardDeleteIds({
          tableName: 'children',
          ownerUserId: activeUserId,
        }),
      ]);
      if (activeUserIdRef.current !== activeUserId) return;
      setChildrenList(cachedChildren);
      setGroups(cachedGroups);
      setChildrenGroups(cachedMemberships);

      if (activeUserIdRef.current === activeUserId) {
        const pulled = await pullPreloadedChildData({ userId: activeUserId });
        const errors = pulled.errors || [];
        if (activeUserIdRef.current !== activeUserId) return;
        const pulledChildren = (pulled.children || [])
          .filter((row) => !pendingChildDeleteIds.has(row.id));
        const pulledChildEaAssignments = (pulled.childEaAssignments || [])
          .filter((row) => !pendingChildDeleteIds.has(row.child_id));
        const pulledChildProgrammeEnrollments = (pulled.childProgrammeEnrollments || [])
          .filter((row) => !pendingChildDeleteIds.has(row.child_id));
        const pulledChildClassMemberships = (pulled.childClassMemberships || [])
          .filter((row) => !pendingChildDeleteIds.has(row.child_id));

        if (shouldApplyPulledRows(pulledChildren, errors)) {
          const merged = mergeServerRows(cachedChildren, pulledChildren, {
            unpushedRows: unsyncedChildren,
            pendingDeleteIds: pendingChildDeleteIds,
          });
          await saveRows(pulledChildren, storage.saveChild);
          setChildrenList(merged);
        }

        await saveRows(pulled.classes, storage.saveClass);
        await saveRows(pulledChildEaAssignments, storage.saveStaffChild);
        await saveRows(pulledChildProgrammeEnrollments, storage.saveChildProgrammeEnrollment);
        await saveRows(pulledChildClassMemberships, storage.saveChildClassMembership);

        if (shouldApplyPulledRows(pulled.groups, errors)) {
          const merged = mergeServerRows(cachedGroups, pulled.groups, { unpushedRows: unsyncedGroups });
          await saveRows(pulled.groups, storage.saveGroup);
          setGroups(merged);
        }

        if (shouldApplyPulledRows(pulled.childrenGroups, errors)) {
          const merged = mergeServerRows(cachedMemberships, pulled.childrenGroups, { unpushedRows: unsyncedMemberships });
          await saveRows(pulled.childrenGroups, storage.saveChildrenGroup);
          setChildrenGroups(merged);
        }
      }
    } catch (error) {
      console.error('Error in loadPreloadedChildData:', error);
    } finally {
      if (activeUserIdRef.current === activeUserId) {
        setLoading(false);
      }
    }
  }, [user?.id]);

  // Load data on mount when user is authenticated
  useEffect(() => {
    activeUserIdRef.current = user?.id || null;
    if (user?.id) {
      loadPreloadedChildData();
      return;
    }
    setChildrenList([]);
    setGroups([]);
    setChildrenGroups([]);
    setLoading(false);
  }, [user?.id, loadPreloadedChildData]);

  // Reload from storage after sync completes to pick up updated synced flags
  const prevSyncingRef = useRef(isSyncing);
  useEffect(() => {
    if (prevSyncingRef.current && !isSyncing && user?.id) {
      loadPreloadedChildData();
    }
    prevSyncingRef.current = isSyncing;
  }, [isSyncing, user?.id, loadPreloadedChildData]);

  /**
   * Load children assigned to current user
   * Cache-first pattern: show cached data immediately, then merge from server.
   * Unsynced local records are preserved so they aren't lost before sync.
   */
  const loadChildren = useCallback(async () => {
    try {
      setLoading(true);

      await loadPreloadedChildData();
    } catch (error) {
      console.error('Error in loadChildren:', error);
    } finally {
      setLoading(false);
    }
  }, [loadPreloadedChildData]);

  /**
   * Add a new child
   * Creates both the child record AND the staff-child assignment (many-to-many)
   */
  const addChild = useCallback(async (childData) => {
    try {
      const childId = uuidv4();

      // Create child record (no assigned_staff_id anymore)
      const child = {
        id: childId,
        ...childData,
        created_by: user.id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        synced: false,
      };

      await storage.createChild(child, {
        actorUserId: user.id,
      });

      // Update state
      setChildrenList(prev => [...prev, child]);

      // Trigger background sync
      await refreshSyncStatus();

      return { success: true, child };
    } catch (error) {
      console.error('Error adding child:', error);
      return { success: false, error };
    }
  }, [user?.id, refreshSyncStatus]);

  /**
   * Update a child's information
   */
  const updateChild = useCallback(async (childId, updates) => {
    try {
      const updated = {
        ...updates,
        updated_at: new Date().toISOString(),
        synced: false,
      };

      // actorUserId lets the class-change membership reassignment stamp created_by
      // with the acting user (matches saveChild) — see childrenRepository.updateChild (#35).
      await storage.updateChild(childId, updated, { actorUserId: user.id });

      setChildrenList(prev =>
        prev.map(c =>
          c.id === childId ? { ...c, ...updated } : c
        )
      );

      await refreshSyncStatus();

      return { success: true };
    } catch (error) {
      console.error('Error updating child:', error);
      return { success: false, error };
    }
  }, [user?.id, refreshSyncStatus]);

  /**
   * Hide a child from the user's active list (soft-delete).
   * Sets hidden_at on the child record and queues for sync. The row stays
   * in Supabase for admin/reporting. loadChildren fetches all assigned
   * children (active + hidden) so cross-device hide propagation works,
   * and the derived `children` value in the context filters out records
   * with hidden_at set.
   */
  const deleteChild = useCallback(async (childId) => {
    try {
      const ok = await storage.deleteChild(childId, {
        actorUserId: user.id,
      });
      if (!ok) {
        return { success: false, error: 'Child not found in local cache' };
      }

      setChildrenList(prev => prev.filter(c => c.id !== childId));
      setChildrenGroups(prev => prev.filter(cg => cg.child_id !== childId));

      await refreshSyncStatus();

      return { success: true };
    } catch (error) {
      console.error('Error hiding child:', error);
      return { success: false, error };
    }
  }, [user?.id, refreshSyncStatus]);

  /**
   * Load groups for current user
   */
  const loadGroups = useCallback(async () => {
    try {
      await loadPreloadedChildData();
    } catch (error) {
      console.error('Error in loadGroups:', error);
    }
  }, [loadPreloadedChildData]);

  /**
   * Add a new group
   */
  const addGroup = useCallback(async (groupData) => {
    try {
      const group = {
        id: uuidv4(),
        ...groupData,
        staff_id: user.id,
        created_by: user.id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        synced: false,
      };

      await storage.saveGroup(group);
      setGroups(prev => [...prev, group]);
      await refreshSyncStatus();

      return { success: true, group };
    } catch (error) {
      console.error('Error adding group:', error);
      return { success: false, error };
    }
  }, [user?.id, refreshSyncStatus]);

  /**
   * Update a group's information
   */
  const updateGroup = useCallback(async (groupId, updates) => {
    try {
      const updated = {
        ...updates,
        updated_at: new Date().toISOString(),
        synced: false,
      };

      await storage.updateGroup(groupId, updated);

      setGroups(prev =>
        prev.map(g =>
          g.id === groupId ? { ...g, ...updated } : g
        )
      );

      await refreshSyncStatus();

      return { success: true };
    } catch (error) {
      console.error('Error updating group:', error);
      return { success: false, error };
    }
  }, [refreshSyncStatus]);

  /**
   * Delete a group
   * Also removes all child-group memberships
   */
  const deleteGroup = useCallback(async (groupId) => {
    try {
      await storage.deleteGroup(groupId);
      setGroups(prev => prev.filter(g => g.id !== groupId));

      // Remove all memberships for this group from active state. Repository
      // archive/delete handles local persistence and outbox rows.
      setChildrenGroups(prev => prev.filter(cg => cg.group_id !== groupId));
      await refreshSyncStatus();

      return { success: true };
    } catch (error) {
      console.error('Error deleting group:', error);
      return { success: false, error };
    }
  }, [refreshSyncStatus]);

  /**
   * Load children-groups junction data
   */
  const loadChildrenGroups = async () => {
    try {
      await loadPreloadedChildData();
    } catch (error) {
      console.error('Error in loadChildrenGroups:', error);
    }
  };

  /**
   * Add a child to a group
   */
  const addChildToGroup = useCallback(async (childId, groupId) => {
    try {
      // Check if already exists
      const exists = childrenGroups.some(
        cg => cg.child_id === childId && cg.group_id === groupId && !cg.removed_at
      );

      if (exists) {
        return { success: false, error: 'Child already in group' };
      }

      const membership = {
        id: uuidv4(),
        child_id: childId,
        group_id: groupId,
        created_by: user.id,
        created_at: new Date().toISOString(),
        synced: false,
      };

      await storage.saveChildrenGroup(membership);
      setChildrenGroups(prev => [...prev, membership]);
      await refreshSyncStatus();

      return { success: true, membership };
    } catch (error) {
      console.error('Error adding child to group:', error);
      return { success: false, error };
    }
  }, [childrenGroups, user?.id, refreshSyncStatus]);

  /**
   * Remove a child from a group
   */
  const removeChildFromGroup = useCallback(async (childId, groupId) => {
    try {
      await storage.deleteChildrenGroup(childId, groupId);

      setChildrenGroups(prev =>
        prev.filter(
          cg => !(cg.child_id === childId && cg.group_id === groupId)
        )
      );
      await refreshSyncStatus();

      return { success: true };
    } catch (error) {
      console.error('Error removing child from group:', error);
      return { success: false, error };
    }
  }, [refreshSyncStatus]);

  /**
   * Get all children in a specific group.
   * Filters against visibleChildren so hidden children can't leak into
   * session selection (ChildSelector) or group counts (GroupPickerBottomSheet).
   */
  const getChildrenInGroup = useCallback((groupId) => {
    const membershipIds = childrenGroups
      .filter(cg => cg.group_id === groupId && !cg.removed_at)
      .map(cg => cg.child_id);

    return visibleChildren.filter(c => membershipIds.includes(c.id));
  }, [childrenGroups, visibleChildren]);

  /**
   * Get all groups a child belongs to
   */
  const getGroupsForChild = useCallback((childId) => {
    const groupIds = childrenGroups
      .filter(cg => cg.child_id === childId && !cg.removed_at)
      .map(cg => cg.group_id);

    return groups.filter(g => groupIds.includes(g.id));
  }, [childrenGroups, groups]);

  // `children` is the filtered active list — what every list view, picker, and
  // stats helper should consume. `allChildren` exposes the unfiltered set
  // including soft-deleted (hidden_at IS NOT NULL) records — only use it for
  // historical name resolution where dropping a name to "Unknown" would degrade UX.
  const value = useMemo(() => ({
    children: visibleChildren,
    allChildren: childrenList,
    getChildById,
    groups,
    childrenGroups,
    loading,
    loadChildren,
    addChild,
    updateChild,
    deleteChild,
    loadGroups,
    addGroup,
    updateGroup,
    deleteGroup,
    addChildToGroup,
    removeChildFromGroup,
    getChildrenInGroup,
    getGroupsForChild,
  }), [
    visibleChildren, childrenList, getChildById, groups, childrenGroups, loading,
    loadChildren, addChild, updateChild, deleteChild, loadGroups, addGroup,
    updateGroup, deleteGroup, addChildToGroup, removeChildFromGroup,
    getChildrenInGroup, getGroupsForChild,
  ]);

  return (
    <ChildrenContext.Provider value={value}>
      {children}
    </ChildrenContext.Provider>
  );
};

export const useChildren = () => {
  const context = useContext(ChildrenContext);
  if (!context) {
    throw new Error('useChildren must be used within a ChildrenProvider');
  }
  return context;
};
