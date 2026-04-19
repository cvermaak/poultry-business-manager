/**
 * Offline sync manager
 * Handles automatic syncing of offline catch data when network is restored
 */

import { getUnsyncedCrates, getUnsyncedBatches, markCrateSynced, markBatchSynced, markCrateSyncError } from "./offline-db";

export interface SyncStatus {
  isOnline: boolean;
  isSyncing: boolean;
  pendingCrates: number;
  pendingBatches: number;
  lastSyncTime?: Date;
  syncErrors: string[];
}

let syncStatus: SyncStatus = {
  isOnline: navigator.onLine,
  isSyncing: false,
  pendingCrates: 0,
  pendingBatches: 0,
  syncErrors: [],
};

let syncListeners: Array<(status: SyncStatus) => void> = [];
let syncMutationRef: any = null;

/**
 * Subscribe to sync status changes
 */
export function onSyncStatusChange(callback: (status: SyncStatus) => void): () => void {
  syncListeners.push(callback);
  // Call immediately with current status
  callback(syncStatus);
  // Return unsubscribe function
  return () => {
    syncListeners = syncListeners.filter((l) => l !== callback);
  };
}

/**
 * Notify listeners of status change
 */
function notifySyncStatus() {
  syncListeners.forEach((listener) => listener(syncStatus));
}

/**
 * Get current sync status
 */
export function getSyncStatus(): SyncStatus {
  return { ...syncStatus };
}

/**
 * Attempt to sync offline data using the backend endpoint
 */
export async function syncOfflineData(syncMutation: any): Promise<void> {
  // Update online status before checking
  syncStatus.isOnline = navigator.onLine;
  
  if (syncStatus.isSyncing || !syncStatus.isOnline) {
    console.log("Sync skipped - isSyncing:", syncStatus.isSyncing, "isOnline:", syncStatus.isOnline);
    return;
  }

  syncStatus.isSyncing = true;
  syncStatus.syncErrors = [];
  notifySyncStatus();

  try {
    // Get all unsynced batches
    const unsyncedBatches = await getUnsyncedBatches();
    console.log("Unsynced batches found:", unsyncedBatches.length);
    
    if (unsyncedBatches.length === 0) {
      console.log("No unsynced batches to sync");
      syncStatus.isSyncing = false;
      notifySyncStatus();
      return;
    }

    // Call the sync endpoint with all batches
    const batchesToSync = unsyncedBatches.map((batch: any) => ({
      sessionId: batch.sessionId,
      crateTypeId: batch.crateTypeId,
      numberOfCrates: batch.numberOfCrates,
      birdsPerCrate: batch.birdsPerCrate,
      totalGrossWeight: batch.totalGrossWeight,
      crateWeight: batch.crateWeight,
      palletWeight: batch.palletWeight,
    }));

    console.log("Syncing batches:", batchesToSync);

    // Use the mutation to sync
    return new Promise<void>((resolve, reject) => {
      syncMutation.mutate(batchesToSync, {
        onSuccess: async (result: any) => {
          console.log("Batches synced successfully:", result);
          // Mark all batches as synced
          for (const batch of unsyncedBatches) {
            await markBatchSynced(batch.id);
          }
          syncStatus.lastSyncTime = new Date();
          syncStatus.isSyncing = false;
          syncStatus.pendingBatches = 0;
          notifySyncStatus();
          resolve();
        },
        onError: (error: any) => {
          console.error("Batch sync error:", error);
          syncStatus.syncErrors.push(`Batch sync failed: ${error.message}`);
          syncStatus.isSyncing = false;
          notifySyncStatus();
          reject(error);
        },
      });
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    console.error("Sync error:", errorMsg);
    syncStatus.syncErrors.push(`Sync failed: ${errorMsg}`);
    syncStatus.isSyncing = false;
    notifySyncStatus();
    throw error;
  }
}

/**
 * Initialize offline sync
 */
export function initializeOfflineSync(syncMutation: any): () => void {
  syncMutationRef = syncMutation;
  
  // Handle online/offline events
  const handleOnline = async () => {
    console.log("Online event triggered");
    syncStatus.isOnline = true;
    notifySyncStatus();
    // Attempt to sync when coming back online
    try {
      await syncOfflineData(syncMutation);
    } catch (error) {
      console.error("Auto-sync failed:", error);
    }
  };

  const handleOffline = () => {
    console.log("Offline event triggered");
    syncStatus.isOnline = false;
    notifySyncStatus();
  };

  // Set initial online status
  syncStatus.isOnline = navigator.onLine;

  window.addEventListener("online", handleOnline);
  window.addEventListener("offline", handleOffline);

  // Return cleanup function
  return () => {
    window.removeEventListener("online", handleOnline);
    window.removeEventListener("offline", handleOffline);
  };
}

/**
 * Update pending counts
 */
export async function updatePendingCounts(): Promise<void> {
  try {
    const crates = await getUnsyncedCrates();
    const batches = await getUnsyncedBatches();
    
    syncStatus.pendingCrates = crates.length;
    syncStatus.pendingBatches = batches.length;
    console.log("Pending counts updated - crates:", crates.length, "batches:", batches.length);
    notifySyncStatus();
  } catch (error) {
    console.error("Error updating pending counts:", error);
  }
}
