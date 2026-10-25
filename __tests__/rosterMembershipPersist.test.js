jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));

import { runMigrations } from '../src/db/migrations';
import { persistRosterMemberships } from '../src/db/repositories/rosterMembershipPersist';
import { createChildrenRepository } from '../src/db/repositories/childrenRepository';
import { createMigratedDatabase, seedCoreData } from '../test-support/sqliteRepositoryTestUtils';

let db;
let childrenRepository;
const oldOpen = (overrides = {}) => ({
  id: 'membership-a', child_id: 'child-1', class_id: 'class-1', academic_year_id: 'year-2026',
  enrolled_at: '2026-02-01T08:00:00.000Z', exited_at: null, created_by: 'head-office',
  created_at: '2026-02-01T08:00:00.000Z', updated_at: '2026-02-01T08:00:00.000Z',
  server_updated_at: '2026-02-01T08:00:00.000Z', row_version: 1,
  ...overrides,
});
const closedA = (overrides = {}) => oldOpen({
  exited_at: '2026-06-01T08:00:00.000Z', row_version: 2,
  updated_at: '2026-06-02T08:00:00.000Z', server_updated_at: '2026-06-02T08:00:00.000Z',
  ...overrides,
});
const openB = (overrides = {}) => oldOpen({
  id: 'membership-b', class_id: 'class-2', enrolled_at: '2026-06-01T08:00:00.000Z',
  updated_at: '2026-06-02T08:00:00.000Z', server_updated_at: '2026-06-02T08:00:00.000Z',
  ...overrides,
});
const saveServer = (row) => childrenRepository.saveChildClassMembership({ ...row, synced: true, sync_status: 'synced' });
const read = (id = 'membership-a') => db.getFirstAsync('select * from child_class_memberships where id = ?', id);

beforeEach(async () => {
  db = await createMigratedDatabase(runMigrations);
  await seedCoreData(db);
  await db.runAsync(`insert into classes (id, school_id, name, grade, academic_year_id)
    values ('class-2', 'school-1', 'B', '1', 'year-2026')`);
  await db.runAsync(`insert into children (id, first_name, last_name, class_id)
    values ('child-1', 'Control', 'Child', 'class-1'), ('child-2', 'Another', 'Child', 'class-1')`);
  childrenRepository = createChildrenRepository({ database: db });
});
afterEach(async () => { jest.restoreAllMocks(); await db.closeAsync(); });

// Characterize the existing repository contract before relying on it. These
// tests deliberately document timestamp/equal-version limits rather than change it.
describe('existing same-id membership guard', () => {
  it('rejects a lower numeric row_version even when its timestamps are later', async () => {
    await saveServer(closedA());
    const before = await read();
    expect(await saveServer(oldOpen({ updated_at: '2026-07-01T08:00:00.000Z',
      server_updated_at: '2026-07-01T08:00:00.000Z' }))).toBe(false);
    expect(await read()).toEqual(before);
  });

  it.each(['pending', 'failed'])('preserves a %s local row against a higher-version same-id pull', async syncStatus => {
    await saveServer(oldOpen());
    await db.runAsync('update child_class_memberships set sync_status = ? where id = ?', syncStatus, 'membership-a');
    const before = await read();
    expect(await saveServer(closedA({ row_version: 9 }))).toBe(false);
    expect(await read()).toEqual(before);
  });

  it('characterizes the gap: an equal-version older timestamp can reopen the same id', async () => {
    await saveServer(closedA());
    expect(await saveServer(oldOpen({ row_version: 2 }))).toBe(true);
    expect(await read()).toEqual(expect.objectContaining({
      id: 'membership-a', exited_at: null, row_version: 2,
      updated_at: '2026-02-01T08:00:00.000Z', server_updated_at: '2026-02-01T08:00:00.000Z',
    }));
  });

  it('characterizes the gap: an incoming row without a version can reopen the same id', async () => {
    await saveServer(closedA());
    const { row_version, ...unversioned } = oldOpen();
    expect(await saveServer(unversioned)).toBe(true);
    expect(await read()).toEqual(expect.objectContaining({ exited_at: null, row_version: 2 }));
  });

  it('characterizes terminal convergence: a lower-version same-id server row can replace it', async () => {
    await saveServer(closedA());
    await db.runAsync("update child_class_memberships set sync_status = 'terminal' where id = 'membership-a'");
    expect(await saveServer(oldOpen())).toBe(true);
    expect(await read()).toEqual(expect.objectContaining({ exited_at: null, row_version: 1, sync_status: 'synced' }));
  });
});

const persist = (rows) => db.withExclusiveTransactionAsync(txn => (
  persistRosterMemberships(txn, rows, { childrenRepository })
));
const readAll = () => db.getAllAsync('select * from child_class_memberships order by id');
const outbox = () => db.getAllAsync('select * from sync_outbox order by id');
const expectMove = async (replacement = openB()) => {
  expect(await read()).toEqual(expect.objectContaining({
    id: 'membership-a', exited_at: closedA().exited_at, row_version: 2, sync_status: 'synced',
    server_updated_at: closedA().server_updated_at,
  }));
  expect(await read('membership-b')).toEqual(expect.objectContaining({
    id: 'membership-b', class_id: 'class-2', exited_at: null,
    enrolled_at: replacement.enrolled_at, row_version: 1, sync_status: 'synced',
  }));
  expect(await outbox()).toEqual([]);
};

