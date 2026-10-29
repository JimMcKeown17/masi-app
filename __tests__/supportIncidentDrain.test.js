let mockFiles = new Map();
jest.mock('expo-file-system/next',()=>{
 class File {constructor(...p){this.uri=p.map(x=>x.uri??x).join('/');}get exists(){return mockFiles.has(this.uri);}get size(){return Buffer.byteLength(mockFiles.get(this.uri)??'');}create(){}write(x){mockFiles.set(this.uri,x);}delete(){mockFiles.delete(this.uri);}copy(f){f.write(mockFiles.get(this.uri));}async bytes(){return new Uint8Array(Buffer.from(mockFiles.get(this.uri)??''));}}
 class Directory {constructor(...p){this.uri=p.map(x=>x.uri??x).join('/');}create(){}list(){return [];}}
 return {File,Directory,Paths:{document:'file:///documents',availableDiskSpace:123,totalDiskSpace:456}};
});
jest.mock('@react-native-community/netinfo',()=>({fetch:jest.fn(async()=>({type:'wifi',isConnected:true,isInternetReachable:true}))}));
import { getDefaultTestHandle } from '../test-support/defaultTestHandle';

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as sqlite from '../test-support/expoSQLiteRealEngine';
import { seedCoreData } from '../test-support/sqliteRepositoryTestUtils';
import { createSupabaseMock } from '../test-support/supabaseSyncMock';
import { createSupportIncidentRepository, incidentRepeatKey } from '../src/db/repositories/supportIncidentRepository';
import { createSyncOutboxRepository, readUnsentSummary } from '../src/db/repositories/syncOutboxRepository';
import { createSyncStateRepository } from '../src/db/repositories/syncStateRepository';
import { createChildrenRepository } from '../src/db/repositories/childrenRepository';
import { createOutboxSyncEngine } from '../src/services/offlineSync';
import { buildIncidentEnvelope, drainSupportIncidents } from '../src/services/supportIncidents';
import { INSTALL_ID_KEY, resetInstallIdForTests } from '../src/services/installId';
import { getRuntimeDiagnostics } from '../src/utils/runtimeDiagnostics';
import { StaleActorError } from '../src/session/staleActor';

jest.mock('../src/utils/runtimeDiagnostics', () => ({ getRuntimeDiagnostics: jest.fn() }));

const A = '11111111-1111-4111-8111-111111111111';
const envelope = {
  appVersion: '1.2.0', buildNumber: '7', updateId: null,
  backend: 'segygjzpujphwvrubusm', installId: 'i-1',
};
let db;
let repository;
let outboxRepository;
let stateRepository;
let supabaseClient;
let calls;

beforeEach(async () => {
  mockFiles.clear();
  db = await getDefaultTestHandle().getReader();
  repository = getDefaultTestHandle().services.repositories.supportIncidents;
  outboxRepository = getDefaultTestHandle().services.repositories.syncOutbox;
  stateRepository = getDefaultTestHandle().services.repositories.syncState;
  ({ supabaseClient, calls } = createSupabaseMock());
  resetInstallIdForTests();
  await AsyncStorage.clear();
  await AsyncStorage.setItem(INSTALL_ID_KEY, envelope.installId);
  getRuntimeDiagnostics.mockReturnValue({
    application: { version: envelope.appVersion, build: envelope.buildNumber, name: 'not included' },
    update: { id: envelope.updateId, channel: 'not included' },
    backend: { projectId: envelope.backend },
    device: { deviceName: 'private device name' },
  });
});
afterEach(async () => {

  resetInstallIdForTests();
  jest.restoreAllMocks();
});

