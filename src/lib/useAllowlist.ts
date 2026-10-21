import { useCallback, useEffect, useState } from "react";
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { db } from "./firebase";
import { ADMIN_ROLE, isValidEmail, normalizeEmail } from "./access";

export interface AllowedPerson {
  email: string;
  addedAt: Date | null;
  /** the administrator: always has access, cannot be removed from the list */
  isAdmin: boolean;
}

/** The allowed addresses, live. Only the administrator can read the whole list (see the rules). */
export function useAllowlist() {
  const [people, setPeople] = useState<AllowedPerson[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return onSnapshot(
      collection(db, "allowlist"),
      (snap) => {
        const list = snap.docs.map((d) => {
          const data = d.data() as { addedAt?: { toDate?: () => Date }; role?: string } | undefined;
          return {
            email: d.id,
            addedAt: data?.addedAt?.toDate?.() ?? null,
            isAdmin: data?.role === ADMIN_ROLE,
          };
        });
        list.sort((a, b) => a.email.localeCompare(b.email));
        setPeople(list);
        setError(null);
      },
      (e) => setError((e as Error).message),
    );
  }, []);

  const add = useCallback(async (raw: string, addedBy: string) => {
    const email = normalizeEmail(raw);
    if (!isValidEmail(email)) throw new Error("That does not look like an email address.");
    if (email === normalizeEmail(addedBy)) throw new Error("That is you: you always have access.");
    await setDoc(doc(db, "allowlist", email), { addedAt: serverTimestamp(), addedBy });
    return email;
  }, []);

  const remove = useCallback((email: string) => deleteDoc(doc(db, "allowlist", email)), []);

  return { people, error, add, remove };
}
