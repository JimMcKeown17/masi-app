# Chapter 9: The Group Selection Feature - User Experience Design

## The Requirement

Staff work with groups of children (e.g., "Group 2" has 7 children). When recording a session, they should be able to:
1. Select individual children
2. Select an entire group (automatically selecting all children in that group)

## UX Pattern: Multi-Step Selection

**Flow**:
```
1. Search/filter children and groups
2. Tap to add to "Selected" list
3. Selected items show as removable chips
4. Submit session with selection
```

**Why this pattern?**
- **Clear state**: Always see what's selected
- **Easy to remove**: Tap X on chip to remove
- **Bulk + individual**: Can select Group 2, then remove one child from it
- **Familiar**: Similar to email recipient selection

**Group selection logic**:
```javascript
const selectGroup = (groupId) => {
  // Find all children in this group
  const childrenInGroup = childrenGroupsJunction
    .filter(cg => cg.group_id === groupId)
    .map(cg => cg.child_id);

  // Add to selection (using Set to avoid duplicates)
  setSelectedChildren(prev =>
    [...new Set([...prev, ...childrenInGroup])]
  );

  // Track which groups were used
  setSelectedGroups(prev => [...prev, groupId]);
};
```

**Database storage**:
```javascript
{
  session_id: 'uuid',
  children_ids: ['child_1', 'child_2', 'child_3', ...],
  group_ids: ['group_2'],  // Remember group was used
  ...
}
```

**Why store both children_ids and group_ids?**
- `children_ids`: The actual children in this specific session (even if group changes later)
- `group_ids`: Historical context ("This was a Group 2 session")

---

**Last Updated**: 2026-01-27
