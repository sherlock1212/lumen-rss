import { initializeApp, getApps } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut as fbSignOut,
  onAuthStateChanged,
  type User,
} from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// ⚠️ REPLACE THESE VALUES with your Firebase project's web config.
// Get them from Firebase Console → Project Settings → Your apps → Web app.
// These values are PUBLIC and safe to commit (Firebase enforces security
// via Auth rules + authorized domains, not by hiding the API key).
//
// Don't forget to:
//   1) Enable Google sign-in in Firebase Console → Authentication → Sign-in method
//   2) Add your Lovable preview & published domains to Authorized domains
//   3) Enable Cloud Firestore in Firebase Console → Firestore Database → Create database
//      and set security rules so each user can only read/write their own doc:
//
//      rules_version = '2';
//      service cloud.firestore {
//        match /databases/{database}/documents {
//          match /users/{userId}/{document=**} {
//            allow read, write: if request.auth != null && request.auth.uid == userId;
//          }
//        }
//      }
const firebaseConfig = {
  apiKey: "REPLACE_ME",
  authDomain: "REPLACE_ME.firebaseapp.com",
  projectId: "REPLACE_ME",
  appId: "REPLACE_ME",
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

export function subscribeAuth(cb: (user: User | null) => void) {
  return onAuthStateChanged(auth, cb);
}

export type { User };
