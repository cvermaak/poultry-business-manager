/**
 * IndexedDB utility for offline-first catch operations
 * Stores unsaved catch crates and batches locally, syncs when network is restored
 */

export interface OfflineCatchCrate {
  id: string; // Local UUID
  sessionId: number;
  crateTypeId: number;
  birdCount: number;
  grossWeight: number;
  season?: "summer" | "winter";
  transportDuration?: number;
  recordedAt: string; // ISO timestamp
  synced: boolean;
  syncError?: string;
}

export interface OfflineCatchBatch {
  id: string; // Local UUID
  sessionId: number;
  crateTypeId: number;
  numberOfCrates: number;
  birdsPerCrate: number;
  totalGrossWeight: number;
  crateWeight: number;
  palletWeight?: number;
  recordedAt: string; // ISO timestamp
  synced: boolean;
  syncError?: string;
}

const DB_NAME = "poultry-manager-offline";
const DB_VERSION = 1;
const CRATES_STORE = "catch-crates";
const BATCHES_STORE = "catch-batches";

let db: IDBDatabase | null = null;

/**
 * Initialize IndexedDB
 */
export async function initOfflineDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result;

      // Create object stores if they don't exist
      if (!database.objectStoreNames.contains(CRATES_STORE)) {
        const cratesStore = database.createObjectStore(CRATES_STORE, { keyPath: "id" });
        cratesStore.createIndex("sessionId", "sessionId", { unique: false });
        cratesStore.createIndex("synced", "synced", { unique: false });
      }

      if (!database.objectStoreNames.contains(BATCHES_STORE)) {
        const batchesStore = database.createObjectStore(BATCHES_STORE, { keyPath: "id" });
        batchesStore.createIndex("sessionId", "sessionId", { unique: false });
        batchesStore.createIndex("synced", "synced", { unique: false });
      }
    };
  });
}

/**
 * Add offline catch crate
 */
export async function addOfflineCrate(crate: Omit<OfflineCatchCrate, "id">): Promise<string> {
  const database = db || (await initOfflineDB());
  const id = `crate-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([CRATES_STORE], "readwrite");
    const store = transaction.objectStore(CRATES_STORE);
    const request = store.add({ ...crate, id });

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(id);
  });
}

/**
 * Add offline catch batch
 */
export async function addOfflineBatch(batch: Omit<OfflineCatchBatch, "id">): Promise<string> {
  const database = db || (await initOfflineDB());
  const id = `batch-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([BATCHES_STORE], "readwrite");
    const store = transaction.objectStore(BATCHES_STORE);
    const request = store.add({ ...batch, id });

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(id);
  });
}

/**
 * Get all unsynced crates
 */
export async function getUnsyncedCrates(): Promise<OfflineCatchCrate[]> {
  const database = db || (await initOfflineDB());

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([CRATES_STORE], "readonly");
    const store = transaction.objectStore(CRATES_STORE);
    // Query all and filter for synced === false
    const request = store.getAll();

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const unsynced = request.result.filter((crate: any) => crate.synced === false);
      resolve(unsynced);
    };
  });
}

/**
 * Get all unsynced batches
 */
export async function getUnsyncedBatches(): Promise<OfflineCatchBatch[]> {
  const database = db || (await initOfflineDB());

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([BATCHES_STORE], "readonly");
    const store = transaction.objectStore(BATCHES_STORE);
    // Query all and filter for synced === false
    const request = store.getAll();

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const unsynced = request.result.filter((batch: any) => batch.synced === false);
      resolve(unsynced);
    };
  });
}

/**
 * Mark crate as synced
 */
export async function markCrateSynced(id: string): Promise<void> {
  const database = db || (await initOfflineDB());

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([CRATES_STORE], "readwrite");
    const store = transaction.objectStore(CRATES_STORE);
    const request = store.get(id);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const crate = request.result;
      if (crate) {
        crate.synced = true;
        crate.syncError = undefined;
        const updateRequest = store.put(crate);
        updateRequest.onerror = () => reject(updateRequest.error);
        updateRequest.onsuccess = () => resolve();
      } else {
        resolve();
      }
    };
  });
}

/**
 * Mark batch as synced
 */
export async function markBatchSynced(id: string): Promise<void> {
  const database = db || (await initOfflineDB());

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([BATCHES_STORE], "readwrite");
    const store = transaction.objectStore(BATCHES_STORE);
    const request = store.get(id);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const batch = request.result;
      if (batch) {
        batch.synced = true;
        batch.syncError = undefined;
        const updateRequest = store.put(batch);
        updateRequest.onerror = () => reject(updateRequest.error);
        updateRequest.onsuccess = () => resolve();
      } else {
        resolve();
      }
    };
  });
}

/**
 * Mark crate sync error
 */
export async function markCrateSyncError(id: string, error: string): Promise<void> {
  const database = db || (await initOfflineDB());

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([CRATES_STORE], "readwrite");
    const store = transaction.objectStore(CRATES_STORE);
    const request = store.get(id);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const crate = request.result;
      if (crate) {
        crate.syncError = error;
        const updateRequest = store.put(crate);
        updateRequest.onerror = () => reject(updateRequest.error);
        updateRequest.onsuccess = () => resolve();
      } else {
        resolve();
      }
    };
  });
}

/**
 * Delete offline crate
 */
export async function deleteOfflineCrate(id: string): Promise<void> {
  const database = db || (await initOfflineDB());

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([CRATES_STORE], "readwrite");
    const store = transaction.objectStore(CRATES_STORE);
    const request = store.delete(id);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

/**
 * Delete offline batch
 */
export async function deleteOfflineBatch(id: string): Promise<void> {
  const database = db || (await initOfflineDB());

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([BATCHES_STORE], "readwrite");
    const store = transaction.objectStore(BATCHES_STORE);
    const request = store.delete(id);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

/**
 * Clear all offline data
 */
export async function clearOfflineData(): Promise<void> {
  const database = db || (await initOfflineDB());

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([CRATES_STORE, BATCHES_STORE], "readwrite");
    
    const cratesRequest = transaction.objectStore(CRATES_STORE).clear();
    const batchesRequest = transaction.objectStore(BATCHES_STORE).clear();

    transaction.onerror = () => reject(transaction.error);
    transaction.oncomplete = () => resolve();
  });
}
