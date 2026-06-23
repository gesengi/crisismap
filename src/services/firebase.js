/**
 * @file firebase.js
 * @description Firebase configuration and initialization for CrisisMap.
 *
 * Reads Firebase credentials from Vite environment variables (VITE_FIREBASE_*).
 * If credentials are missing, the module enters MOCK MODE — exporting
 * `IS_MOCK_MODE = true` so the rest of the app can fall back to localStorage
 * and simulated async operations for demo / offline-first development.
 */

// ─── Environment Variable Extraction ─────────────────────────────────────────

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

/**
 * Check whether the minimum required Firebase config values are present.
 * We require at least apiKey and projectId to consider Firebase "configured".
 */
const isFirebaseConfigured =
  Boolean(firebaseConfig.apiKey) && Boolean(firebaseConfig.projectId);

// ─── Exports (conditional on config presence) ────────────────────────────────

/** @type {boolean} True when Firebase credentials are missing → app uses local storage. */
export let IS_MOCK_MODE = !isFirebaseConfigured;

/** @type {import('firebase/firestore').Firestore | null} */
export let db = null;

/** @type {import('firebase/auth').Auth | null} */
export let auth = null;

/** @type {import('firebase/storage').FirebaseStorage | null} */
export let storage = null;

/** @type {import('firebase/app').FirebaseApp | null} */
export let app = null;

// ─── Conditional Initialization ──────────────────────────────────────────────

if (isFirebaseConfigured) {
  try {
    // Dynamic imports keep the Firebase SDK out of the bundle when in mock mode
    const { initializeApp } = await import('firebase/app');
    const { getFirestore, enableIndexedDbPersistence } = await import(
      'firebase/firestore'
    );
    const { getAuth } = await import('firebase/auth');
    const { getStorage } = await import('firebase/storage');

    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    auth = getAuth(app);
    storage = getStorage(app);

    // Enable offline persistence so Firestore works without connectivity.
    // The call may throw if persistence is already enabled (e.g. multiple tabs).
    try {
      await enableIndexedDbPersistence(db);
    } catch (persistenceError) {
      if (persistenceError.code === 'failed-precondition') {
        console.warn(
          '[CrisisMap] Firestore persistence failed — multiple tabs may be open.'
        );
      } else if (persistenceError.code === 'unimplemented') {
        console.warn(
          '[CrisisMap] Firestore persistence is not available in this browser.'
        );
      } else {
        console.error(
          '[CrisisMap] Firestore persistence error:',
          persistenceError
        );
      }
    }

    console.info('[CrisisMap] Firebase initialized successfully.');
  } catch (initError) {
    console.error('[CrisisMap] Firebase initialization failed:', initError);
    // Fall back to mock mode so the app doesn't crash
    IS_MOCK_MODE = true;
  }
} else {
  console.info(
    '[CrisisMap] No Firebase config detected — running in MOCK MODE. ' +
      'Data will be stored in localStorage.'
  );
}
