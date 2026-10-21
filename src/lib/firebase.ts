import { initializeApp, getApps } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  deleteUser,
  signOut as fbSignOut,
  onAuthStateChanged,
  type User,
} from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = getApps()[0] ?? initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
const provider = new GoogleAuthProvider();

export function signInWithGoogle() {
  return signInWithPopup(auth, provider);
}

export function signOut() {
  return fbSignOut(auth);
}

/** An account created this very moment (not just "never signed in again"). */
const JUST_CREATED_MS = 5 * 60 * 1000;

/**
 * Called for someone who signed in with Google but is not on the allowed list.
 * Their account was created by that very sign-in (Firebase does it before we can say no),
 * so when it is brand new we delete it again: nothing is left in Authentication.
 * Any older account is only signed out, never deleted: it may hold saved data (somebody who
 * was allowed and has been removed, or the administrator while the rules are being fixed).
 */
export async function rejectAccount(user: User): Promise<void> {
  const created = Date.parse(user.metadata.creationTime ?? "");
  const isNew =
    user.metadata.creationTime === user.metadata.lastSignInTime &&
    Number.isFinite(created) &&
    Math.abs(Date.now() - created) < JUST_CREATED_MS;
  if (isNew) {
    try {
      await deleteUser(user);
      return;
    } catch {
      // e.g. offline: fall through and at least sign out
    }
  }
  await fbSignOut(auth);
}

/** A fresh ID token for the server, or null when nobody is signed in. */
export async function getIdToken(forceRefresh = false): Promise<string | null> {
  return (await auth.currentUser?.getIdToken(forceRefresh)) ?? null;
}

export function subscribeAuth(cb: (user: User | null) => void) {
  return onAuthStateChanged(auth, cb);
}

export type { User };
