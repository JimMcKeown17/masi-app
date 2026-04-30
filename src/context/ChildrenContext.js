import React, { createContext, useState, useEffect, useContext, useRef, useMemo, useCallback } from 'react';
import { supabase } from '../services/supabaseClient';
import { storage, STORAGE_KEYS } from '../utils/storage';
import { useAuth } from './AuthContext';
import { useOffline } from './OfflineContext';
import { v4 as uuidv4 } from 'uuid';

const ChildrenContext = createContext({});

export const ChildrenProvider = ({ children }) => {
  const { user } = useAuth();
  const { isOnline, refreshSyncStatus, isSyncing } = useOffline();

  const [childrenList, setChildrenList] = useState([]);
  const [groups, setGroups] = useState([]);
  const [childrenGroups, setChildrenGroups] = useState([]);
  const [loading, setLoading] = useState(false);

  // Active children only — hidden_at IS NULL. This is what every list view,
  // picker, and stats helper should consume. Hidden children stay in
  // childrenList so allChildren can resolve their names in history views.
  const visibleChildren = useMemo(
    () => childrenList.filter(c => !c.hidden_at),
    [childrenList]
  );

  // Lookup by id that returns hidden children too — for name resolution in
  // historical contexts where dropping a name to "Unknown" would degrade UX.
  const getChildById = useCallback(
    (id) => childrenList.find(c => c.id === id) || null,
    [childrenList]
  );

  // Load data on mount when user is authenticated
  useEffect(() => {
    if (user?.id) {
      loadChildren();
      loadGroups();
      loadChildrenGroups();
    }
  }, [user?.id]);

  // Reload from storage after sync completes to pick up updated synced flags
  const prevSyncingRef = useRef(isSyncing);
  useEffect(() => {
    if (prevSyncingRef.current && !isSyncing && user?.id) {
      loadChildren();
      loadGroups();
      loadChildrenGroups();
    }
    prevSyncingRef.current = isSyncing;
  }, [isSyncing]);

  /**
   * Load children assigned to current user
   * Cache-first pattern: show cached data immediately, then merge from server.
   * Unsynced local records are preserved so they aren't lost before sync.
   */
  const loadChildren = async () => {
    try {
      setLoading(true);

      // 1. Load from AsyncStorage (show immediately)
      const cached = await storage.getChildren();
      setChildrenList(cached);

      // 2. If online, fetch from server via junction table
      if (isOnline && user?.id) {
        const { data, error } = await supabase
          .from('children')
          .select(`
            *,
            staff_children!inner(staff_id)
          `)
          .eq('staff_children.staff_id', user.id)
          .order('first_name', { ascending: true });

        if (error) {
          console.error('Error loading children from server:', error);
        } else if (data) {
          // Strip nested join data (staff_children) — it's not a column
          // and would break sync if the record is later updated
          const serverChildren = data.map(({ staff_children, ...child }) => ({
            ...child,
            synced: true,
          }));

          // Merge: server records are authoritative for IDs they return.
          // Keep ALL local records not in server response — this preserves
          // both unsynced new records AND synced records whose junction
          // table (staff_children) hasn't propagated yet.
          const serverIds = new Set(serverChildren.map(c => c.id));
          const localToKeep = cached.filter(c => !serverIds.has(c.id));

          const merged = [...serverChildren, ...localToKeep];

          await storage.setItem(STORAGE_KEYS.CHILDREN, merged);
          setChildrenList(merged);
        }
      }
    } catch (error) {
      console.error('Error in loadChildren:', error);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Add a new child
   * Creates both the child record AND the staff-child assignment (many-to-many)
   */
  const addChild = async (childData) => {
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

      // Create staff-child assignment
      const assignment = {
        id: uuidv4(),
        staff_id: user.id,
        child_id: childId,
        assigned_at: new Date().toISOString(),
        synced: false,
      };

      // Save both locally
      await storage.saveChild(child);
      await storage.saveStaffChild(assignment);

      // Update state
      setChildrenList([...childrenList, child]);

      // Trigger background sync
      await refreshSyncStatus();

      return { success: true, child };
    } catch (error) {
      console.error('Error adding child:', error);
      return { success: false, error };
    }
  };

  /**
   * Update a child's information
   */
  const updateChild = async (childId, updates) => {
    try {
      const updated = {
        ...updates,
        updated_at: new Date().toISOString(),
        synced: false,
      };

      await storage.updateChild(childId, updated);

      setChildrenList(
        childrenList.map(c =>
          c.id === childId ? { ...c, ...updated } : c
        )
      );

      await refreshSyncStatus();

      return { success: true };
    } catch (error) {
      console.error('Error updating child:', error);
      return { success: false, error };
    }
  };

  /**
   * Hide a child from the user's active list (soft-delete).
   * Sets hidden_at on the child record and queues for sync. The row stays
   * in Supabase for admin/reporting. loadChildren fetches all assigned
   * children (active + hidden) so cross-device hide propagation works,
   * and the derived `children` value in the context filters out records
   * with hidden_at set.
   */
  const deleteChild = async (childId) => {
    try {
      const updates = {
        hidden_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        synced: false,
      };

      const ok = await storage.updateChild(childId, updates);
      if (!ok) {
        return { success: false, error: 'Child not found in local cache' };
      }

      // Functional form avoids stale-state hazard if multiple updates land in
      // quick succession. Pattern matches ClassesContext.
      setChildrenList(prev =>
        prev.map(c => (c.id === childId ? { ...c, ...updates } : c))
      );

      await refreshSyncStatus();

      return { success: true };
    } catch (error) {
      console.error('Error hiding child:', error);
      return { success: false, error };
    }
  };

  /**
   * Load groups for current user
   */
  const loadGroups = async () => {
    try {
      // 1. Load from cache
      const cached = await storage.getGroups();
      setGroups(cached);

      // 2. Fetch from server if online
      if (isOnline && user?.id) {
        const { data, error } = await supabase
          .from('groups')
          .select('*')
          .eq('staff_id', user.id)
          .order('name', { ascending: true });

        if (error) {
          console.error('Error loading groups from server:', error);
        } else if (data) {
          const serverGroups = data.map(g => ({ ...g, synced: true }));
          const serverIds = new Set(serverGroups.map(g => g.id));
          const localToKeep = cached.filter(g => !serverIds.has(g.id));
          const merged = [...serverGroups, ...localToKeep];
          await storage.setItem(STORAGE_KEYS.GROUPS, merged);
          setGroups(merged);
        }
      }
    } catch (error) {
      console.error('Error in loadGroups:', error);
    }
  };

  /**
   * Add a new group
   */
  const addGroup = async (groupData) => {
    try {
      const group = {
        id: uuidv4(),
        ...groupData,
        staff_id: user.id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        synced: false,
      };

      await storage.saveGroup(group);
      setGroups([...groups, group]);
      await refreshSyncStatus();

      return { success: true, group };
    } catch (error) {
      console.error('Error adding group:', error);
      return { success: false, error };
    }
  };

  /**
   * Update a group's information
   */
  const updateGroup = async (groupId, updates) => {
    try {
      const updated = {
        ...updates,
        updated_at: new Date().toISOString(),
        synced: false,
      };

      await storage.updateGroup(groupId, updated);

      setGroups(
        groups.map(g =>
          g.id === groupId ? { ...g, ...updated } : g
        )
      );

      await refreshSyncStatus();

      return { success: true };
    } catch (error) {
      console.error('Error updating group:', error);
      return { success: false, error };
    }
  };

  /**
   * Delete a group
   * Also removes all child-group memberships
   */
  const deleteGroup = async (groupId) => {
    try {
      await storage.deleteGroup(groupId);
      setGroups(groups.filter(g => g.id !== groupId));

      // Remove all memberships for this group (state + storage)
      const updatedMemberships = childrenGroups.filter(
        cg => cg.group_id !== groupId
      );
      await storage.setItem(STORAGE_KEYS.CHILDREN_GROUPS, updatedMemberships);
      setChildrenGroups(updatedMemberships);

      return { success: true };
    } catch (error) {
      console.error('Error deleting group:', error);
      return { success: false, error };
    }
  };

  /**
   * Load children-groups junction data
   */
  const loadChildrenGroups = async () => {
    try {
      // 1. Load from cache
      const cached = await storage.getChildrenGroups();
      setChildrenGroups(cached);

      // 2. Fetch from server if online
      if (isOnline && user?.id) {
        // Fetch all children_groups for groups owned by this user
        const { data: userGroups } = await supabase
          .from('groups')
          .select('id')
          .eq('staff_id', user.id);

        if (userGroups && userGroups.length > 0) {
          const groupIds = userGroups.map(g => g.id);

          const { data, error } = await supabase
            .from('children_groups')
            .select('*')
            .in('group_id', groupIds);

          if (error) {
            console.error('Error loading children_groups from server:', error);
          } else if (data) {
            const serverMemberships = data.map(m => ({ ...m, synced: true }));
            const serverIds = new Set(serverMemberships.map(m => m.id));
            const localToKeep = cached.filter(m => !serverIds.has(m.id));
            const merged = [...serverMemberships, ...localToKeep];
            await storage.setItem(STORAGE_KEYS.CHILDREN_GROUPS, merged);
            setChildrenGroups(merged);
          }
        }
      }
    } catch (error) {
      console.error('Error in loadChildrenGroups:', error);
    }
  };

  /**
   * Add a child to a group
   */
  const addChildToGroup = async (childId, groupId) => {
    try {
      // Check if already exists
      const exists = childrenGroups.some(
        cg => cg.child_id === childId && cg.group_id === groupId
      );

      if (exists) {
        return { success: false, error: 'Child already in group' };
      }

      const membership = {
        id: uuidv4(),
        child_id: childId,
        group_id: groupId,
        created_at: new Date().toISOString(),
        synced: false,
      };

      await storage.saveChildrenGroup(membership);
      setChildrenGroups([...childrenGroups, membership]);
      await refreshSyncStatus();

      return { success: true, membership };
    } catch (error) {
      console.error('Error adding child to group:', error);
      return { success: false, error };
    }
  };

  /**
   * Remove a child from a group
   */
  const removeChildFromGroup = async (childId, groupId) => {
    try {
      await storage.deleteChildrenGroup(childId, groupId);

      setChildrenGroups(
        childrenGroups.filter(
          cg => !(cg.child_id === childId && cg.group_id === groupId)
        )
      );

      return { success: true };
    } catch (error) {
      console.error('Error removing child from group:', error);
      return { success: false, error };
    }
  };

  /**
   * Get all children in a specific group.
   * Filters against visibleChildren so hidden children can't leak into
   * session selection (ChildSelector) or group counts (GroupPickerBottomSheet).
   */
  const getChildrenInGroup = (groupId) => {
    const membershipIds = childrenGroups
      .filter(cg => cg.group_id === groupId)
      .map(cg => cg.child_id);

    return visibleChildren.filter(c => membershipIds.includes(c.id));
  };

  /**
   * Get all groups a child belongs to
   */
  const getGroupsForChild = (childId) => {
    const groupIds = childrenGroups
      .filter(cg => cg.child_id === childId)
      .map(cg => cg.group_id);

    return groups.filter(g => groupIds.includes(g.id));
  };

  // `children` is the filtered active list — what every list view, picker, and
  // stats helper should consume. `allChildren` exposes the unfiltered set
  // including soft-deleted (hidden_at IS NOT NULL) records — only use it for
  // historical name resolution where dropping a name to "Unknown" would degrade UX.
  return (
    <ChildrenContext.Provider
      value={{
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
      }}
    >
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