const queue = async (key = 'one', payload = { unsentByTable: { children: 1 } }) => {
  const incident = { kind: 'left_behind_unsent_work', repeatKey: incidentRepeatKey(key), payload };
  const result = await repository.enqueue(incident);
  expect(result).toMatchObject({ queued: true });
  await getDefaultTestHandle().withTransaction(txn => txn.runAsync('update support_incident_queue set schema_version = 1 where id = ?', result.incidentRef.id));
  return incident;
};
const drain = (options = {}) => drainSupportIncidents({
  repository, supabaseClient, enqueueRequest: (task) => task(), envelope, ...options,
});
const engine = (options = {}) => createOutboxSyncEngine({
  database: getDefaultTestHandle(), outboxRepository, stateRepository, supportIncidentRepository: repository,
  supabaseClient, enqueueRequest: (task) => task(),
  getAuthSession: async () => ({ data: { session: { user: { id: getDefaultTestHandle().userId } } } }),
  ...options,
});
const stored = () => db.getAllAsync('select id, status, attempts, last_error, next_attempt_at from support_incident_queue order by created_at, id');

test('buildIncidentEnvelope selects only release, backend and installation metadata', async () => {
  expect(await buildIncidentEnvelope()).toEqual(envelope);
});

test('sends pending rows once with the complete RPC shape; true and false both acknowledge delivery', async () => {
  await queue('one', { unsentByTable: { children: 2 }, appVersion: 'obsolete' });
  await queue('two');
  const pending = await repository.listPending();
  supabaseClient.rpc.mockResolvedValueOnce({ data: true, error: null })
    .mockResolvedValueOnce({ data: false, error: null });
  const enqueueRequest = jest.fn(task => task());
  expect(await drain({ enqueueRequest })).toEqual({ sent: 2, rejected: 0, failed: 0 });
  expect(enqueueRequest).toHaveBeenCalledTimes(2);
  expect(supabaseClient.rpc.mock.calls).toEqual(pending.map(row => [
    'report_mobile_support_incident', {
      p_kind: row.kind, p_repeat_key: `i-1:${row.repeatKey}`,
      p_payload: { ...row.payload, ...envelope },
    },
  ]));
  expect(await repository.listPending()).toEqual([]);
  expect(await drain()).toEqual({ sent: 0, rejected: 0, failed: 0 });
  expect(supabaseClient.rpc).toHaveBeenCalledTimes(2);
  expect((await stored()).map(row => row.status)).toEqual(['sent', 'sent']);
});

test('22023 rejects the invalid row and continues to the next row', async () => {
  await queue('one');
  await queue('two');
  const [first, second] = await repository.listPending();
  supabaseClient.rpc.mockResolvedValueOnce({ data: null, error: { code: '22023' } })
    .mockResolvedValueOnce({ data: true, error: null });
  expect(await drain()).toEqual({ sent: 1, rejected: 1, failed: 0 });
  expect(await stored()).toEqual([
    { id: first.id, status: 'rejected', attempts: 0, last_error: '22023', next_attempt_at: null },
    { id: second.id, status: 'sent', attempts: 0, last_error: null, next_attempt_at: null },
  ]);
});

test.each(['returned', 'thrown'])('a %s transport failure backs off the first row and stops this drain', async (mode) => {
  await queue('one');
  await queue('two');
  const [first, second] = await repository.listPending();
  const error = { code: '08006', message: 'Network request failed' };
  if (mode === 'returned') supabaseClient.rpc.mockResolvedValueOnce({ data: null, error });
  else supabaseClient.rpc.mockRejectedValueOnce(error);
  expect(await drain()).toEqual({ sent: 0, rejected: 0, failed: 1 });
  expect(supabaseClient.rpc).toHaveBeenCalledTimes(1);
  expect(await stored()).toEqual([
    { id: first.id, status: 'pending', attempts: 1, last_error: error.message, next_attempt_at: expect.any(String) },
    { id: second.id, status: 'pending', attempts: 0, last_error: null, next_attempt_at: null },
  ]);
});

