import { initializeApp, deleteApp } from "firebase/app";
import {
  getAuth,
  connectAuthEmulator,
  browserLocalPersistence,
  setPersistence,
} from "firebase/auth";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
import { getFunctions, connectFunctionsEmulator } from "firebase/functions";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "demo-api-key",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "lms-crm-dev.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "lms-crm-dev",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "lms-crm-dev.appspot.com",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "0",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "0:0:web:0",
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app);

void setPersistence(auth, browserLocalPersistence);

const useEmulators = import.meta.env.VITE_USE_EMULATORS !== "false";

if (useEmulators) {
  // Local Firebase Emulator Suite — see README for `firebase emulators:start`.
  // Guarded so a production build never accidentally points at localhost.
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
  connectFunctionsEmulator(functions, "127.0.0.1", 5001);
}

/**
 * A throwaway, isolated Firebase App + Auth instance for creating a NEW
 * user's login from the browser (Admin → Staff → Create User). The Auth
 * client SDK signs in as whichever user it just created — running that on
 * an isolated app, instead of the real `auth`, is what stops creating a
 * staff account from kicking the signed-in admin out of their own session.
 * Callers must call the returned `cleanup()` once done.
 */
export function createIsolatedAuthApp() {
  const isolatedApp = initializeApp(firebaseConfig, `isolated-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const isolatedAuth = getAuth(isolatedApp);
  if (useEmulators) {
    connectAuthEmulator(isolatedAuth, "http://127.0.0.1:9099", { disableWarnings: true });
  }
  return { auth: isolatedAuth, cleanup: () => deleteApp(isolatedApp) };
}
