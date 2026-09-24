// Browser-only storage for a driver step tapped while offline. One pending
// step per assignment: later steps depend on the server accepting this one.

export type QueuedDriverStep = {
  id: string;
  assignmentId: string;
  status: string;
  note: string;
  occurredAt: string;
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  photo: Blob | null;
  photoName: string | null;
};

const DB_NAME = "waydidi-driver";
const STORE = "pending-steps";

function openDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === "undefined") { reject(new Error("Offline storage is unavailable on this device.")); return; }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: "assignmentId" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Offline storage is unavailable."));
  });
}

async function run<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>) {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const request = action(db.transaction(STORE, mode).objectStore(STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("Offline storage failed."));
    });
  } finally {
    db.close();
  }
}

export async function readQueuedStep(assignmentId: string) {
  try {
    return (await run<QueuedDriverStep | undefined>("readonly", (store) => store.get(assignmentId))) ?? null;
  } catch {
    return null;
  }
}

export function saveQueuedStep(step: QueuedDriverStep) {
  return run("readwrite", (store) => store.put(step));
}

export async function clearQueuedStep(assignmentId: string) {
  try { await run("readwrite", (store) => store.delete(assignmentId)); } catch { /* nothing stored */ }
}

export function queuedStepForm(step: QueuedDriverStep) {
  const data = new FormData();
  data.set("status", step.status);
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
