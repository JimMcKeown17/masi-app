import React, { createContext, useState, useEffect, useContext, useRef, useMemo, useCallback } from 'react';
import { pullPreloadedChildData } from '../services/preloadedChildData';
import { ensureReferenceData } from '../services/offlineSync';
import { childrenRepository } from '../db/repositories/childrenRepository';
import { classesRepository } from '../db/repositories/classesRepository';
import { groupsRepository } from '../db/repositories/groupsRepository';
import { groupEaAssignmentsRepository } from '../db/repositories/groupEaAssignmentsRepository';
import { syncOutboxRepository } from '../db/repositories/syncOutboxRepository';
import { syncStateRepository } from '../db/repositories/syncStateRepository';
import { useAuth } from './AuthContext';
import { useOffline } from './OfflineContext';
import { v4 as uuidv4 } from 'uuid';

const ChildrenContext = createContext({});

const savePulledRows = async (saveRows, rows, reconcile, reconcileResults) => {
  const result = reconcile ? await saveRows(rows, { reconcile }) : await saveRows(rows);
  if (reconcile) reconcileResults.push(result);
  return result;
};

export const ChildrenProvider = ({ children }) => {
  const { user } = useAuth();
  const { refreshSyncStatus, isSyncing, domainPullNonce = 0 } = useOffline();

  const [childrenList, setChildrenList] = useState([]);
  const [groups, setGroups] = useState([]);
  const [childrenGroups, setChildrenGroups] = useState([]);
  const [loading, setLoading] = useState(false);
  const activeUserIdRef = useRef(null);
  const activePullRef = useRef(null);
  const previousDomainPullNonceRef = useRef(domainPullNonce);
  activeUserIdRef.current = user?.id || null;

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

  const refreshFromCache = useCallback(async () => {
    const activeUserId = user?.id;
    if (!activeUserId) {
      setChildrenList([]);
      setGroups([]);
      setChildrenGroups([]);
      return;
    }

    const [cachedChildren, cachedGroups, cachedMemberships] = await Promise.all([
      childrenRepository.getMyChildren(activeUserId),
      groupsRepository.getGroups({ userId: activeUserId }),
      groupsRepository.getVisibleChildrenGroups({ userId: activeUserId }),
    ]);
    if (activeUserIdRef.current !== activeUserId) return;
    setChildrenList(cachedChildren);
    setGroups(cachedGroups);
    setChildrenGroups(cachedMemberships);
  }, [user?.id]);

  const performPullFromServer = useCallback(async () => {
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
      // Cache-first display: publish the SQLite snapshot immediately so a slow
      // or stalled network never holds the roster hostage.
      await refreshFromCache();
      const pulled = await pullPreloadedChildData({ userId: activeUserId });
      if (activeUserIdRef.current !== activeUserId) return;
      await ensureReferenceData({ userId: activeUserId });
      if (activeUserIdRef.current !== activeUserId) return;

      const { activeProgrammeId, scopes } = pulled;
      const pulledAt = new Date().toISOString();
      const programmeScopeOk = scopes.programmeAssignment.ok && Boolean(activeProgrammeId);
      const reconcileResults = [];

      const pendingChildDeleteIds = await syncOutboxRepository.getPendingHardDeleteIds({
        tableName: 'children',
        ownerUserId: activeUserId,
      });
      const childrenById = new Map();
      for (const child of [
        ...(scopes.children.ok ? scopes.children.rows : []),
        ...(scopes.childEaAssignments.ok
          ? scopes.childEaAssignments.rows.map((assignment) => assignment.children)
          : []),
      ]) {
        if (child?.id && !childrenById.has(child.id)) {
          childrenById.set(child.id, child);
        }
      }
      const pulledChildren = [...childrenById.values()]
        .filter((row) => !pendingChildDeleteIds.has(row.id));
      const pulledChildEaAssignments = (scopes.childEaAssignments.ok
        ? scopes.childEaAssignments.rows
        : [])
        .filter((row) => !pendingChildDeleteIds.has(row.child_id));
      const pulledChildProgrammeEnrollments = (scopes.childProgrammeEnrollments.ok
        ? scopes.childProgrammeEnrollments.rows
        : [])
        .filter((row) => !pendingChildDeleteIds.has(row.child_id));
      const pulledChildClassMemberships = (scopes.childClassMemberships.ok
        ? scopes.childClassMemberships.rows
        : [])
        .filter((row) => !pendingChildDeleteIds.has(row.child_id));

      if (scopes.classes.ok) {
        await classesRepository.saveServerClassRows(scopes.classes.rows);
      }
      if (scopes.children.ok || scopes.childEaAssignments.ok) {
        await childrenRepository.saveServerChildRows(pulledChildren);
      }
      if (scopes.childEaAssignments.ok) {
        await savePulledRows(
          childrenRepository.saveServerStaffChildRows,
          pulledChildEaAssignments,
          scopes.childEaAssignments.complete && programmeScopeOk
            ? {
              acknowledgedIds: scopes.childEaAssignments.rows.map((row) => row.id),
              pulledAt,
              userId: activeUserId,
            }
            : undefined,
          reconcileResults
        );
      }
      if (scopes.childProgrammeEnrollments.ok) {
        await savePulledRows(
          childrenRepository.saveServerChildProgrammeEnrollmentRows,
          pulledChildProgrammeEnrollments,
          scopes.childProgrammeEnrollments.complete
            && programmeScopeOk
            && scopes.childEaAssignments.ok
            ? {
              acknowledgedIds: scopes.childProgrammeEnrollments.rows.map((row) => row.id),
              acknowledgedAssignedChildIds: scopes.childEaAssignments.rows
                .map((row) => row.child_id),
              programmeId: activeProgrammeId,
              pulledAt,
            }
            : undefined,
          reconcileResults
        );
      }
      if (scopes.childClassMemberships.ok) {
        await savePulledRows(
          childrenRepository.saveServerChildClassMembershipRows,
          pulledChildClassMemberships,
          scopes.childClassMemberships.complete
            && programmeScopeOk
            && scopes.children.ok
            ? {
              acknowledgedIds: scopes.childClassMemberships.rows.map((row) => row.id),
              acknowledgedChildIds: scopes.children.rows
                .map((row) => row.id),
              pulledAt,
            }
            : undefined,
          reconcileResults
        );
      }
      if (scopes.groups.ok) {
        await groupsRepository.saveServerGroupRows(scopes.groups.rows);
      }
      if (scopes.groupEaAssignments.ok) {
        await savePulledRows(
          groupEaAssignmentsRepository.saveServerRows,
          scopes.groupEaAssignments.rows,
          scopes.groupEaAssignments.complete
            && programmeScopeOk
            && scopes.groups.ok
            ? {
              acknowledgedGroupIds: scopes.groups.rows.map((row) => row.id),
              userId: activeUserId,
              programmeId: activeProgrammeId,
              pulledAt,
            }
            : undefined,
          reconcileResults
        );
      }
      if (scopes.childrenGroups.ok) {
        await savePulledRows(
          groupsRepository.saveServerChildrenGroupRows,
          scopes.childrenGroups.rows,
          scopes.childrenGroups.complete
            && programmeScopeOk
            && scopes.groups.ok
            ? {
              acknowledgedIds: scopes.childrenGroups.rows.map((row) => row.id),
              acknowledgedGroupIds: scopes.groups.rows.map((row) => row.id),
              pulledAt,
            }
            : undefined,
          reconcileResults
        );
      }

      if (activeUserIdRef.current !== activeUserId) return;
      const transportFailed = Object.values(scopes)
        .some((scope) => scope.failureKind === 'transport');
      const reconcilesCompleted = reconcileResults
        .every((result) => result?.reconcileCompleted === true);
      if (!transportFailed && reconcilesCompleted) {
        await syncStateRepository.setPullState('child_data_pull', { lastPulledAt: pulledAt });
      }

      const [freshChildren, freshGroups, freshMemberships] = await Promise.all([
        childrenRepository.getMyChildren(activeUserId),
        groupsRepository.getGroups({ userId: activeUserId }),
        groupsRepository.getVisibleChildrenGroups({ userId: activeUserId }),
      ]);
      if (activeUserIdRef.current !== activeUserId) return;

      setChildrenList(freshChildren);
      setGroups(freshGroups);
      setChildrenGroups(freshMemberships);
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

  // Load data on mount when user is authenticated
  useEffect(() => {
    if (user?.id) {
      pullFromServer();
      return;
    }
    setChildrenList([]);
    setGroups([]);
    setChildrenGroups([]);
    setLoading(false);
  }, [user?.id, pullFromServer]);

  useEffect(() => {
    if (previousDomainPullNonceRef.current === domainPullNonce) return;
    previousDomainPullNonceRef.current = domainPullNonce;
    if (user?.id) {
      pullFromServer();
    }
  }, [domainPullNonce, user?.id, pullFromServer]);

  // Reload from SQLite after sync completes to pick up updated synced flags.
  const prevSyncingRef = useRef(isSyncing);
  useEffect(() => {
    if (prevSyncingRef.current && !isSyncing && user?.id) {
      refreshFromCache();
    }
    prevSyncingRef.current = isSyncing;
  }, [isSyncing, user?.id, refreshFromCache]);

  /**
   * Load children assigned to current user
   * Pull server rows, persist them, then derive state from a fresh SQLite snapshot.
   * Pending local records are preserved by the repository guard.
   */
  const loadChildren = useCallback(async () => {
    try {
      setLoading(true);

      await pullFromServer();
    } catch (error) {
      console.error('Error in loadChildren:', error);
    } finally {
      setLoading(false);
    }
  }, [pullFromServer]);

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

      await childrenRepository.save(child, {
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
      await childrenRepository.updateChild(childId, updated, { actorUserId: user.id });

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
      const existing = (await childrenRepository.getChildren())
        .find((child) => child.id === childId);
      if (!existing) {
        return { success: false, error: 'Child not found in local cache' };
      }

      const deleted = await childrenRepository.deleteIfNoHistory(childId, {
        actorUserId: user.id,
      });
      if (!deleted) {
        await childrenRepository.archiveChild(childId, {
          actorUserId: user.id,
        });
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
      await pullFromServer();
    } catch (error) {
      console.error('Error in loadGroups:', error);
    }
  }, [pullFromServer]);

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

      await groupsRepository.saveGroup(group);
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

      await groupsRepository.updateGroup(groupId, updated);

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
      await groupsRepository.deleteGroup(groupId);
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
  const loadChildrenGroups = useCallback(async () => {
    try {
      await pullFromServer();
    } catch (error) {
      console.error('Error in loadChildrenGroups:', error);
    }
  }, [pullFromServer]);

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

      await groupsRepository.addChildToGroup(membership);
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
      await groupsRepository.removeChildFromGroup(childId, groupId);

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
    refreshFromCache,
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
    refreshFromCache, loadChildren, addChild, updateChild, deleteChild, loadGroups, addGroup,
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