test.each(['thrown', 'returned'])('a %s stale-actor refusal propagates without changing queue evidence', async (mode) => {
  await queue();
  const before = await stored();
  const stale = new StaleActorError();
  const enqueueRequest = mode === 'thrown'
    ? jest.fn(async () => { throw stale; })
    : jest.fn(async () => ({ error: stale }));
  await expect(drain({ enqueueRequest })).rejects.toBe(stale);
  expect(await stored()).toEqual(before);
  expect(supabaseClient.rpc).not.toHaveBeenCalled();
});

test('T12: the whole RPC request excludes child identity, name and private domain notes', async () => {
  await getDefaultTestHandle().withTransaction(txn=>seedCoreData(txn));
  await createChildrenRepository({ database: getDefaultTestHandle() }).saveChildRecord({
    id: 'c-secret-child-id', first_name: 'Thandiwe', last_name: 'Fixture',
    class_id: 'class-1', programme_id: 'programme-a', created_by: A, synced: false,
    created_at: '2026-05-21T08:00:00.000Z', updated_at: '2026-05-21T08:00:00.000Z',
  });
  await getDefaultTestHandle().withTransaction(async txn => {
  await txn.runAsync(`insert into sessions (id, user_id, programme_id, session_date, notes)
    values ('private-session', ?, 'programme-a', '2026-10-17', 'private note')`, A);
  await txn.runAsync(`insert into session_attendees (id, session_id, child_id, notes)
    values ('private-attendee', 'private-session', 'c-secret-child-id', 'private note')`);
  });
  const summary = await readUnsentSummary(db);
  expect(summary.total).toBeGreaterThan(0);
  expect(JSON.stringify(await db.getAllAsync('select payload from sync_outbox'))).toContain('c-secret-child-id');
  const legacy = await repository.enqueue({
    kind: 'left_behind_unsent_work', repeatKey: incidentRepeatKey(A, 'children:c-secret-child-id:insert', summary.oldestCreatedAt),
    payload: { unsentByTable: summary.byTable },
  });
  await getDefaultTestHandle().withTransaction(txn=>txn.runAsync('update support_incident_queue set schema_version = 1 where id = ?',legacy.incidentRef.id));
  expect(await drain()).toEqual({ sent: 1, rejected: 0, failed: 0 });
  const request = JSON.stringify(supabaseClient.rpc.mock.calls);
  for (const secret of ['c-secret-child-id', 'Thandiwe', 'private note']) expect(request).not.toContain(secret);
});

test('a drain respects its row limit', async () => {
  await queue('one');
  await queue('two');
  expect(await drain({ limit: 1 })).toEqual({ sent: 1, rejected: 0, failed: 0 });
  expect(supabaseClient.rpc).toHaveBeenCalledTimes(1);
  expect(await repository.countDue()).toBe(1);
});

test('a full pass with a live session drains an incident even when the domain outbox is empty', async () => {
  await queue();
  expect(await engine().syncAll()).toMatchObject({
    success: true, totalSynced: 0, totalFailed: 0, incidents: { sent: 1, rejected: 0, failed: 0 },
  });
  expect(supabaseClient.rpc).toHaveBeenCalledTimes(1);
  expect(await repository.countDue()).toBe(0);
});

test('the incident RPC runs after the domain outbox has uploaded', async () => {
  await getDefaultTestHandle().withTransaction(txn=>seedCoreData(txn));
  await outboxRepository.enqueue({ tableName: 'classes', recordId: 'class-1', operation: 'update', payload: { id: 'class-1', name: 'Updated' } });
  await queue();
  const handle = getDefaultTestHandle();
  const syncEngine = engine({
    database: handle,
    outboxRepository: createSyncOutboxRepository({ database: handle }),
    stateRepository: createSyncStateRepository({ database: handle }),
    supportIncidentRepository: createSupportIncidentRepository({ database: handle }),
  });
  expect(await syncEngine.syncAll()).toMatchObject({ success: true, totalSynced: 1, incidents: { sent: 1, rejected: 0, failed: 0 } });
  expect(calls.map(call => call.type)).toEqual(['update', 'rpc']);
});

