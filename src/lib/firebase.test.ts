// What happens to the Google account of somebody who signed in but is not on the list.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  deleteUser: vi.fn(async (_u: unknown) => {}),
  signOut: vi.fn(async (_a: unknown) => {}),
}));
vi.mock("firebase/app", () => ({ initializeApp: () => ({}), getApps: () => [] }));
vi.mock("firebase/firestore", () => ({ getFirestore: () => ({}) }));
vi.mock("firebase/auth", () => ({
  getAuth: () => ({ currentUser: null }),
  GoogleAuthProvider: class {},
  signInWithPopup: vi.fn(),
  onAuthStateChanged: vi.fn(),
  deleteUser: m.deleteUser,
  signOut: m.signOut,
}));

import { rejectAccount } from "./firebase";

const person = (created: string, lastSignIn: string) =>
  ({ metadata: { creationTime: created, lastSignInTime: lastSignIn } }) as never;
const NOW = Date.UTC(2026, 9, 20, 10, 0, 30);
const T1 = new Date(NOW - 30_000).toUTCString(); // created 30 seconds ago
const T2 = new Date(NOW + 90 * 60_000).toUTCString();

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  m.deleteUser.mockReset().mockResolvedValue(undefined);
  m.signOut.mockReset().mockResolvedValue(undefined);
});

afterEach(() => vi.useRealTimers());

describe("rejectAccount", () => {
  it("an account created by this very sign-in is deleted: nothing is left in Authentication", async () => {
    const u = person(T1, T1);
    await rejectAccount(u);
    expect(m.deleteUser).toHaveBeenCalledWith(u);
    expect(m.signOut).not.toHaveBeenCalled();
  });

  it("an older account (somebody who was allowed and was removed) is only signed out, its data is kept", async () => {
    await rejectAccount(person(T1, T2));
    expect(m.deleteUser).not.toHaveBeenCalled();
    expect(m.signOut).toHaveBeenCalledTimes(1);
  });

  it("an old account that never signed in a second time is NOT deleted (its data would be orphaned)", async () => {
    const longAgo = new Date(NOW - 30 * 24 * 3600_000).toUTCString();
    await rejectAccount(person(longAgo, longAgo));
    expect(m.deleteUser).not.toHaveBeenCalled();
    expect(m.signOut).toHaveBeenCalledTimes(1);
  });

  it("garbage dates never lead to a deletion", async () => {
    await rejectAccount(person("", ""));
    await rejectAccount(person("nonsense", "nonsense"));
    expect(m.deleteUser).not.toHaveBeenCalled();
    expect(m.signOut).toHaveBeenCalledTimes(2);
  });

  it("if the deletion fails (offline, ...) they are at least signed out", async () => {
    m.deleteUser.mockRejectedValue(new Error("network"));
    await rejectAccount(person(T1, T1));
    expect(m.signOut).toHaveBeenCalledTimes(1);
  });
});
