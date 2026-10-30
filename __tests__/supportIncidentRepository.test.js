import { getDefaultTestHandle } from '../test-support/defaultTestHandle';
import { getRuntimeDiagnostics } from '../src/utils/runtimeDiagnostics';

const repo = () => getDefaultTestHandle().services.repositories.supportIncidents;
const record = (kind, parts, payload, event = false) => getDefaultTestHandle().withTransaction(
  txn => repo().record(txn, kind, parts, payload, { event })
);
test('observing again updates one live condition with first/current synchronous provenance', async () => {
  expect(typeof repo().record).toBe('function');
  const first = await record('upload_terminal', ['children', 'c1', 'update', 't', 'terminal', 'OTHER'], { lastError: 'first' });
  await record('upload_terminal', ['children', 'c1', 'update', 't', 'terminal', 'OTHER'], { lastError: 'second' });
  const rows = await repo().listPending();
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ id: first.incidentRef.id, schema_version: 2, occurrence_count: 1,
    payload: { lastError: 'second' }, observed: getRuntimeDiagnostics(), first_observed: getRuntimeDiagnostics() });
  expect(rows[0].first_seen_at <= rows[0].last_seen_at).toBe(true);
});

test('freeze retains its body; a later event stays dirty after ack and promotes without a third event', async () => {
  expect(typeof repo().freeze).toBe('function');
  const { incidentRef } = await record('app_error_caught', ['Error', 'digest', 'Screen'], { message: 'first' }, true);
  const snap = await repo().freeze(incidentRef);
  await record('app_error_caught', ['Error', 'digest', 'Screen'], { message: 'second' }, true);
  expect((await repo().freeze(incidentRef)).payload).toEqual({ message: 'first' });
  await repo().markSent(incidentRef, { now: '2026-10-29T00:00:00.000Z', release: snap.observed });
  expect(await repo().get(incidentRef.id)).toMatchObject({ status: 'sent', has_unsent_changes: 1, occurrence_count: 2 });
  await getDefaultTestHandle().withTransaction(txn => repo().promoteDue(txn, '2026-10-29T23:59:59.999Z'));
  expect(await repo().countDue()).toBe(0);
  await getDefaultTestHandle().withTransaction(txn => repo().promoteDue(txn, '2026-10-30T00:00:00.000Z'));
  expect(await repo().get(incidentRef.id)).toMatchObject({ status: 'pending', report_generation: 2, has_unsent_changes: 0 });
  await repo().markRejected(incidentRef, 'stale');
  await repo().markAttemptFailed(incidentRef, 'stale');
  await repo().markSent(incidentRef);
  expect(await repo().get(incidentRef.id)).toMatchObject({ status: 'pending', report_generation: 2, attempts: 0 });
});

test('capacity protects dirty events, admits human work over pending observations, counts drops, and recreates pruned once episodes', async () => {
  for (let i = 0; i < 200; i++) await record('upload_terminal', [i], {});
  expect(await record('upload_terminal', ['overflow'], {})).toMatchObject({ queued: false, reason: 'full' });
  const human = await record('ea_report', ['human'], { message: 'help' }, true);
  expect(human.queued).toBe(true);
  expect((await (await getDefaultTestHandle().getReader()).getFirstAsync("select value from local_state where key = 'support_incidents_dropped'" )).value).toBe('1');
  expect((await repo().listPending({ limit: 200 }))[0].id).toBe(human.incidentRef.id);
  await getDefaultTestHandle().withTransaction(txn => txn.runAsync('delete from support_incident_queue'));
  const old = await repo().enqueue({ kind: 'foreign_owner_in_file', repeatKey: 'prehashed', payload: { foreignTotal: 1 } });
  await repo().markSent(old.incidentRef);
  for (let i = 0; i < 199; i++) await record('app_error_caught', [i], {}, true);
  await record('app_error_caught', ['last'], {}, true);
  const recreated = await repo().enqueue({ kind: 'foreign_owner_in_file', repeatKey: 'prehashed', payload: { foreignTotal: 1 } });
  expect(recreated.queued).toBe(false); // all 200 event rows protected
  await repo().markSent((await repo().listPending({ limit: 1 }))[0].id);
  const admitted = await repo().enqueue({ kind: 'foreign_owner_in_file', repeatKey: 'prehashed', payload: { foreignTotal: 1 } });
  expect(admitted.incidentRef.id).not.toBe(old.incidentRef.id);
  expect((await repo().get(admitted.incidentRef.id)).repeat_key).toBe('prehashed');
});