test('an RPC failure does not change the domain pass success and leaves the incident pending', async () => {
  await queue();
  supabaseClient.rpc.mockResolvedValue({ data: null, error: { code: '08006', message: 'Network request failed' } });
  expect(await engine().syncAll()).toMatchObject({
    success: true, totalFailed: 0, preflightErrors: [], incidents: { sent: 0, rejected: 0, failed: 1 },
  });
  expect(await stored()).toEqual([expect.objectContaining({ status: 'pending', attempts: 1 })]);
});

test('a sessionless full pass never attempts the incident RPC', async () => {
  await queue();
  const before = await stored();
  const result = await engine({ getAuthSession: async () => ({ data: { session: null } }) }).syncAll();
  expect(result).toMatchObject({ success: true, skippedNoSession: true });
  expect(result.incidents).toBeUndefined();
  expect(supabaseClient.rpc).not.toHaveBeenCalled();
  expect(await stored()).toEqual(before);
});

test('syncTableByName never drains support incidents', async () => {
  await queue();
  const result = await engine().syncTableByName('children');
  expect(result.success).toBe(true);
  expect(result.incidents).toBeUndefined();
  expect(supabaseClient.rpc).not.toHaveBeenCalled();
  expect(await repository.countDue()).toBe(1);
});

test('getSyncStatus counts only due incidents without inflating domain work counts', async () => {
  const syncEngine = engine();
  await queue('first');
  expect(await syncEngine.getSyncStatus()).toMatchObject({
    incidentReadyCount: 1, unsyncedCount: 0, readyCount: 0, inFlightCount: 0, waitingCount: 0,
  });
  await syncEngine.syncAll();
  expect((await syncEngine.getSyncStatus()).incidentReadyCount).toBe(0);
  await queue('second');
  const [pending] = await repository.listPending();
  await repository.markAttemptFailed(pending.id, 'Network request failed', { now: '2099-01-01T00:00:00.000Z' });
  expect((await syncEngine.getSyncStatus()).incidentReadyCount).toBe(0);
});

test('status without an incident repository reports zero due incidents', async () => {
  expect((await engine({ supportIncidentRepository: null }).getSyncStatus()).incidentReadyCount).toBe(0);
});

test('a count failure falls back to zero, but a stale actor must still propagate', async () => {
  jest.spyOn(repository, 'countDue').mockRejectedValueOnce(new Error('incident count unavailable'))
    .mockRejectedValueOnce(new StaleActorError());
  const syncEngine = engine();
  expect(await syncEngine.getSyncStatus()).toMatchObject({ incidentReadyCount: 0, unsyncedCount: 0 });
  await expect(syncEngine.getSyncStatus()).rejects.toMatchObject({ name: 'StaleActorError' });
});

test('stale cancellation during incident drain aborts the whole pass without attempt metadata or queue changes', async () => {
  await queue();
  const before = await stored();
  const stale = new StaleActorError();
  const result = await engine({ enqueueRequest: async () => { throw stale; } }).syncAll();
  expect(result).toMatchObject({ success: false, abortedStaleActor: true });
  expect(result.incidents).toBeUndefined();
  expect(await stored()).toEqual(before);
  expect(await stateRepository.getSyncMeta()).toEqual({ lastSyncTime: null, lastSuccessfulSyncTime: null });
});

test('a local drain failure does not turn successful domain work into a failed pass', async () => {
  jest.spyOn(repository, 'listPending').mockRejectedValueOnce(new Error('queue unavailable'));
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  const result = await engine().syncAll();
  expect(result).toMatchObject({ success: true, preflightErrors: [] });
  expect(console.warn).toHaveBeenCalledWith('syncAll: support incident drain failed:', 'queue unavailable');
});

