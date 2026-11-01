jest.mock('@react-native-community/netinfo',()=>({fetch:jest.fn(async()=>({type:'wifi',isConnected:true,isInternetReachable:true}))}));
import { getDefaultTestHandle, TEST_ACTOR_ID } from '../test-support/defaultTestHandle';
// Observe recording/cadence here; diagnosticBundle.test exercises detached capture.
beforeEach(async () => {
  await getDefaultTestHandle().services.repositories.localState.set('support_auto_bundle_last_at', new Date().toISOString());
});
const seed = async () => {
  const h = getDefaultTestHandle();
  await h.withTransaction(async txn => {
    await txn.runAsync("insert into children (id,first_name,last_name,row_version,sync_status) values ('c','Raw','Child',7,'terminal')");
    await txn.runAsync(`insert into sync_outbox (id,table_name,record_id,operation,payload,owner_user_id,status,error_class,error_code,last_error)
      values ('o','children','c','update','{"id":"c","first_name":"Raw"}',?,'terminal','terminal','MV001','raw error')`, TEST_ACTOR_ID);
  });
  return h;
};
test('unchanged terminal refreshes skip the writer until the observation is fifteen minutes old', async () => {
  const h = await seed();
  const write = jest.spyOn(h, 'withTransaction');
  jest.useFakeTimers();
  try {
    const start = Date.now();
    await h.services.syncEngine.getSyncStatus();
    const db = await h.getReader();
    const first = await db.getFirstAsync('select * from support_incident_queue');
    write.mockClear();
    jest.setSystemTime(start + 30000);
    await h.services.syncEngine.getSyncStatus();
    expect(write).not.toHaveBeenCalled();
    expect(await db.getFirstAsync('select * from support_incident_queue')).toEqual(first);
    jest.setSystemTime(start + 15 * 60000 - 1);
    await h.services.syncEngine.getSyncStatus();
    expect(write).not.toHaveBeenCalled();
    jest.setSystemTime(start + 15 * 60000);
    await h.services.syncEngine.getSyncStatus();
    expect(write).toHaveBeenCalledTimes(1);
    expect(await h.services.repositories.supportIncidents.get(first.id)).toMatchObject({
      last_seen_at: new Date(start + 15 * 60000).toISOString(), occurrence_count: 1,
    });
  } finally {
    jest.useRealTimers();
    write.mockRestore();
  }
});
test('canonical payload comparison ignores object key order and preserves bundle outcome flags without a write', async () => {
  const h = await seed();
  await h.services.syncEngine.getSyncStatus();
  const db = await h.getReader();
  const first = await db.getFirstAsync('select * from support_incident_queue');
  const payload = JSON.parse(first.payload);
  payload.wirePayload = Object.fromEntries(Object.entries(payload.wirePayload).reverse());
  const reordered = { bundleCaptureFailed: true, ...Object.fromEntries(Object.entries(payload).reverse()) };
  const observed = JSON.parse(first.observed);
  observed.device.deviceName = 'A different device name is not a release change';
  await h.withTransaction(txn => txn.runAsync('update support_incident_queue set payload = ?, observed = ? where id = ?',
    JSON.stringify(reordered), JSON.stringify(observed), first.id));
  const write = jest.spyOn(h, 'withTransaction');
  try {
    await h.services.syncEngine.getSyncStatus();
    expect(write).not.toHaveBeenCalled();
    expect((await h.services.repositories.supportIncidents.get(first.id)).payload).toEqual(reordered);
  } finally { write.mockRestore(); }
});
test('changed terminal payload is recorded immediately while retaining attachment outcomes', async () => {
  const h = await seed();
  await h.services.syncEngine.getSyncStatus();
  const [first] = await h.services.repositories.supportIncidents.listPending();
  await h.services.repositories.supportIncidents.updateBundle({ id: first.id, reportGeneration: 1 },
    { flags: { bundleCaptureFailed: true } });
  await h.withTransaction(txn => txn.runAsync("update sync_outbox set last_error = 'new raw evidence' where id = 'o'"));
  const write = jest.spyOn(h, 'withTransaction');
  try {
    await h.services.syncEngine.getSyncStatus();
    expect(write).toHaveBeenCalledTimes(1);
    expect(await h.services.repositories.supportIncidents.get(first.id)).toMatchObject({
      payload: { lastError: 'new raw evidence', bundleCaptureFailed: true }, occurrence_count: 1,
    });
    write.mockClear();
    await h.services.syncEngine.getSyncStatus();
    expect(write).not.toHaveBeenCalled();
  } finally { write.mockRestore(); }
});
test.each([['application', 'version'], ['application', 'build'], ['update', 'id']])(
  'a changed %s.%s release value records and promotes immediately', async (section, field) => {
    const h = await seed();
    await h.services.syncEngine.getSyncStatus();
    const repo = h.services.repositories.supportIncidents;
    const [first] = await repo.listPending();
    const previous = JSON.parse(JSON.stringify(first.observed));
    previous[section][field] = 'previous release';
    await h.withTransaction(txn => txn.runAsync('update support_incident_queue set observed = ? where id = ?', JSON.stringify(previous), first.id));
    await repo.markSent({ id: first.id, reportGeneration: 1 }, { release: previous });
    const write = jest.spyOn(h, 'withTransaction');
    try {
      expect((await h.services.syncEngine.getSyncStatus()).incidentReadyCount).toBe(1);
      expect(write).toHaveBeenCalledTimes(1);
      expect(await repo.get(first.id)).toMatchObject({ status: 'pending', report_generation: 2, observed: first.observed });
    } finally { write.mockRestore(); }
  }
);
test('status observes committed terminal evidence without changing outbox or domain state', async () => {
  const h = await seed(); const db = await h.getReader();
  const before = await db.getFirstAsync("select * from sync_outbox where id = 'o'");
  await h.services.syncEngine.getSyncStatus();
  const rows = await db.getAllAsync('select * from support_incident_queue');
  expect(rows).toHaveLength(1);
  expect(JSON.parse(rows[0].payload)).toMatchObject({ table: 'children', recordId: 'c', serverRecordId: 'c', errorCode: 'MV001', wirePayload: { id: 'c', first_name: 'Raw' } });
  await h.services.syncEngine.getSyncStatus();
  expect(await db.getAllAsync('select * from support_incident_queue')).toHaveLength(1);
  expect(await db.getFirstAsync("select * from sync_outbox where id = 'o'")).toEqual(before);
  expect(await db.getFirstAsync("select row_version,sync_status from children where id = 'c'")).toEqual({row_version:7,sync_status:'terminal'});
});
test('old backlog needs recent actual server contact and carries distinct raw errors and aggregates', async () => {
  const h = await seed();
  await h.withTransaction(txn => txn.runAsync("update sync_outbox set status = 'failed', created_at = ? where id = 'o'", new Date(Date.now()-73*3600000).toISOString()));
  await h.services.syncEngine.getSyncStatus();
  expect(await h.services.repositories.supportIncidents.listPending()).toHaveLength(0);
  h.lastServerResponseAt = new Date().toISOString();
  await h.services.syncEngine.getSyncStatus();
  expect((await h.services.repositories.supportIncidents.listPending())[0]).toMatchObject({ kind: 'upload_backlog_stale', payload: { unsentByCode: {MV001:1}, sampleLastErrors: ['raw error'] } });
});
test('empty-outbox history failures and breaker notes use actual scope families and raw stored evidence', async () => {
  const h = getDefaultTestHandle();
  const failure = { lastFailureAt: new Date(Date.now()-25*3600000).toISOString(), lastFailureKind: 'transport', lastFailureMessage: 'raw history error' };
  await h.services.repositories.syncState.setPullState('session_history_pull:ea:programme', { cursor: JSON.stringify(failure) });
  await h.services.repositories.syncState.setPullState('pull_reconcile_breaker:children:full:scope', { cursor: JSON.stringify({ scope:'children:full:scope', candidateCount:40,wouldEndCount:30,triggeredAt:'raw-time' }) });
  await h.services.syncEngine.getSyncStatus();
  const rows = await h.services.repositories.supportIncidents.listPending();
  expect(rows).toHaveLength(2);
  expect(rows.find(r => r.kind === 'pull_failing').payload).toMatchObject({ scopeFamily:'session_history_pull', scope:'session_history_pull:ea:programme', lastFailureMessage:'raw history error', cursor:failure });
  expect(rows.find(r => r.kind === 'reconcile_breaker_tripped').payload).toMatchObject({ scope:'children:full:scope',candidateCount:40,wouldEndCount:30 });
});
test('foreign quarantine commits with zero incident writes; independent observer failure cannot undo it', async () => {
  const h = await seed();
  await h.withTransaction(async txn => {
    await txn.runAsync("update sync_outbox set owner_user_id = 'other' where id = 'o'");

  });
  await (await require('../test-support/testDatabase').getTestWriter()).execAsync("create trigger incident_disk_error before insert on support_incident_queue begin select raise(abort,'incident disk failure'); end;");
  await expect(h.services.repositories.syncOutbox.quarantineForeignOwners({fileUserId:h.userId})).resolves.toMatchObject({total:1});
  await h.services.syncEngine.getSyncStatus();
  expect(await (await h.getReader()).getFirstAsync("select status,error_code from sync_outbox where id = 'o'")).toEqual({status:'terminal',error_code:'FOREIGN_OWNER'});
});
test('capturing is excluded from ready until exact ten-minute recovery; observing does not heartbeat it', async () => {
  const h = await seed(); await h.services.syncEngine.getSyncStatus();
  const db = await h.getReader(); const [row] = await db.getAllAsync('select * from support_incident_queue');
  const start = new Date(Date.now()-599000).toISOString();
  await h.withTransaction(txn => txn.runAsync("update support_incident_queue set bundle_state = 'capturing', updated_at = ? where id = ?", start,row.id));
  expect((await h.services.syncEngine.getSyncStatus()).incidentReadyCount).toBe(0);
  expect((await h.services.repositories.supportIncidents.get(row.id)).updated_at).toBe(start);
  await h.withTransaction(txn => txn.runAsync('update support_incident_queue set updated_at = ? where id = ?',new Date(Date.now()-600000).toISOString(),row.id));
  expect((await h.services.syncEngine.getSyncStatus()).incidentReadyCount).toBe(1);
  expect(await h.services.repositories.supportIncidents.get(row.id)).toMatchObject({bundle_state:'failed',payload:{bundleCaptureFailed:true}});
});
test('MV001 finalizer survives a failed observer write and reopen without replaying the stale domain payload', async () => {
  const { createOutboxSyncEngine } = require('../src/services/offlineSync');
  const { createSupabaseMock } = require('../test-support/supabaseSyncMock');
  const h = await seed();
  await h.withTransaction(async txn => {
    await txn.runAsync("update sync_outbox set status = 'pending', error_code = null, error_class = null where id = 'o'");
    await txn.runAsync("update children set sync_status = 'pending' where id = 'c'");
  });
  const { supabaseClient,calls } = createSupabaseMock({updateResults:{children:{error:{code:'MV001',message:'newer server row'}}}});
  const engine = createOutboxSyncEngine({database:h,supabaseClient,enqueueRequest:h.enqueueRequest,getAuthSession:async()=>({data:{session:{user:{id:h.userId}}}})});
  await engine.syncAll({tableName:'children'});
  const db = await h.getReader();
  const before = await db.getFirstAsync("select * from sync_outbox where id = 'o'");
  expect(before).toMatchObject({status:'terminal',error_code:'MV001'});
  const domain = await db.getFirstAsync("select * from children where id = 'c'");
  await (await require('../test-support/testDatabase').getTestWriter()).execAsync("create trigger observer_fail before insert on support_incident_queue begin select raise(abort,'observer write failed'); end;");
  await h.services.syncEngine.getSyncStatus();
  expect(await db.getFirstAsync("select * from sync_outbox where id = 'o'")).toEqual(before);
  expect(await db.getFirstAsync("select * from children where id = 'c'")).toEqual(domain);
  const {requestClose,whenDisposed}=require('../src/session/signedInHandle');
  await requestClose({reason:'MV001 reopen'}); await whenDisposed(h.fileName);
  const reopened = await require('../test-support/testDatabase').openDefaultTestHandle();
  const next = createOutboxSyncEngine({database:reopened,supabaseClient,enqueueRequest:reopened.enqueueRequest,getAuthSession:async()=>({data:{session:{user:{id:reopened.userId}}}})});
  const n = calls.length;
  await next.syncAll();
  expect(calls).toHaveLength(n);
  expect(await (await reopened.getReader()).getFirstAsync("select * from children where id = 'c'")).toEqual(domain);
});
test('status refresh promotes a post-freeze second event at 24 hours and enables an incident-only pass',async()=>{
 const h=getDefaultTestHandle();const repo=h.services.repositories.supportIncidents;let first;
 await h.withTransaction(async txn=>{first=await repo.record(txn,'app_error_caught',['repeat'],{message:'first'},{event:true});});
 await repo.freeze(first.incidentRef);
 await h.withTransaction(txn=>repo.record(txn,'app_error_caught',['repeat'],{message:'second'},{event:true}));
 await repo.markSent(first.incidentRef,{now:new Date(Date.now()-86400000).toISOString()});
 const status=await h.services.syncEngine.getSyncStatus();
 expect(status).toMatchObject({incidentReadyCount:1,readyCount:0,unsyncedCount:0});
 expect(await repo.get(first.incidentRef.id)).toMatchObject({report_generation:2,status:'pending'});
});
test('an empty status refresh does not wait for the domain writer when there is nothing to observe or promote',async()=>{
 const h=getDefaultTestHandle();let enter;let release;
 const entered=new Promise(r=>{enter=r;});const gate=new Promise(r=>{release=r;});
 const writer=h.withTransaction(async()=>{enter();await gate;});await entered;
 let timer;
 try {
  const result=await Promise.race([h.services.syncEngine.getSyncStatus(),new Promise(r=>{timer=setTimeout(()=>r('blocked by writer'),200);})]);
  expect(result).toMatchObject({incidentReadyCount:0,unsyncedCount:0});
 } finally {clearTimeout(timer);release();await writer;}
});

test('a skill walk failing for a day raises pull_failing', async () => {
  const h = getDefaultTestHandle();
  const failure = { lastFailureAt: new Date(Date.now()-25*3600000).toISOString(), lastFailureKind: 'query', lastFailureMessage: 'missing RPC' };
  await h.services.repositories.syncState.setPullState('skill_mastery_pull:ea', { cursor: JSON.stringify(failure) });
  await h.services.syncEngine.getSyncStatus();
  const rows = await h.services.repositories.supportIncidents.listPending();
  expect(rows.find(row => row.kind === 'pull_failing')).toMatchObject({ payload: { scopeFamily: 'skill_mastery_pull', cursor: failure } });
});
