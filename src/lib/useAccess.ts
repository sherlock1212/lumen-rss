import { createContext, useContext, useEffect, useRef, useState } from "react";
import { doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { db, type User } from "./firebase";
import { ADMIN_ROLE, normalizeEmail } from "./access";

export type AccessState =
  | { status: "signed-out" }
  | { status: "checking" }
  | { status: "allowed"; email: string; isAdmin: boolean }
  | { status: "denied"; email: string }
  | { status: "error"; message: string };

type Person = Pick<User, "uid" | "email" | "emailVerified">;

const code = (e: unknown) => (e as { code?: string }).code;

/**
 * Is this signed-in person allowed to use the app?
 * Anybody must have a document in "allowlist" (we listen to it, so removing someone locks them
 * out right away). The administrator has none the very first time: they try to create their
 * own, which firestore.rules accept only from the owner. Everybody else is refused by the rules,
 * and that refusal is what "denied" means. The same rules are enforced again for every piece of
 * data and by the server: this hook only decides what the screen shows.
 */
export function useAccess(user: Person | null): AccessState {
  const [res, setRes] = useState<{ uid: string | null; state: AccessState }>({
    uid: null,
    state: { status: "signed-out" },
  });
  const triedToJoin = useRef<string | null>(null);

  const uid = user?.uid ?? null;
  const email = normalizeEmail(user?.email);
  const verified = user?.emailVerified ?? false;

  useEffect(() => {
    const set = (state: AccessState) => setRes({ uid, state });
    if (!uid) return set({ status: "signed-out" });
    if (!email || !verified) return set({ status: "denied", email });

    set({ status: "checking" });
    const ref = doc(db, "allowlist", email);
    return onSnapshot(
      ref,
      (snap) => {
        if (snap.exists()) {
          const role = (snap.data() as { role?: string } | undefined)?.role;
          return set({ status: "allowed", email, isAdmin: role === ADMIN_ROLE });
        }
        // Not there *in the local cache* proves nothing: wait for the server's answer.
        if (snap.metadata.fromCache) return;
        // Only the owner can create their own entry; for anybody else the rules say no.
        if (triedToJoin.current === uid) return set({ status: "denied", email });
        triedToJoin.current = uid;
        setDoc(ref, { role: ADMIN_ROLE, addedBy: email, addedAt: serverTimestamp() }).catch((e) => {
          if (code(e) === "permission-denied") set({ status: "denied", email });
          else set({ status: "error", message: (e as Error).message });
        });
      },
      (e) => {
        if (code(e) === "permission-denied") set({ status: "denied", email });
        else set({ status: "error", message: (e as Error).message });
      },
    );
  }, [uid, email, verified]);

  // Never show the answer that belongs to somebody else (or to nobody) for even one frame.
  if (res.uid === uid) return res.state;
  return uid ? { status: "checking" } : { status: "signed-out" };
}

/** Who is signed in and may be here; provided by AccessGate for the menus inside it. */
export interface AccessInfo {
  email: string;
  isAdmin: boolean;
}
export const AccessContext = createContext<AccessInfo | null>(null);
export function useAccessInfo(): AccessInfo | null {
  return useContext(AccessContext);
}
