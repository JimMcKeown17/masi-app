import AsyncStorage from '@react-native-async-storage/async-storage';
import { storage, STORAGE_KEYS } from '../src/utils/storage';

// Following the convention in ClassesContext.test.js: full provider mounting
// requires Auth/Offline/Children stacked together, so we test the storage-level
// operations and merge logic that ChildrenContext orchestrates. The visibleChildren
// derivation is `childrenList.filter(c => !c.hidden_at)` — we verify that filter
// shape against representative inputs.

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('hidden children — storage-level soft-delete', () => {
  test('storage.updateChild persists hidden_at + synced:false on the target row', async () => {
    await storage.saveChild({
      id: 'child-1',
      first_name: 'Asanda',
      last_name: 'M',
      synced: true,
    });
    await storage.saveChild({
      id: 'child-2',
      first_name: 'Bongani',
      last_name: 'K',
      synced: true,
    });

    const hiddenAt = '2026-04-30T10:15:00.000Z';
    const ok = await storage.updateChild('child-1', {
      hidden_at: hiddenAt,
      synced: false,
      updated_at: hiddenAt,
    });

    expect(ok).toBe(true);

    const all = await storage.getChildren();
    const c1 = all.find(c => c.id === 'child-1');
    const c2 = all.find(c => c.id === 'child-2');

    expect(c1.hidden_at).toBe(hiddenAt);
    expect(c1.synced).toBe(false);
    expect(c2.hidden_at).toBeUndefined();
    expect(c2.synced).toBe(true);
  });

  test('storage.updateChild returns false for an unknown id (deleteChild validation path)', async () => {
    await storage.saveChild({ id: 'child-1', first_name: 'A', last_name: 'M', synced: true });

    const ok = await storage.updateChild('nonexistent-id', {
      hidden_at: '2026-04-30T10:15:00.000Z',
      synced: false,
    });

    expect(ok).toBe(false);
  });

  test('hidden child remains in @children AsyncStorage so allChildren can resolve names later', async () => {
    await storage.saveChild({ id: 'child-1', first_name: 'A', last_name: 'M', synced: true });
    await storage.updateChild('child-1', {
      hidden_at: '2026-04-30T10:15:00.000Z',
      synced: false,
    });

    const all = await storage.getChildren();
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe('child-1');
    expect(all[0].hidden_at).toBeTruthy();
  });
});

describe('hidden children — visibleChildren filter shape', () => {
  // Mirrors the React.useMemo derivation inside ChildrenContext:
  //   visibleChildren = childrenList.filter(c => !c.hidden_at)
  const filterVisible = (list) => list.filter(c => !c.hidden_at);

  test('excludes children with hidden_at set', () => {
    const list = [
      { id: '1', first_name: 'A', hidden_at: null },
      { id: '2', first_name: 'B', hidden_at: '2026-04-30T10:15:00.000Z' },
      { id: '3', first_name: 'C' },
    ];
    const visible = filterVisible(list);
    expect(visible.map(c => c.id)).toEqual(['1', '3']);
  });

  test('treats explicit null and undefined as visible', () => {
    const list = [
      { id: '1', hidden_at: null },
      { id: '2', hidden_at: undefined },
      { id: '3' },
    ];
    expect(filterVisible(list)).toHaveLength(3);
  });

  test('a hidden child can be looked up via the equivalent of getChildById (full list)', () => {
    const list = [
      { id: '1', first_name: 'A', hidden_at: null },
      { id: '2', first_name: 'B', hidden_at: '2026-04-30T10:15:00.000Z' },
    ];

    // getChildById uses the unfiltered list — equivalent to childrenList.find
    const found = list.find(c => c.id === '2');
    expect(found).toBeTruthy();
    expect(found.first_name).toBe('B');
  });
});

describe('hidden children — getChildrenInGroup must filter against visibleChildren', () => {
  // Mirrors the ChildrenContext helper: it filters visibleChildren by group
  // membership ids. Hidden children must not be returned even if their
  // childrenGroups membership row still exists.
  const getChildrenInGroup = (children, childrenGroups, groupId) => {
    const membershipIds = childrenGroups
      .filter(cg => cg.group_id === groupId)
      .map(cg => cg.child_id);
    const visible = children.filter(c => !c.hidden_at);
    return visible.filter(c => membershipIds.includes(c.id));
  };

  test('hidden child with active group membership is excluded', () => {
    const children = [
      { id: 'c1', hidden_at: null },
      { id: 'c2', hidden_at: '2026-04-30T10:15:00.000Z' },
    ];
    const childrenGroups = [
      { child_id: 'c1', group_id: 'g1' },
      { child_id: 'c2', group_id: 'g1' },
    ];
    const result = getChildrenInGroup(children, childrenGroups, 'g1');
    expect(result.map(c => c.id)).toEqual(['c1']);
  });

  test('returns empty array when group has only hidden children', () => {
    const children = [{ id: 'c1', hidden_at: '2026-04-30T10:15:00.000Z' }];
    const childrenGroups = [{ child_id: 'c1', group_id: 'g1' }];
    expect(getChildrenInGroup(children, childrenGroups, 'g1')).toEqual([]);
  });
});

describe('hidden children — cross-device merge propagation', () => {
  // Mirrors the merge in loadChildren: serverChildren is authoritative for
  // ids in the response; localToKeep retains records the server didn't return.
  // With NO server-side hidden_at filter, hidden children come back from the
  // server with hidden_at set, overwriting any stale local copy.
  const mergeChildren = (cached, serverChildren) => {
    const serverIds = new Set(serverChildren.map(c => c.id));
    const localToKeep = cached.filter(c => !serverIds.has(c.id));
    return [...serverChildren, ...localToKeep];
  };

  test('server hidden_at overwrites stale local null on the same id', () => {
    const cached = [
      { id: 'c1', first_name: 'A', hidden_at: null, synced: true },
    ];
    const serverChildren = [
      { id: 'c1', first_name: 'A', hidden_at: '2026-04-30T10:15:00.000Z', synced: true },
    ];
    const merged = mergeChildren(cached, serverChildren);

    expect(merged).toHaveLength(1);
    expect(merged[0].hidden_at).toBe('2026-04-30T10:15:00.000Z');
  });

  test('local-only unsynced children are preserved across the merge', () => {
    const cached = [
      { id: 'c1', synced: true },
      { id: 'c2', synced: false }, // local-only, not yet pushed
    ];
    const serverChildren = [{ id: 'c1', synced: true }];
    const merged = mergeChildren(cached, serverChildren);
    const ids = merged.map(c => c.id).sort();
    expect(ids).toEqual(['c1', 'c2']);
  });

  test('locally-hidden record stays in cache when server has not yet acknowledged the hide', () => {
    const cached = [
      {
        id: 'c1',
        synced: false,
        hidden_at: '2026-04-30T10:15:00.000Z',
      },
    ];
    const serverChildren = []; // server doesn't have it yet (or it's not returned)
    const merged = mergeChildren(cached, serverChildren);

    expect(merged).toHaveLength(1);
    expect(merged[0].hidden_at).toBe('2026-04-30T10:15:00.000Z');
    expect(merged[0].synced).toBe(false);
  });
});
