// Who may use the app. Shared by the browser and the server (no Firebase imports here).
//
// The list of allowed people lives in Firestore, collection "allowlist", one document per
// address (the document id IS the lowercase address). The administrator's address is written
// only in firestore.rules, never in the website: the administrator is whoever those rules call
// the owner. The owner keeps a document in the list too, marked role "admin" (the app creates
// it on the first sign-in), so the server and the screens can treat everybody the same way.

export const ADMIN_ROLE = "admin";

export function normalizeEmail(email: string | null | undefined): string {
  return (email ?? "").trim().toLowerCase();
}

/** Loose on purpose: Google decides what a real address is. No "/" because it is a document id. */
export function isValidEmail(value: string): boolean {
  return value.length <= 254 && /^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/.test(value);
}
