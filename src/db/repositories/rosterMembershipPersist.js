// Apply inside the caller's writer transaction. Only server-provided exits can
// close an old membership; an unresolved open pair waits for a complete replay.
export async function persistRosterMemberships(txn, rows, { childrenRepository }) {
  const result = { saved: 0, skipped: [] };
  const closed = rows.filter(row => row.exited_at != null);
  const open = rows.filter(row => row.exited_at == null);

  for (const row of [...closed, ...open]) {
    if (row.exited_at == null) {
      const conflict = await txn.getFirstAsync(`
        select id from child_class_memberships
        where child_id = ? and academic_year_id = ?
          and exited_at is null and id <> ?
        limit 1
      `, row.child_id, row.academic_year_id, row.id);
      if (conflict) {
        result.skipped.push({ id: row.id, reason: 'conflicting_open_membership' });
        console.warn(`Skipping roster membership ${row.id}: conflicting_open_membership (${conflict.id})`);
        continue;
      }
    }

    // This helper consumes server rows. Mark them synced so the repository keeps
    // its per-id pull guard and never treats hydration as an outbox-producing edit.
    const saved = await childrenRepository.saveChildClassMembership({
      ...row,
      synced: true,
      sync_status: 'synced',
    }, { transaction: txn });
    if (saved === false) {
      result.skipped.push({ id: row.id, reason: 'local_row_preserved' });
    } else {
      result.saved += 1;
    }
  }
  return result;
}
