import { File, Directory, Paths } from 'expo-file-system/next';
import NetInfo from '@react-native-community/netinfo';
import { logger } from '../utils/logger';
import { debugDump, assertExportHandle } from '../db/debugDump';
import { getRuntimeDiagnostics } from '../utils/runtimeDiagnostics';
import { getInstallId } from './installId';
import { isStaleActorError } from '../session/staleActor';
import { utf8Bytes } from './incidentPayloads';

const MAX_BUNDLE_BYTES = 12*1024*1024;
const LIMITS = { outboxLimit: 200, payloadMaxBytes: 20480, masteryLimit: 500, sectionLimit: 200 };
const yieldSection = async handle => {
  assertExportHandle(handle);
  await new Promise(resolve => setTimeout(resolve, 0));
  assertExportHandle(handle);
};
export const bundleDirectory = handle => new Directory(Paths.document, 'support-bundles', handle.userId);
export const cleanupBundleFiles = (handle, files) => {
  assertExportHandle(handle);
  if (!files.some(Boolean)) return;
  const prefix = `${bundleDirectory(handle).uri.replace(/\/+$/, '')}/`;
  for (const value of files.filter(Boolean)) {
    const uri = value.startsWith('{') ? JSON.parse(value).uri : value;
    if (uri.startsWith(prefix)) { try { const file = new File(uri); if (file.exists) file.delete(); } catch { /* retry at directory cleanup */ } }
  }
};

