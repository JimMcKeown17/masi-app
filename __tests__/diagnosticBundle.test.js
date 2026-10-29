import {getDefaultTestHandle,TEST_ACTOR_ID} from '../test-support/defaultTestHandle';
let mockFiles = new Map();
let mockFailWrite = false;
let mockWriteFailures = 0;
jest.mock('expo-file-system/next', () => {
  class File {
    constructor(...parts) { this.uri = parts.map(p=>p.uri??p).join('/'); this.name=this.uri.split('/').pop(); }
    get exists(){return mockFiles.has(this.uri);}
    get size(){return Buffer.byteLength(mockFiles.get(this.uri)??'');}
    create(){} write(value){if(mockFailWrite || mockWriteFailures-->0)throw new Error('disk full');mockFiles.set(this.uri,value);}
    delete(){mockFiles.delete(this.uri);} copy(file){file.write(mockFiles.get(this.uri));}
    async bytes(){return new Uint8Array(Buffer.from(mockFiles.get(this.uri)??''));}
  }
  class Directory {constructor(...p){this.uri=p.map(x=>x.uri??x).join('/');} create(){} get exists(){return true;} list(){return [...mockFiles.keys()].filter(x=>x.startsWith(this.uri+'/')).map(x=>new File(x));}}
  return {File,Directory,Paths:{document:'file:///documents',cache:'file:///cache',availableDiskSpace:123,totalDiskSpace:456}};
});
jest.mock('@react-native-community/netinfo',()=>({fetch:jest.fn(async()=>({type:'wifi',isConnected:true,details:{ssid:'raw'}}))}));
const row = async ref => getDefaultTestHandle().services.repositories.supportIncidents.get(ref.id);
beforeEach(()=>{mockFiles.clear();mockFailWrite=false;mockWriteFailures=0;});
test('event capture sees committed incident/outbox and retains capture-time evidence after later events',async()=>{
  const h=getDefaultTestHandle();
  await h.withTransaction(txn=>txn.runAsync(`insert into sync_outbox (id,table_name,record_id,operation,payload,status,owner_user_id,error_class,error_code)
    values ('o','children','c','insert','{"id":"c","first_name":"Raw"}','terminal',?,'terminal','OTHER')`,TEST_ACTOR_ID));
  expect(typeof h.services.supportIncidents.captureEvent).toBe('function');
  const result=await h.services.supportIncidents.captureEvent('diagnostics_sent',{trigger:'manual'});
  expect(result.saved).toBe(true);
  const stored=await row(result.incidentRef);
  expect(stored.bundle_state).toBe('ready');
  const bytes=mockFiles.get(stored.bundle_file); const bundle=JSON.parse(bytes);
  expect(bundle).toMatchObject({bundleVersion:1,ea:{userId:h.userId},supportExport:{failedOutboxRows:[{recordId:'c'}]}});
  expect(bundle.supportExport.supportIncidents).toEqual(expect.arrayContaining([expect.objectContaining({id:stored.id})]));
  await h.services.supportIncidents.captureEvent('diagnostics_sent',{trigger:'manual'});
  expect(mockFiles.get(stored.bundle_file)).toBe(bytes);
  expect(await h.services.supportIncidents.getDeliveryState(result.incidentRef)).toBe('pending');
});
test('only first automatic condition reserves one start-time allowance per EA per 24 hours, even on capture failure',async()=>{
  const h=getDefaultTestHandle();
  mockFailWrite=true;
  await h.services.supportIncidents.captureEvent('app_error_caught',{message:'first',components:['Screen']});
  const last=await h.services.repositories.localState.get('support_auto_bundle_last_at');
  expect(last).toEqual(expect.any(String));
  await h.services.supportIncidents.captureEvent('app_error_caught',{message:'different',components:['Screen']});
  const rows=await (await h.getReader()).getAllAsync('select * from support_incident_queue order by created_at');
  expect(rows.map(r=>r.bundle_state)).toEqual(['failed','none']);
  expect(JSON.parse(rows[0].payload)).toMatchObject({bundleCaptureFailed:true});
  mockFailWrite=false;
  await h.services.repositories.localState.set('support_auto_bundle_last_at',new Date(Date.now()-86400000).toISOString());
  await h.services.supportIncidents.captureEvent('app_error_caught',{message:'third',components:['Screen']});
  expect((await (await h.getReader()).getAllAsync("select * from support_incident_queue where bundle_state = 'ready'"))).toHaveLength(1);
});
test('capture is bounded and contains a bounded newest-first log tail',async()=>{
  const h=getDefaultTestHandle();
  for(let i=0;i<201;i++)await h.withTransaction(txn=>txn.runAsync(`insert into sync_outbox
    (id,table_name,record_id,operation,payload,status,owner_user_id) values (?,'children',?,'insert',?,'terminal',?)`,
  `o${i}`,`c${i}`,JSON.stringify({id:`c${i}`,notes:'é'.repeat(15000)}),h.userId));
  const {logger}=require('../src/utils/logger');logger.addLog('ERROR',['raw log']);
  const result=await h.services.supportIncidents.captureEvent('diagnostics_sent',{trigger:'manual'});
  const bundle=JSON.parse(mockFiles.get((await row(result.incidentRef)).bundle_file));
  expect(bundle.supportExport.failedOutboxRows).toHaveLength(200);
  expect(bundle.logs[0].message).toBe('raw log');
  expect(Buffer.byteLength(JSON.stringify(bundle))).toBeLessThanOrEqual(12*1024*1024);
});
test('status refresh resolves while automatic capture is delayed and excludes that row until capture finishes', async () => {
  const h = getDefaultTestHandle();
  await h.withTransaction(txn => txn.runAsync(`insert into sync_outbox
    (id,table_name,record_id,operation,payload,status,owner_user_id,error_class,error_code)
    values ('slow','children','c','insert','{}','terminal',?,'terminal','OTHER')`, h.userId));
  let release; let entered; let timer;
  const started = new Promise(resolve => { entered = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  require('@react-native-community/netinfo').fetch.mockImplementationOnce(async () => {
    entered(); await gate; return { type: 'wifi' };
  });
  const build = jest.spyOn(require('../src/services/diagnosticBundle'), 'buildDiagnosticBundle');
  const refresh = h.services.syncEngine.getSyncStatus();
  try {
    await started;
    const status = await Promise.race([refresh, new Promise(resolve => {
      timer = setTimeout(() => resolve('blocked by capture'), 1000);
    })]);
    expect(status).toMatchObject({ incidentReadyCount: 0 });
    const stored = await (await h.getReader()).getFirstAsync('select * from support_incident_queue');
    expect(stored.bundle_state).toBe('capturing');
    expect(mockFiles.size).toBe(0);
    expect(await h.services.repositories.supportIncidents.listPending()).toEqual([]);
    release();
    await build.mock.results[0].value;
    expect(await h.services.repositories.supportIncidents.listPending()).toEqual([
      expect.objectContaining({ id: stored.id, bundle_state: 'ready' }),
    ]);
    expect((await h.services.syncEngine.getSyncStatus()).incidentReadyCount).toBe(1);
  } finally {
    clearTimeout(timer); release();
    await refresh;
    await build.mock.results[0]?.value;
    build.mockRestore();
  }
});
test('observer captures only the first automatic condition after its transaction commits',async()=>{
 const h=getDefaultTestHandle();
 for(const id of ['first','second'])await h.withTransaction(txn=>txn.runAsync(`insert into sync_outbox
  (id,table_name,record_id,operation,payload,status,owner_user_id,error_class,error_code) values (?,'children',?,'insert','{}','terminal',?,'terminal','OTHER')`,id,id,h.userId));
 const build=jest.spyOn(require('../src/services/diagnosticBundle'),'buildDiagnosticBundle');
 try {
  await h.services.syncEngine.getSyncStatus();
  expect(build).toHaveBeenCalledTimes(1);
  await build.mock.results[0].value;
  const rows=await (await h.getReader()).getAllAsync('select * from support_incident_queue order by created_at,id');
  expect(rows.filter(r=>r.bundle_state==='ready')).toHaveLength(1);
  const bundle=JSON.parse(mockFiles.get(rows.find(r=>r.bundle_state==='ready').bundle_file));
  expect(bundle.supportExport.supportIncidents).toHaveLength(2);
  expect(await h.services.repositories.localState.get('support_auto_bundle_last_at')).toEqual(expect.any(String));
 } finally {build.mockRestore();}
});

test('a full write failure retries a minimal bounded file before marking capture failed',async()=>{
 const h=getDefaultTestHandle();mockWriteFailures=1;
 const result=await h.services.supportIncidents.captureEvent('diagnostics_sent',{trigger:'manual'});
 const stored=await row(result.incidentRef);
 expect(stored.bundle_state).toBe('ready');
 expect(JSON.parse(mockFiles.get(stored.bundle_file))).toMatchObject({truncated:true,ea:{userId:h.userId},supportExport:{tableCounts:expect.any(Object)}});
});
test('a detached capture failure is logged without rejecting status or making the capturing row drainable', async () => {
  const h = getDefaultTestHandle();
  mockFailWrite = true;
  await h.withTransaction(async txn => {
    await txn.runAsync(`insert into sync_outbox (id,table_name,record_id,operation,payload,status,owner_user_id)
      values ('error','children','c','insert','{}','terminal',?)`, h.userId);
  });
  // Install the fault on the real SQLite connection; the public facade correctly forbids DDL.
  await (await require('../test-support/testDatabase').getTestWriter()).execAsync(`
    create trigger fail_capture_outcome before update on support_incident_queue
    when new.bundle_state = 'failed' begin select raise(abort,'capture outcome disk error'); end`);
  const build = jest.spyOn(require('../src/services/diagnosticBundle'), 'buildDiagnosticBundle');
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    await expect(h.services.syncEngine.getSyncStatus()).resolves.toMatchObject({ incidentReadyCount: 0 });
    await expect(build.mock.results[0].value).rejects.toMatchObject({ message: 'capture outcome disk error' });
    expect(warn).toHaveBeenCalledWith('Automatic diagnostic bundle capture failed:', 'capture outcome disk error');
    expect(await h.services.repositories.supportIncidents.listPending()).toEqual([]);
  } finally { build.mockRestore(); warn.mockRestore(); }
});
test('closing during detached automatic capture is silent and leaves the original capturing row untouched', async () => {
  const h = getDefaultTestHandle();
  await h.withTransaction(txn => txn.runAsync(`insert into sync_outbox (id,table_name,record_id,operation,payload,status,owner_user_id)
    values ('close','children','c','insert','{}','terminal',?)`, h.userId));
  let release; let entered;
  const started = new Promise(resolve => { entered = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  require('@react-native-community/netinfo').fetch.mockImplementationOnce(async () => { entered(); await gate; return { type: 'wifi' }; });
  const build = jest.spyOn(require('../src/services/diagnosticBundle'), 'buildDiagnosticBundle');
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    await expect(h.services.syncEngine.getSyncStatus()).resolves.toMatchObject({ incidentReadyCount: 0 });
    await started;
    const before = await (await h.getReader()).getFirstAsync('select * from support_incident_queue');
    const life = require('../src/session/signedInHandle');
    await life.requestClose({ reason: 'detached capture switch' });
    release();
    await expect(build.mock.results[0].value).rejects.toMatchObject({ name: 'StaleActorError' });
    expect(warn).not.toHaveBeenCalled();
    expect(mockFiles.size).toBe(0);
    await life.whenDisposed(h.fileName);
    const reopened = await require('../test-support/testDatabase').openDefaultTestHandle();
    expect(await reopened.services.repositories.supportIncidents.get(before.id)).toMatchObject({ bundle_state: 'capturing' });
    expect(await (await reopened.getReader()).getFirstAsync('select * from support_incident_queue')).toEqual(before);
  } finally {
    release();
    await build.mock.results[0]?.value.catch(() => {});
    build.mockRestore(); warn.mockRestore();
  }
});
test('sixth bundle evicts only oldest unsent bundle in this EA directory and pairs its screenshot',async()=>{
 const h=getDefaultTestHandle();mockFiles.set('file:///picked.png','png');mockFiles.set('file:///documents/support-bundles/other/keep.json','other');
 const refs=[];
 for(let i=0;i<6;i++)refs.push((await h.services.supportIncidents.captureEvent('ea_report',{message:`report ${i}`,screenshotAttached:true},
 {screenshotFile:{uri:'file:///picked.png',extension:'png',mimeType:'image/png'}})).incidentRef);
 expect(await row(refs[0])).toMatchObject({bundle_state:'failed',payload:{bundleDropped:true}});
 expect([...mockFiles.keys()].filter(k=>k.startsWith(`file:///documents/support-bundles/${h.userId}/`)&&k.endsWith('.json'))).toHaveLength(5);
 expect([...mockFiles.keys()].filter(k=>k.startsWith(`file:///documents/support-bundles/${h.userId}/`)&&k.endsWith('.png'))).toHaveLength(5);
 expect(mockFiles.get('file:///documents/support-bundles/other/keep.json')).toBe('other');
});
test('sign-out during a capture leaves capturing in the original file and makes no stale file or database write',async()=>{
 const h=getDefaultTestHandle();const NetInfo=require('@react-native-community/netinfo');
 let release;let entered;const started=new Promise(r=>{entered=r;});
 NetInfo.fetch.mockImplementationOnce(()=>{entered();return new Promise(r=>{release=r;});});
 const capturing=h.services.supportIncidents.captureEvent('diagnostics_sent',{trigger:'manual'});
 const outcome=capturing.catch(e=>e);await started;
 const before=await (await h.getReader()).getFirstAsync('select * from support_incident_queue');
 const life=require('../src/session/signedInHandle');await life.requestClose({reason:'capture switch'});
 release({type:'wifi'});
 expect((await outcome).name).toBe('StaleActorError');
 expect(mockFiles.size).toBe(0);
 await life.whenDisposed(h.fileName);
 const reopened=await require('../test-support/testDatabase').openDefaultTestHandle();
 const after=await (await reopened.getReader()).getFirstAsync('select * from support_incident_queue');
 expect(after).toEqual(before);expect(after.bundle_state).toBe('capturing');
});
test('orphan files left by a killed capture are cleaned within this EA directory before retention admission',async()=>{
 const h=getDefaultTestHandle();
 for(let i=0;i<6;i++)mockFiles.set(`file:///documents/support-bundles/${h.userId}/orphan-${i}.json`,'orphan');
 await h.services.supportIncidents.captureEvent('diagnostics_sent',{trigger:'manual'});
 expect([...mockFiles.keys()].filter(k=>k.startsWith(`file:///documents/support-bundles/${h.userId}/`)&&k.endsWith('.json')).length).toBeLessThanOrEqual(5);
});
