import React, { createContext, useState, useEffect, useContext } from 'react';
import { supabase } from '../services/supabaseClient';
import { storage, STORAGE_KEYS } from '../utils/storage';
import { useAuth } from './AuthContext';
import { useOffline } from './OfflineContext';
import { v4 as uuidv4 } from 'uuid';

const ChildrenContext = createContext({});

export const ChildrenProvider = ({ children }) => {
  const { user } = useAuth();
  const { isOnline, refreshSyncStatus } = useOffline();

  const [childrenList, setChildrenList] = useState([]);
  const [groups, setGroups] = useState([]);
  const [childrenGroups, setChildrenGroups] = useState([]);
  const [loading, setLoading] = useState(false);

  // Load data on mount when user is authenticated
  useEffect(() => {
    if (user?.id) {
      loadChildren();
      loadGroups();
      loadChildrenGroups();
    }
  }, [user?.id]);

  /**
   * Load children assigned to current user
   * Cache-first pattern: show cached data immediately, then fetch from server
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
          // Save to cache and update state
          await storage.setItem(STORAGE_KEYS.CHILDREN, data);
          setChildrenList(data);
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
   * Delete a child
   * Note: This only removes from local storage. Server deletion handled by sync.
   */
  const deleteChild = async (childId) => {
    try {
      await storage.deleteChild(childId);
      setChildrenList(childrenList.filter(c => c.id !== childId));

      return { success: true };
    } catch (error) {
      console.error('Error deleting child:', error);
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
          await storage.setItem(STORAGE_KEYS.GROUPS, data);
          setGroups(data);
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

      // Remove all memberships for this group
      const updatedMemberships = childrenGroups.filter(
        cg => cg.group_id !== groupId
      );
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
            await storage.setItem(STORAGE_KEYS.CHILDREN_GROUPS, data);
            setChildrenGroups(data);
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
   * Get all children in a specific group
   */
  const getChildrenInGroup = (groupId) => {
    const membershipIds = childrenGroups
      .filter(cg => cg.group_id === groupId)
      .map(cg => cg.child_id);

    return childrenList.filter(c => membershipIds.includes(c.id));
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

  return (
    <ChildrenContext.Provider
      value={{
        children: childrenList,
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
