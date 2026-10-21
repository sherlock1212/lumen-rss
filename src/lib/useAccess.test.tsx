// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { useAccess, type AccessState } from "./useAccess";
import { fs, snap } from "@/test/fakeFirestore";
import { mount } from "@/test/render";

vi.mock("firebase/firestore", () => import("@/test/fakeFirestore"));
vi.mock("./firebase", () => ({ db: {} }));

type Person = { uid: string; email: string | null; emailVerified: boolean };
const me: Person = { uid: "u1", email: "me@example.com", emailVerified: true };

let state: AccessState;
const C = ({ user }: { user: Person | null }) => ((state = useAccess(user)), null);
const open = async (user: Person | null = me) => {
  const m = mount(<C user={user} />);
  await act(async () => {});
  return m;
};
const answer = (data: unknown, fromCache = false) =>
  act(async () => fs.on("allowlist/me@example.com").cb(snap(data, fromCache)));

beforeEach(() => fs.reset());
afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("useAccess", () => {
  it("nobody signed in -> signed-out, and nothing is asked", async () => {
    await open(null);
    expect(state).toEqual({ status: "signed-out" });
    expect(fs.listeners).toHaveLength(0);
  });

  it.each([
    ["an unverified address", { ...me, emailVerified: false }],
    ["no address", { ...me, email: null }],
  ])("%s is denied without asking the database", async (_n, user) => {
    await open(user);
    expect(state.status).toBe("denied");
    expect(fs.listeners).toHaveLength(0);
  });

  it("looks up the lowercase address, and says 'checking' until the answer comes", async () => {
    await open({ ...me, email: "  Me@Example.COM " });
    expect(state).toEqual({ status: "checking" });
    expect(fs.listeners.map((l) => l.ref)).toEqual(["allowlist/me@example.com"]);
  });

  it("a person on the list is allowed (not an administrator)", async () => {
    await open();
    await answer({ addedBy: "boss@example.com" });
    expect(state).toEqual({ status: "allowed", email: "me@example.com", isAdmin: false });
    expect(fs.sets).toHaveLength(0);
  });

  it("an entry marked admin makes an administrator", async () => {
    await open();
    await answer({ role: "admin" });
    expect(state).toEqual({ status: "allowed", email: "me@example.com", isAdmin: true });
  });

  it("'not found' in the local cache proves nothing: keeps waiting, writes nothing", async () => {
    await open();
    await answer(null, true);
    expect(state.status).toBe("checking");
    expect(fs.sets).toHaveLength(0);
  });

  it("the owner (first sign-in): creates their own admin entry, then is allowed as admin", async () => {
    await open();
    await answer(null);
    expect(fs.sets).toHaveLength(1);
    expect(fs.sets[0].ref).toBe("allowlist/me@example.com");
    expect(fs.sets[0].data).toMatchObject({ role: "admin", addedBy: "me@example.com" });
    expect(state.status).toBe("checking"); // until the database confirms
    await answer({ role: "admin" });
    expect(state).toEqual({ status: "allowed", email: "me@example.com", isAdmin: true });
  });

  it("anybody else: the rules refuse that write, which means 'denied'", async () => {
    fs.setFails = { code: "permission-denied" };
    await open();
    await answer(null);
    expect(state).toEqual({ status: "denied", email: "me@example.com" });
  });

  it("tries to join only once per person; a second 'not found' is a plain 'denied'", async () => {
    await open();
    await answer(null);
    await answer(null);
    expect(fs.sets).toHaveLength(1);
    expect(state.status).toBe("denied");
  });

  it("removed while using the app: becomes denied", async () => {
    fs.setFails = { code: "permission-denied" };
    await open();
    await answer({});
    expect(state.status).toBe("allowed");
    await answer(null);
    expect(state.status).toBe("denied");
  });

  it("a permission error on the lookup is 'denied'; any other error is an error", async () => {
    await open();
    await act(async () =>
      fs.on("allowlist/me@example.com").onError!({ code: "permission-denied" }),
    );
    expect(state.status).toBe("denied");
    await act(async () =>
      fs.on("allowlist/me@example.com").onError!(
        Object.assign(new Error("offline"), { code: "unavailable" }),
      ),
    );
    expect(state).toEqual({ status: "error", message: "offline" });
  });

  it("a failed write for another reason is an error, not 'denied'", async () => {
    fs.setFails = Object.assign(new Error("quota"), { code: "resource-exhausted" });
    await open();
    await answer(null);
    expect(state).toEqual({ status: "error", message: "quota" });
  });

  it("another person signing in never inherits the previous answer", async () => {
    const m = await open();
    await answer({ role: "admin" });
    expect(state.status).toBe("allowed");
    const other: Person = { uid: "u2", email: "other@example.com", emailVerified: true };
    await m.rerender(<C user={other} />);
    expect(state.status).toBe("checking");
    expect(fs.listeners.map((l) => l.ref)).toEqual(["allowlist/other@example.com"]);
  });

  it("signing out stops listening", async () => {
    const m = await open();
    await answer({});
    await m.rerender(<C user={null} />);
    expect(state).toEqual({ status: "signed-out" });
    expect(fs.listeners).toHaveLength(0);
  });
});