test('mixed schemas deliver unchanged v1 and one frozen v2 body with a stable retry report id', async () => {
  await queue('legacy');
  const h=getDefaultTestHandle(); let result;
  await h.withTransaction(async txn=>{ result=await repository.record(txn,'app_error_caught',['Error','digest','Screen'],{message:'raw exception',stack:'raw stack'}, {event:true}); });
  const seen=[];
  supabaseClient.rpc.mockImplementation(async(name,args)=>{seen.push({name,args});return name.endsWith('_v2')?{data:{status:'inserted'},error:null}:{data:false,error:null};});
  const mixedOutcome=await drain({handle:h});
  expect(mixedOutcome).toEqual({sent:2,rejected:0,failed:0});
  expect(seen.map(x=>x.name).sort()).toEqual(['report_mobile_support_incident','report_mobile_support_incident_v2']);
  expect(seen.find(x=>x.name.endsWith('_v2')).args.p_envelope).toMatchObject({schema_version:2,kind:'app_error_caught',payload:{message:'raw exception'},delivery:{installId:'i-1'}});
  expect(await repository.get(result.incidentRef.id)).toMatchObject({status:'sent',report_snapshot:null});
});

test('Storage uploads through the handle data client before freezing and sending a receipt, preserving PNG metadata', async () => {
 const h=getDefaultTestHandle();
 mockFiles.set('file:///picked.png','original PNG bytes');
 const result=await h.services.supportIncidents.captureEvent('ea_report',{message:'raw help',screenshotAttached:true},
 {screenshotFile:{uri:'file:///picked.png',extension:'png',mimeType:'image/png'}});
 const transport=jest.fn(async(url,init)=>{
   if(String(url).includes('/storage/')) {
     expect((await repository.get(result.incidentRef.id)).report_snapshot).toBeNull();
     return new Response('{}',{status:200,headers:{'content-type':'application/json'}});
   }
   return new Response(JSON.stringify({status:'inserted'}),{status:200,headers:{'content-type':'application/json'}});
 });
 const {createHandleDataClient}=jest.requireActual('../src/session/handleDataClient');
 h.dataClient=createHandleDataClient({handle:h,supabaseUrl:'https://example.supabase.co',supabaseKey:'test-key',fetchImpl:transport});
 const before=await repository.get(result.incidentRef.id);
 expect(await drain({handle:h,supabaseClient:h.dataClient,enqueueRequest:h.enqueueRequest})).toEqual({sent:1,rejected:0,failed:0});
 expect(transport.mock.calls.map(([url])=>String(url).includes('/storage/'))).toEqual([true,true,false]);
 expect(new Headers(transport.mock.calls[1][1].headers).get('content-type')).toBe('image/png');
 const request=JSON.parse(transport.mock.calls[2][1].body).p_envelope;
 expect(request.bundle_path).toMatch(new RegExp(`^${h.userId}/\\d{4}-\\d{2}-\\d{2}/${before.bundle_id}.json$`));
 expect(request.screenshot_path).toContain('-screenshot.png');
 expect(mockFiles.has(before.bundle_file)).toBe(false);
 expect(await repository.get(result.incidentRef.id)).toMatchObject({status:'sent',bundle_state:'uploaded'});
});
test('a lost acknowledgement preserves the bounded frozen observation body and stable report id across OTA delivery',async()=>{
 const h=getDefaultTestHandle();let result;
 await h.withTransaction(async txn=>{result=await repository.record(txn,'app_error_caught',['repeat'],{message:'raw',stack:'é'.repeat(40000)},{event:true});});
 const sent=[];
 supabaseClient.rpc.mockImplementation(async(name,args)=>{sent.push(args.p_envelope);return {error:{code:'08006',message:'lost ack'}};});
 await drain({handle:h});
 const frozen=await repository.get(result.incidentRef.id);
 expect(frozen.report_snapshot.payload).toEqual(sent[0].payload);
 expect(frozen.report_snapshot.payload.stackTruncated).toBe(true);
 getRuntimeDiagnostics.mockReturnValue({...getRuntimeDiagnostics(),application:{version:'new OTA binary',build:'8'},update:{id:'ota-new'}});
 await h.withTransaction(async txn=>{
   await repository.record(txn,'app_error_caught',['repeat'],{message:'second',stack:'second'},{event:true});
   await txn.runAsync('update support_incident_queue set next_attempt_at = null where id = ?',result.incidentRef.id);
 });
 supabaseClient.rpc.mockImplementation(async(name,args)=>{sent.push(args.p_envelope);return {data:{status:'duplicate'},error:null};});
 expect(await drain({handle:h})).toMatchObject({sent:1});
 expect(sent[1].report_id).toBe(sent[0].report_id);expect(sent[1].payload).toEqual(sent[0].payload);
 expect(sent[1].observed.application.version).toBe('1.2.0');expect(sent[1].delivery.appVersion).toBe('new OTA binary');
 expect(await repository.get(result.incidentRef.id)).toMatchObject({status:'sent',has_unsent_changes:1});
});
test('five actual Storage failures hold the receipt until a final failed outcome can be frozen',async()=>{
 const h=getDefaultTestHandle();const {incidentRef}=await h.services.supportIncidents.captureEvent('diagnostics_sent',{trigger:'manual'});
 let receipts=0;let uploads=0;let received;
 const transport=jest.fn(async(url,init)=>{
  if(String(url).includes('/storage/')){uploads++;return new Response(JSON.stringify({statusCode:'503',error:'unavailable',message:'storage offline'}),{status:503,headers:{'content-type':'application/json'}});}
  receipts++;received=JSON.parse(init.body).p_envelope;return new Response('{"status":"inserted"}',{status:200,headers:{'content-type':'application/json'}});
 });
 h.dataClient=jest.requireActual('../src/session/handleDataClient').createHandleDataClient({handle:h,supabaseUrl:'https://example.supabase.co',supabaseKey:'test-key',fetchImpl:transport});
 for(let i=1;i<=5;i++){
  await h.withTransaction(txn=>txn.runAsync('update support_incident_queue set next_attempt_at = null where id = ?',incidentRef.id));
  await drain({handle:h,supabaseClient:h.dataClient,enqueueRequest:h.enqueueRequest});
  const stored=await repository.get(incidentRef.id);expect(stored.bundle_attempts).toBe(i);
  if(i<5){expect(stored.report_snapshot).toBeNull();expect(receipts).toBe(0);expect(stored.bundle_state).toBe('ready');}
 }
 expect(uploads).toBe(5);expect(receipts).toBe(1);expect(received.payload.bundleUploadFailed).toBe(true);
 expect(await repository.get(incidentRef.id)).toMatchObject({bundle_state:'failed',status:'sent',attempts:4});
});
test('409 replays and a partial pair retain progress before cleanup, with only the remaining object retried',async()=>{
 const h=getDefaultTestHandle();mockFiles.set('file:///picked.heic','heic bytes');
 const {incidentRef}=await h.services.supportIncidents.captureEvent('ea_report',{message:'help'},
 {screenshotFile:{uri:'file:///picked.heic',extension:'heic',mimeType:'image/heic'}});
 const stored=await repository.get(incidentRef.id);let screenshotAttempts=0;let received;
 const transport=jest.fn(async(url,init)=>{
  if(String(url).includes('/storage/')){
   if(String(url).endsWith('.heic')&&++screenshotAttempts===1)return new Response('{"statusCode":"503","error":"offline"}',{status:503,headers:{'content-type':'application/json'}});
   return new Response('{"statusCode":"409","error":"Duplicate"}',{status:409,headers:{'content-type':'application/json'}});
  }
  received=JSON.parse(init.body).p_envelope;return new Response('{"status":"duplicate"}',{status:200,headers:{'content-type':'application/json'}});
 });
 h.dataClient=jest.requireActual('../src/session/handleDataClient').createHandleDataClient({handle:h,supabaseUrl:'https://example.supabase.co',supabaseKey:'test-key',fetchImpl:transport});
 await drain({handle:h,supabaseClient:h.dataClient,enqueueRequest:h.enqueueRequest});
 expect(await repository.get(incidentRef.id)).toMatchObject({bundle_path:expect.any(String),screenshot_path:null,bundle_state:'ready',bundle_attempts:1,report_snapshot:null});
 expect(mockFiles.has(stored.bundle_file)).toBe(false);
 await h.withTransaction(txn=>txn.runAsync('update support_incident_queue set next_attempt_at = null where id = ?',incidentRef.id));
 await drain({handle:h,supabaseClient:h.dataClient,enqueueRequest:h.enqueueRequest});
 expect(transport.mock.calls.filter(([url])=>String(url).endsWith('.json'))).toHaveLength(1);
 expect(received.screenshot_path).toMatch(/-screenshot.heic$/);expect(received.payload.bundleUploadFailed).toBeUndefined();
 expect(await repository.get(incidentRef.id)).toMatchObject({status:'sent',bundle_state:'uploaded',bundle_attempts:1});
});
test('irreducibly oversized v2 is rejected locally and a later due human report still sends',async()=>{
 const h=getDefaultTestHandle();let big;let small;
 await h.withTransaction(async txn=>{
  big=await repository.record(txn,'ea_report',['big'],{message:'😀'.repeat(20000)},{event:true});
  small=await repository.record(txn,'ea_report',['small'],{message:'valid'},{event:true});
 });
 supabaseClient.rpc.mockResolvedValue({data:{status:'inserted'},error:null});
 expect(await drain({handle:h})).toEqual({sent:1,rejected:1,failed:0});
 expect(supabaseClient.rpc).toHaveBeenCalledTimes(1);
 expect(await repository.get(big.incidentRef.id)).toMatchObject({status:'rejected',last_error:'TOO_LARGE'});
 expect(await h.services.supportIncidents.getDeliveryState(small.incidentRef)).toBe('sent');
});
test.each(['22023','54000','28000','unknown'])('v2 %s is rejected or backed off without accepting an unknown acknowledgement',async code=>{
 const h=getDefaultTestHandle();let result;
 await h.withTransaction(async txn=>{result=await repository.record(txn,'ea_report',[code],{message:'help'},{event:true});});
 supabaseClient.rpc.mockResolvedValue(code==='unknown'?{data:{status:'unexpected'},error:null}:{error:{code,message:code}});
 await drain({handle:h});
 const row=await repository.get(result.incidentRef.id);
 expect(row.status).toBe(code==='22023'?'rejected':'pending');
 expect(row.attempts).toBe(code==='22023'?0:1);
 expect(row.report_snapshot).toBeTruthy();
});
test('delivery includes the cumulative drop count and distinguishes a missing local bundle from upload failure',async()=>{
 const h=getDefaultTestHandle();const {incidentRef}=await h.services.supportIncidents.captureEvent('diagnostics_sent',{trigger:'manual'});
 const before=await repository.get(incidentRef.id);mockFiles.delete(before.bundle_file);
 await h.services.repositories.localState.set('support_incidents_dropped',3);
 let received;
 supabaseClient.rpc.mockImplementation(async(name,args)=>{received=args.p_envelope;return {data:{status:'inserted'},error:null};});
 await drain({handle:h});
 expect(received).toMatchObject({payload:{bundleDropped:true},delivery:{droppedIncidents:3}});
 expect(received.payload.bundleUploadFailed).toBeUndefined();
 expect(await repository.get(incidentRef.id)).toMatchObject({bundle_attempts:0,bundle_state:'failed',status:'sent'});
});
test('sign-out during a Storage request refuses its late completion and leaves the original EA queue untouched',async()=>{
 const h=getDefaultTestHandle();const {incidentRef}=await h.services.supportIncidents.captureEvent('diagnostics_sent',{trigger:'manual'});
 const before=await repository.get(incidentRef.id);let entered;let release;
 const started=new Promise(r=>{entered=r;});const blocked=new Promise(r=>{release=r;});
 const transport=jest.fn(async()=>{entered();await blocked;return new Response('{}',{status:200,headers:{'content-type':'application/json'}});});
 h.dataClient=jest.requireActual('../src/session/handleDataClient').createHandleDataClient({handle:h,supabaseUrl:'https://example.supabase.co',supabaseKey:'test-key',fetchImpl:transport});
 const work=drain({handle:h,supabaseClient:h.dataClient,enqueueRequest:h.enqueueRequest}).catch(e=>e);
 await started;
 const life=require('../src/session/signedInHandle');await life.requestClose({reason:'Storage switch'});
 const other='22222222-2222-4222-8222-222222222222';life.setLatestAuthSession({user:{id:other},access_token:'B-token'});
 await life.requestOpen({userId:other,openDatabase:sqlite.openDatabaseAsync,fetchImpl:transport});
 release();expect((await work).name).toBe('StaleActorError');expect(transport).toHaveBeenCalledTimes(1);
 life.setLatestAuthSession({user:{id:h.userId},access_token:'A-token'});
 const original=await life.requestOpen({userId:h.userId,openDatabase:sqlite.openDatabaseAsync,fetchImpl:transport});
 expect(await original.services.repositories.supportIncidents.get(incidentRef.id)).toEqual(before);
 expect(mockFiles.has(before.bundle_file)).toBe(true);
});
test('SQLite reopen after upload and a lost receipt acknowledgement replays the frozen report without re-uploading deleted files',async()=>{
 let h=getDefaultTestHandle();const {incidentRef}=await h.services.supportIncidents.captureEvent('diagnostics_sent',{trigger:'manual'});
 const initial=await repository.get(incidentRef.id);let uploads=0;const reports=[];
 const transport=jest.fn(async(url,init)=>{
  if(String(url).includes('/storage/')){uploads++;return new Response('{}',{status:200,headers:{'content-type':'application/json'}});}
  reports.push(JSON.parse(init.body).p_envelope);
  return new Response(reports.length===1?'{"code":"08006","message":"receipt acknowledgement lost"}':'{"status":"duplicate"}',
   {status:reports.length===1?503:200,headers:{'content-type':'application/json'}});
 });
 const bind=()=>{h.dataClient=jest.requireActual('../src/session/handleDataClient').createHandleDataClient({handle:h,supabaseUrl:'https://example.supabase.co',supabaseKey:'test-key',fetchImpl:transport});};
 bind();await drain({handle:h,supabaseClient:h.dataClient,enqueueRequest:h.enqueueRequest});
 expect(await repository.get(incidentRef.id)).toMatchObject({bundle_state:'uploaded',status:'pending',report_snapshot:expect.any(Object)});
 expect(mockFiles.has(initial.bundle_file)).toBe(false);
 const life=require('../src/session/signedInHandle');await life.requestClose({reason:'receipt reopen'});await life.whenDisposed(h.fileName);
 resetInstallIdForTests();h=await require('../test-support/testDatabase').openDefaultTestHandle();repository=h.services.repositories.supportIncidents;bind();
 await h.withTransaction(txn=>txn.runAsync('update support_incident_queue set next_attempt_at = null where id = ?',incidentRef.id));
 expect(await drain({handle:h,supabaseClient:h.dataClient,enqueueRequest:h.enqueueRequest})).toMatchObject({sent:1});
 expect(uploads).toBe(1);expect(reports).toHaveLength(2);
 const {delivery:firstDelivery,...first}=reports[0];const {delivery:secondDelivery,...second}=reports[1];
 expect(second).toEqual(first);expect(secondDelivery.installId).toBe(firstDelivery.installId);
 expect(await repository.get(incidentRef.id)).toMatchObject({status:'sent',report_snapshot:null,bundle_state:'uploaded'});
});