export const buildDiagnosticBundle = async (handle, { trigger, incidentRef, screenshotFile } = {}) => {
  assertExportHandle(handle);
  const repo = handle.services.repositories.supportIncidents;
  const row = await repo.get(incidentRef.id);
  assertExportHandle(handle);
  if (!row || row.report_generation !== incidentRef.reportGeneration || row.bundle_state !== 'capturing') return null;
  const base = { bundleVersion: 1, bundleId: row.bundle_id, trigger, incidentRef,
    capturedAt: new Date().toISOString(), runtime: getRuntimeDiagnostics(),
    ea: { userId: handle.userId, email: null, displayName: null }, network: null, disk: null, installId: null };
  let file; let screenshot = null;
  const write = async bundle => {
    const text = JSON.stringify(bundle);
    if (utf8Bytes(text) > MAX_BUNDLE_BYTES) throw new Error('Bundle exceeds 12 MB');
    await yieldSection(handle);
    const directory = bundleDirectory(handle);
    directory.create({ intermediates: true, idempotent: true });
    file = new File(directory, `${row.bundle_id}.json`);
    assertExportHandle(handle);
    file.create({ overwrite: true }); file.write(text);
    if (screenshotFile) {
      assertExportHandle(handle);
      const target = new File(directory, `${row.bundle_id}-screenshot.${screenshotFile.extension}`);
      const source = new File(screenshotFile.uri);
      if (source.size > 15*1024*1024) throw new Error('Screenshot exceeds 15 MB');
      if (!source.exists) throw new Error('Screenshot unavailable');
      source.copy(target);
      screenshot = JSON.stringify({ uri: target.uri, extension: screenshotFile.extension, mimeType: screenshotFile.mimeType });
    }
    assertExportHandle(handle);
    const filesOnDisk = (directory.list?.() ?? []).filter(entry => entry instanceof File);
    const evicted = []; let attached;
    await handle.withTransaction(async txn => {
      attached = await repo.updateBundle(incidentRef, { bundle_file: file.uri, screenshot_file: screenshot, bundle_state: 'ready' }, { expectedState: 'capturing', transaction: txn });
      if (!attached?.changes) return;
      const owners = await txn.getAllAsync("select bundle_id from support_incident_queue where bundle_state in ('capturing','ready') and status = 'pending'");
      const liveIds = new Set(owners.map(owner => owner.bundle_id));
      for (const entry of filesOnDisk) {
        const name = entry.uri.split('/').pop();
        const bundleId = name.replace(/-screenshot\.[^.]+$/, '').replace(/\.json$/, '');
        if (!liveIds.has(bundleId)) evicted.push(entry.uri);
      }
      const retained = await txn.getAllAsync(`select * from support_incident_queue
        where bundle_file is not null and bundle_state = 'ready' and report_snapshot is null
        order by created_at, id`);
      for (const victim of retained.slice(0, Math.max(0, retained.length-5))) {
        await repo.updateBundle({ id: victim.id, reportGeneration: victim.report_generation },
          { bundle_state: 'failed', bundle_file: null, screenshot_file: null, flags: { bundleDropped: true } },
          { expectedState: 'ready', transaction: txn });
        evicted.push(victim.bundle_file, victim.screenshot_file);
      }
    });
    if (!attached?.changes) { cleanupBundleFiles(handle, [file.uri, screenshot]); return null; }
    cleanupBundleFiles(handle, evicted);
    return bundle;
  };
  try {
    await yieldSection(handle);
    const profile = await handle.services.deviceProfile.get();
    assertExportHandle(handle);
    base.ea = { userId: handle.userId, email: profile?.email ?? null,
      displayName: profile?.displayName ?? ([profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || null) };
    await yieldSection(handle);
    const supportExport = await debugDump({ handle }, LIMITS);
    await yieldSection(handle);
    const logs = await logger.tail({ maxBytes: 2*1024*1024, maxEntryBytes: 4096 });
    await yieldSection(handle);
    base.network = await NetInfo.fetch();
    assertExportHandle(handle);
    base.installId = await getInstallId();
    assertExportHandle(handle);
    base.disk = { freeDiskBytes: Paths.availableDiskSpace ?? null, totalDiskBytes: Paths.totalDiskSpace ?? null };
    return await write({ ...base, supportExport, logs });
  } catch (error) {
    if (isStaleActorError(error)) throw error;
    assertExportHandle(handle);
    try {
      await yieldSection(handle);
      const small = await debugDump({ handle }, { ...LIMITS, outboxLimit: 50, sectionLimit: 50, masteryLimit: 1 });
      return await write({ ...base, truncated: true, captureError: error.message,
        supportExport: { tableCounts: small.tableCounts, failedOutboxRows: small.failedOutboxRows } });
    } catch (fallbackError) {
      if (isStaleActorError(fallbackError)) throw fallbackError;
      assertExportHandle(handle);
      await repo.updateBundle(incidentRef, { bundle_state: 'failed', flags: { bundleCaptureFailed: true } }, { expectedState: 'capturing' });
      cleanupBundleFiles(handle, [file?.uri, screenshot]);
      return null;
    }
  }
};

// Each confirmed object has its own durable path. A replay after upload but before this
// write receives 409; a replay after this write skips the object, even if its file is gone.
export const uploadIncidentBundle = async (handle, reference) => {
  const repo = handle.services.repositories.supportIncidents;
  let row = await repo.get(reference.id);
  assertExportHandle(handle);
  if (!row || row.report_generation !== reference.reportGeneration || row.status !== 'pending') return false;
  if (row.bundle_state !== 'ready') return ['none','uploaded','failed'].includes(row.bundle_state);
  const folder = `${handle.userId}/${row.created_at.slice(0,10)}/${row.bundle_id}`;
  const screenshot = row.screenshot_file ? JSON.parse(row.screenshot_file) : null;
  const attachments = [
    { file: row.bundle_file, column: 'bundle_path', path: `${folder}.json`, type: 'application/json' },
    ...(screenshot ? [{ file: screenshot.uri, column: 'screenshot_path', path: `${folder}-screenshot.${screenshot.extension}`, type: screenshot.mimeType }] : []),
  ];
  for (const attachment of attachments) {
    assertExportHandle(handle);
    row = await repo.get(reference.id);
    assertExportHandle(handle);
    if (!row || row.report_generation !== reference.reportGeneration || row.bundle_state !== 'ready') return false;
    if (row[attachment.column]) continue;
    const file = attachment.file ? new File(attachment.file) : null;
    if (!file?.exists) {
      await repo.updateBundle(reference, {bundle_state:'failed',flags:{bundleDropped:true}}, {expectedState:'ready'});
      return true;
    }
    try {
      if (file.size > 15*1024*1024) throw new Error('Attachment exceeds 15 MB');
      const bytes = await file.bytes();
      assertExportHandle(handle);
      const response = await handle.enqueueRequest(() => handle.dataClient.storage.from('support-bundles').upload(
        attachment.path, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset+bytes.byteLength),
        {upsert:false, contentType:attachment.type}));
      if (isStaleActorError(response?.error)) throw response.error;
      if (response.error && Number(response.error.statusCode ?? response.error.status) !== 409) throw response.error;
      assertExportHandle(handle);
      const progress = await repo.updateBundle(reference, {[attachment.column]:attachment.path}, {expectedState:'ready'});
      if (!progress?.changes) return false;
      cleanupBundleFiles(handle, [attachment.file]);
    } catch (error) {
      if (isStaleActorError(error)) throw error;
      assertExportHandle(handle);
      const current = await repo.get(reference.id);
      if (!current || current.bundle_state !== 'ready') return false;
      const attempts = current.bundle_attempts+1;
      await repo.updateBundle(reference, {bundle_attempts:attempts, ...(attempts >= 5 ? {bundle_state:'failed',flags:{bundleUploadFailed:true}} : {})}, {expectedState:'ready'});
      if (attempts >= 5) { cleanupBundleFiles(handle, [current.bundle_file,current.screenshot_file]); return true; }
      await repo.markAttemptFailed(reference, error.message || 'Bundle upload failed');
      return false;
    }
  }
  const progress = await repo.updateBundle(reference, {bundle_state:'uploaded'}, {expectedState:'ready'});
  return Boolean(progress?.changes);
};
