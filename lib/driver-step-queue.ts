// Browser-only storage for a driver step tapped while offline. One pending
// step per assignment: later steps depend on the server accepting this one.
import { sha256, sha256Bytes } from "./security";
import { initialDriverSync, mayRetryDriverStep, type DriverStepSync } from "./driver-sync-rules";

export type QueuedDriverStep = {
  id: string;
  assignmentId: string;
  status: string;
  note: string;
  occurredAt: string;
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  evidenceId?: string | null;
  photo: Blob | null;
  photoName: string | null;
  payloadHash?: string;
  sync?: DriverStepSync;
};

export type DriverSyncState = { assignmentId: string; lastSuccessAt: string };

const DB_NAME = "waydidi-driver";
const STORE = "pending-steps";
const SYNC_STORE = "sync-state";

function openDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === "undefined") { reject(new Error("Offline storage is unavailable on this device.")); return; }
    let blocked = false;
    const request = indexedDB.open(DB_NAME, 2);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: "assignmentId" });
      if (!request.result.objectStoreNames.contains(SYNC_STORE)) request.result.createObjectStore(SYNC_STORE, { keyPath: "assignmentId" });
    };
    request.onblocked = () => { blocked = true; reject(new Error("QUEUE_STORAGE_BLOCKED")); };
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close();
      if (blocked) request.result.close();
      else resolve(request.result);
    };
    request.onerror = () => reject(request.error ?? new Error("Offline storage is unavailable."));
  });
}

async function transaction<T>(stores: string[], mode: IDBTransactionMode, action: (tx: IDBTransaction, done: (value: T) => void, fail: (error: Error) => void) => void) {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(stores, mode);
      let value: T;
      tx.oncomplete = () => {
        resolve(value);
        if (mode === "readwrite" && stores.includes(STORE)) {
          try { const channel = new BroadcastChannel("waydidi-driver-queue"); channel.postMessage("changed"); channel.close(); } catch { /* polling remains available */ }
        }
      };
      tx.onerror = () => reject(tx.error ?? new Error("Offline storage failed."));
      tx.onabort = () => reject(tx.error ?? new Error("Offline storage aborted."));
      try { action(tx, result => { value = result; }, error => { reject(error); tx.abort(); }); }
      catch (error) { reject(error); tx.abort(); }
    });
  } finally {
    db.close();
  }
}

export async function readQueuedStep(assignmentId: string) {
  return transaction<QueuedDriverStep | null>([STORE], "readonly", (tx, done) => {
    const request = tx.objectStore(STORE).get(assignmentId);
    request.onsuccess = () => done(request.result ?? null);
  });
}

export async function saveQueuedStep(step: QueuedDriverStep) {
  const photoHash = step.photo ? await sha256Bytes(new Uint8Array(await step.photo.arrayBuffer())) : null;
  const payloadHash = await sha256(JSON.stringify([step.id, step.assignmentId, step.status, step.note, step.occurredAt, step.latitude, step.longitude, step.accuracy, step.evidenceId ?? null, step.photoName, step.photo?.type ?? null, photoHash]));
  return transaction<QueuedDriverStep>([STORE], "readwrite", (tx, done, fail) => {
    const store = tx.objectStore(STORE), request = store.get(step.assignmentId);
    request.onsuccess = () => {
      const existing = request.result as QueuedDriverStep | undefined;
      if (existing) {
        if (existing.id !== step.id || existing.payloadHash !== payloadHash) { fail(new Error("QUEUED_STEP_CONFLICT")); return; }
        done(existing); return;
      }
      const prepared = { ...step, payloadHash, sync: { ...initialDriverSync(), ...step.sync, leaseId: null, leaseUntil: null } };
      store.add(prepared); done(prepared);
    };
  });
}

/** Deletes only the named event, never a newer step written by another tab. */
export function clearQueuedStep(assignmentId: string, eventId: string) {
  return transaction<boolean>([STORE], "readwrite", (tx, done) => {
    const store = tx.objectStore(STORE), request = store.get(assignmentId);
    request.onsuccess = () => {
      const matches = request.result?.id === eventId && !(request.result?.sync?.leaseUntil && Date.parse(request.result.sync.leaseUntil) > Date.now());
      if (matches) store.delete(assignmentId);
      done(matches);
    };
  });
}

