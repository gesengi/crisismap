/**
 * @file offlineManager.js
 * @description Offline data management service for CrisisMap.
 *
 * Uses IndexedDB (via the `idb` package) to persist reports created while
 * offline. When connectivity is restored, pending reports can be synced
 * to Firebase via `syncPendingReports()`.
 *
 * Also exposes a hook-friendly network status API so React components
 * can reactively show online / offline indicators.
 *
 * @requires idb — `npm install idb`
 */

import { openDB } from 'idb';

// ─── Database Setup ──────────────────────────────────────────────────────────

const DB_NAME = 'crisismap-offline';
const DB_VERSION = 1;
const STORE_PENDING = 'pendingReports';

/**
 * Open (or create) the IndexedDB database.
 * Lazily initialized and cached as a module-level promise.
 *
 * @returns {Promise<import('idb').IDBPDatabase>}
 */
function getDB() {
  // Cache the promise so we only open the DB once
  if (!getDB._promise) {
    getDB._promise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_PENDING)) {
          db.createObjectStore(STORE_PENDING, { keyPath: 'id' });
        }
      }
    });
  }
  return getDB._promise;
}

// ─── Pending Reports CRUD ────────────────────────────────────────────────────

/**
 * Save a report that was created while offline.
 * The report object must include an `id` field.
 *
 * @param {Object} report - The report data (with `id`).
 * @returns {Promise<void>}
 */
export async function savePendingReport(report) {
  try {
    if (!report || !report.id) {
      throw new Error('Report must have an `id` field.');
    }
    const db = await getDB();
    await db.put(STORE_PENDING, {
      ...report,
      _savedAt: Date.now()
    });
  } catch (err) {
    console.error('[CrisisMap] Failed to save pending report:', err);
    throw err;
  }
}

/**
 * Retrieve all pending (un-synced) reports.
 *
 * @returns {Promise<Array<Object>>}
 */
export async function getPendingReports() {
  try {
    const db = await getDB();
    return await db.getAll(STORE_PENDING);
  } catch (err) {
    console.error('[CrisisMap] Failed to get pending reports:', err);
    return [];
  }
}

/**
 * Remove a pending report after successful sync.
 *
 * @param {string} id - The report id.
 * @returns {Promise<void>}
 */
export async function removePendingReport(id) {
  try {
    const db = await getDB();
    await db.delete(STORE_PENDING, id);
  } catch (err) {
    console.error('[CrisisMap] Failed to remove pending report:', err);
    throw err;
  }
}

/**
 * Attempt to sync all pending reports to the backend.
 * Uses the `createReport` function from `reportService` to push each one.
 * Successfully synced reports are removed from IndexedDB.
 *
 * @param {Function} createReportFn - The createReport function from reportService.
 *   Passed as a parameter to avoid circular imports.
 * @returns {Promise<{ synced: number, failed: number }>}
 */
export async function syncPendingReports(createReportFn) {
  const pending = await getPendingReports();
  if (pending.length === 0) return { synced: 0, failed: 0 };

  let synced = 0;
  let failed = 0;

  for (const report of pending) {
    try {
      // Remove internal metadata before syncing
      const reportData = { ...report };
      delete reportData._savedAt;
      delete reportData.synced;
      await createReportFn({ ...reportData, synced: true });
      await removePendingReport(report.id);
      synced++;
    } catch (err) {
      console.warn(
        `[CrisisMap] Failed to sync report ${report.id}:`,
        err
      );
      failed++;
    }
  }

  console.info(
    `[CrisisMap] Sync complete — ${synced} synced, ${failed} failed.`
  );
  return { synced, failed };
}

// ─── Network Status API ──────────────────────────────────────────────────────

/**
 * Get the current network connectivity status.
 *
 * @returns {boolean} `true` if the browser reports being online.
 */
export function getNetworkStatus() {
  return typeof navigator !== 'undefined' ? navigator.onLine : true;
}

/**
 * Subscribe to network status changes.
 * Returns an unsubscribe function for easy cleanup in React `useEffect`.
 *
 * @param {(online: boolean) => void} callback - Called with `true` (online) or `false` (offline).
 * @returns {() => void} Unsubscribe function.
 *
 * @example
 * // In a React component
 * useEffect(() => {
 *   const unsubscribe = onNetworkChange((online) => {
 *     setIsOnline(online);
 *   });
 *   return unsubscribe;
 * }, []);
 */
export function onNetworkChange(callback) {
  const handleOnline = () => callback(true);
  const handleOffline = () => callback(false);

  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);

  // Return cleanup function
  return () => {
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
  };
}