describe('server roster membership convergence', () => {
  it.each([
    ['later', '2026-06-01T08:00:00.000Z'],
    ['equal', '2026-02-01T08:00:00.000Z'],
    ['earlier', '2026-01-20T08:00:00.000Z'],
  ])('closes A before inserting B with a %s enrolled_at, using only the supplied server exit', async (_, enrolledAt) => {
    await saveServer(oldOpen());
    const replacement = openB({ enrolled_at: enrolledAt });
    const rows = [replacement, closedA()];
    const original = JSON.parse(JSON.stringify(rows));
    expect(await persist(rows)).toEqual({ saved: 2, skipped: [] });
    await expectMove(replacement);
    expect(rows).toEqual(original);
  });

  it('skips B first, closes A later, and converges when the complete server batch is replayed', async () => {
    const warning = jest.spyOn(console, 'warn').mockImplementation(() => {});
    await saveServer(oldOpen());
    const before = await read();
    expect(await persist([openB()])).toEqual({
      saved: 0, skipped: [{ id: 'membership-b', reason: 'conflicting_open_membership' }],
    });
    expect(warning).toHaveBeenCalledTimes(1);
    expect(await read()).toEqual(before);
    expect(await read('membership-b')).toBeNull();
    expect(await persist([closedA()])).toEqual({ saved: 1, skipped: [] });
    expect(await persist([openB(), closedA()])).toEqual({ saved: 2, skipped: [] });
    await expectMove();
  });

  it('lands B immediately when the closed-A batch arrives first, and replay keeps the same rows', async () => {
    await saveServer(oldOpen());
    expect(await persist([closedA()])).toEqual({ saved: 1, skipped: [] });
    expect(await persist([openB()])).toEqual({ saved: 1, skipped: [] });
    const converged = await readAll();
    expect(await persist([openB(), closedA()])).toEqual({ saved: 2, skipped: [] });
    expect(await readAll()).toEqual(converged);
    await expectMove();
  });

  it('delegates a stale older open A to the same-id version guard when no other open row exists', async () => {
    expect(await persist([closedA()])).toEqual({ saved: 1, skipped: [] });
    const before = await read();
    expect(await persist([oldOpen()])).toEqual({
      saved: 0, skipped: [{ id: 'membership-a', reason: 'local_row_preserved' }],
    });
    expect(await read()).toEqual(before);
    expect(await outbox()).toEqual([]);
  });

  it('cannot reopen A from an old snapshot after B has already landed', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    await saveServer(oldOpen());
    await persist([openB(), closedA()]);
    const before = await readAll();
    expect(await persist([oldOpen()])).toEqual({
      saved: 0, skipped: [{ id: 'membership-a', reason: 'conflicting_open_membership' }],
    });
    expect(await readAll()).toEqual(before);
    expect(await outbox()).toEqual([]);
  });

  it.each(['pending', 'failed'])('leaves %s A and its outbox untouched and skips B when the server also sends closed A', async syncStatus => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    await childrenRepository.saveChildClassMembership({ ...oldOpen(), sync_status: syncStatus });
    const before = await read();
    const queued = await outbox();
    expect(queued).toHaveLength(1);
    expect(await persist([openB(), closedA()])).toEqual({
      saved: 0,
      skipped: [
        { id: 'membership-a', reason: 'local_row_preserved' },
        { id: 'membership-b', reason: 'conflicting_open_membership' },
      ],
    });
    expect(await read()).toEqual(before);
    expect(await read('membership-b')).toBeNull();
    expect(await outbox()).toEqual(queued);
  });

  it('leaves a conflicting terminal A untouched instead of inferring an exit', async () => {
    const warning = jest.spyOn(console, 'warn').mockImplementation(() => {});
    await saveServer(oldOpen());
    await db.runAsync("update child_class_memberships set sync_status = 'terminal' where id = 'membership-a'");
    const before = await read();
    expect(await persist([openB()])).toEqual({
      saved: 0, skipped: [{ id: 'membership-b', reason: 'conflicting_open_membership' }],
    });
    expect(await read()).toEqual(before);
    expect(warning).toHaveBeenCalledTimes(1);
    expect(await outbox()).toEqual([]);
  });

  it('allows same-id replay and open memberships for different children or academic years', async () => {
    await saveServer(oldOpen());
    await db.runAsync(`insert into academic_years (id, label, starts_on, ends_on)
      values ('year-2025', '2025', '2025-01-01', '2025-12-31')`);
    expect(await persist([
      oldOpen(),
      openB({ id: 'another-child', child_id: 'child-2' }),
      openB({ id: 'another-year', academic_year_id: 'year-2025' }),
    ])).toEqual({ saved: 3, skipped: [] });
    expect(await readAll()).toHaveLength(3);
    expect(await outbox()).toEqual([]);
  });

  it('marks raw server rows synced even if local sync flags were passed, with no new outbox work', async () => {
    const row = { ...oldOpen(), sync_status: 'pending', synced: false };
    expect(await persist([row])).toEqual({ saved: 1, skipped: [] });
    expect(await read()).toEqual(expect.objectContaining({ sync_status: 'synced', row_version: 1, exited_at: null }));
    expect(row.sync_status).toBe('pending');
    expect(row.synced).toBe(false);
    expect(await outbox()).toEqual([]);
  });

  it('shares the caller transaction and rolls back preceding exits if a later membership fails its foreign key', async () => {
    await saveServer(oldOpen());
    const before = await readAll();
    let caught;
    try {
      await persist([closedA(), openB({ class_id: 'missing-class' })]);
    } catch (error) { caught = error; }
    expect(caught?.code).toBe('SQLITE_CONSTRAINT_FOREIGNKEY');
    expect(await readAll()).toEqual(before);
    expect(await outbox()).toEqual([]);
  });

  it('returns an empty summary for an empty batch', async () => {
    expect(await persist([])).toEqual({ saved: 0, skipped: [] });
    expect(await readAll()).toEqual([]);
    expect(await outbox()).toEqual([]);
  });
});