export function updateQueuedStepSync(assignmentId: string, eventId: string, change: (previous: DriverStepSync) => DriverStepSync, expectedLease?: string | null) {
  return transaction<QueuedDriverStep | null>([STORE], "readwrite", (tx, done) => {
    const store = tx.objectStore(STORE), request = store.get(assignmentId);
    request.onsuccess = () => {
      const existing = request.result as QueuedDriverStep | undefined;
      if (!existing || existing.id !== eventId || expectedLease && existing.sync?.leaseId !== expectedLease) { done(null); return; }
      const next = { ...existing, sync: change(existing.sync ?? initialDriverSync()) };
      store.put(next); done(next);
    };
  });
}

/** A short, durable lease coordinates tabs. Server event IDs still deduplicate retries. */
export function claimQueuedStepAttempt(assignmentId: string, eventId: string, manual = false, now = Date.now()) {
  return transaction<QueuedDriverStep | null>([STORE], "readwrite", (tx, done) => {
    const store = tx.objectStore(STORE), request = store.get(assignmentId);
    request.onsuccess = () => {
      const existing = request.result as QueuedDriverStep | undefined;
      if (!existing || existing.id !== eventId || !mayRetryDriverStep(existing.sync, now, manual)) { done(null); return; }
      const previous = existing.sync ?? initialDriverSync();
      const next = { ...existing, sync: { ...previous, attempts: previous.attempts + 1, lastAttemptAt: new Date(now).toISOString(), blocked: false, error: null, message: null, retryAt: null, leaseId: crypto.randomUUID(), leaseUntil: new Date(now + 75000).toISOString() } };
      store.put(next); done(next);
    };
  });
}

export function readDriverSync(assignmentId: string) {
  return transaction<DriverSyncState | null>([SYNC_STORE], "readonly", (tx, done) => {
    const request = tx.objectStore(SYNC_STORE).get(assignmentId);
    request.onsuccess = () => done(request.result ?? null);
  });
}

export function recordDriverSync(assignmentId: string, at = new Date().toISOString()) {
  return transaction<DriverSyncState>([SYNC_STORE], "readwrite", (tx, done) => {
    const store = tx.objectStore(SYNC_STORE), request = store.get(assignmentId);
    request.onsuccess = () => {
      const previous = request.result as DriverSyncState | undefined;
      const next = { assignmentId, lastSuccessAt: previous && previous.lastSuccessAt > at ? previous.lastSuccessAt : at };
      store.put(next); done(next);
    };
  });
}

/** Clearing the matching event and recording its acknowledgment commit together. */
export function acknowledgeQueuedStep(assignmentId: string, eventId: string, at = new Date().toISOString()) {
  return transaction<QueuedDriverStep | null>([STORE, SYNC_STORE], "readwrite", (tx, done) => {
    const pending = tx.objectStore(STORE), request = pending.get(assignmentId);
    request.onsuccess = () => {
      const existing = request.result as QueuedDriverStep | undefined;
      if (existing?.id === eventId) { pending.delete(assignmentId); done(null); }
      else done(existing ?? null);
    };
    const sync = tx.objectStore(SYNC_STORE), saved = sync.get(assignmentId);
    saved.onsuccess = () => sync.put({ assignmentId, lastSuccessAt: saved.result?.lastSuccessAt > at ? saved.result.lastSuccessAt : at });
  });
}

export function queuedStepForm(step: QueuedDriverStep) {
  const data = new FormData();
  data.set("status", step.status);
  if(step.evidenceId) data.set("evidenceId",step.evidenceId);
  data.set("note", step.note);
  data.set("clientEventId", step.id);
  data.set("occurredAt", step.occurredAt);
  if (step.latitude !== null && step.longitude !== null && step.accuracy !== null) {
    data.set("latitude", String(step.latitude));
    data.set("longitude", String(step.longitude));
    data.set("accuracy", String(step.accuracy));
  }
  if (step.photo) data.set("evidence", new File([step.photo], step.photoName ?? "evidence.jpg", { type: step.photo.type }));
  return data;
}