test('release promotion, once cadence, rejection, schema-1 preservation and backoff are generation safe', async () => {
  const daily = await record('upload_terminal', ['daily'], {});
  await repo().markSent(daily.incidentRef, { release: { application: { version: 'older' } } });
  await record('upload_terminal', ['daily'], { raw: 'é'.repeat(5000) });
  expect(await repo().get(daily.incidentRef.id)).toMatchObject({ report_generation: 2, status: 'pending' });
  const once = await repo().enqueue({ kind: 'foreign_owner_in_file', repeatKey: 'episode', payload: {} });
  await repo().markSent(once.incidentRef, { release: { application: { version: 'older' } }, now: '2020-01-01T00:00:00.000Z' });
  await repo().enqueue({ kind: 'foreign_owner_in_file', repeatKey: 'episode', payload: {} });
  await getDefaultTestHandle().withTransaction(txn => repo().promoteDue(txn));
  expect(await repo().get(once.incidentRef.id)).toMatchObject({ report_generation: 1, status: 'sent' });
  const r = { ...daily.incidentRef, reportGeneration: 2 };
  for (const [i, delay] of [5000,15000,45000,135000,405000,900000,900000].entries()) {
    const now = '2026-10-29T00:00:00.000Z';
    await repo().markAttemptFailed(r, 'transport', { now });
    expect(await repo().get(r.id)).toMatchObject({ attempts: i + 1, next_attempt_at: new Date(Date.parse(now)+delay).toISOString() });
  }
  await repo().markRejected(r, '22023');
  await record('upload_terminal', ['daily'], { changed: true });
  expect(await repo().get(r.id)).toMatchObject({ status: 'rejected', payload: { raw: expect.any(String) } });
  const fixture = require('../test-support/fixtures/fieldDiagnosticsIdentity.json');
  const { incidentReportId, INCIDENT_KEY_NAMESPACE } = require('../src/db/repositories/supportIncidentRepository');
  expect(INCIDENT_KEY_NAMESPACE).toBe(fixture.namespace);
  expect(incidentReportId(fixture.report.id, fixture.report.generation)).toBe(fixture.report.reportId);
});
test('fairness prunes observed rows even dirty before clean sent events, protecting sent dirty events',async()=>{
  const h=getDefaultTestHandle();const refs=[];
  for(let i=0;i<200;i++)refs.push(await record(i===1||i===2?'upload_terminal':'app_error_caught',[i],{},i!==1&&i!==2));
  await h.withTransaction(async txn=>{
    for(const [i,status,dirty,date] of [[0,'sent',1,'2018'],[1,'rejected',0,'2021'],[2,'sent',1,'2022'],[3,'sent',0,'2019']])
      await txn.runAsync('update support_incident_queue set status = ?,has_unsent_changes = ?,updated_at = ? where id = ?',status,dirty,date,refs[i].incidentRef.id);
  });
  for(const i of [1,2,3]){
    expect((await record('ea_report',[`human-${i}`],{message:'help'},true)).queued).toBe(true);
    expect(await repo().get(refs[i].incidentRef.id)).toBeNull();
    expect(await repo().get(refs[0].incidentRef.id)).toMatchObject({status:'sent',has_unsent_changes:1});
  }
  expect(await record('diagnostics_sent',['saturated'],{},true)).toMatchObject({queued:false,reason:'full'});
});
test('reading and recording a copied schema-1 row preserves unknown provenance and version',async()=>{
 const h=getDefaultTestHandle();const first=await repo().enqueue({kind:'left_behind_unsent_work',repeatKey:'old',payload:{old:true}});
 await h.withTransaction(txn=>txn.runAsync('update support_incident_queue set schema_version = 1,observed = null,first_observed = null where id = ?',first.incidentRef.id));
 await repo().enqueue({kind:'left_behind_unsent_work',repeatKey:'old',payload:{new:true}});
 expect(await repo().get(first.incidentRef.id)).toMatchObject({schema_version:1,observed:null,first_observed:null,payload:{old:true}});
});
test('delivery lookup for an acknowledged generation remains sent after its later generation is pending',async()=>{
 const h=getDefaultTestHandle();const result=await record('app_error_caught',['old-generation'],{},true);
 await repo().freeze(result.incidentRef);
 await record('app_error_caught',['old-generation'],{},true);
 await repo().markSent(result.incidentRef,{now:'2020-01-01T00:00:00.000Z'});
 await h.withTransaction(txn=>repo().promoteDue(txn));
 expect(await h.services.supportIncidents.getDeliveryState(result.incidentRef)).toBe('sent');
 expect(await h.services.supportIncidents.getDeliveryState({...result.incidentRef,reportGeneration:2})).toBe('pending');
});
test('delivery lookup is unknown after a sent human report is pruned, and rejected only for a rejected receipt', async () => {
  const h = getDefaultTestHandle();
  const first = await record('ea_report', ['pruned-report'], { message: 'help' }, true);
  await repo().markSent(first.incidentRef);
  expect(await h.services.supportIncidents.getDeliveryState(first.incidentRef)).toBe('sent');
  for (let i = 0; i < 199; i++) await record('app_error_caught', ['queue', i], {}, true);
  const next = await record('ea_report', ['next-report'], { message: 'another problem' }, true);
  expect(await repo().get(first.incidentRef.id)).toBeNull();
  expect(await h.services.supportIncidents.getDeliveryState(first.incidentRef)).toBe('unknown');
  expect(await h.services.supportIncidents.getDeliveryState({ ...next.incidentRef, reportGeneration: 2 })).toBe('unknown');
  await repo().markRejected(next.incidentRef, '22023');
  expect(await h.services.supportIncidents.getDeliveryState(next.incidentRef)).toBe('rejected');
});
test('unknown kinds are refused by the SQLite kind check',async()=>{
 await expect(record('unknown_kind',['unknown'],{})).rejects.toBeTruthy();
 expect(await repo().listPending()).toEqual([]);
});
test('caller-owned incident transactions roll back all queued rows without nested transactions or outbox writes',async()=>{
 const h=getDefaultTestHandle();const abort=new Error('abort independent incident transaction');
 await expect(h.withTransaction(async txn=>{
  await repo().record(txn,'upload_terminal',['first'],{}, {event:false});
  await repo().enqueue({kind:'foreign_owner_in_file',repeatKey:'prehashed',payload:{foreignTotal:1}}, {transaction:txn});
  throw abort;
 })).rejects.toBe(abort);
 expect(await repo().listPending()).toEqual([]);
 expect(await (await h.getReader()).getFirstAsync('select count(*) as n from sync_outbox')).toEqual({n:0});
});
test('condition repeat keys retain deterministic namespace and part boundaries',()=>{
 const {incidentRepeatKey}=require('../src/db/repositories/supportIncidentRepository');
 const key=incidentRepeatKey('u1','children:raw-id:update','time');
 expect(key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
 expect(key).toBe(incidentRepeatKey('u1','children:raw-id:update','time'));
 expect(key).not.toContain('raw-id');
 expect(incidentRepeatKey('ab','c')).not.toBe(incidentRepeatKey('a','bc'));
});
