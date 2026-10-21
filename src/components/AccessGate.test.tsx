// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { AccessGate } from "./AccessGate";
import { useAccessInfo } from "@/lib/useAccess";
import { fs, snap } from "@/test/fakeFirestore";
import { auth } from "@/test/fakeAuth";
import { mount } from "@/test/render";

const rejectAccount = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("firebase/firestore", () => import("@/test/fakeFirestore"));
vi.mock("@/lib/firebase", () => ({ db: {}, rejectAccount }));
vi.mock("@/lib/useAuth", () => import("@/test/fakeAuth"));

const ME = { uid: "u1", email: "me@example.com", emailVerified: true };
const text = () => document.body.textContent ?? "";
const app = () => document.querySelector('[data-testid="app"]');
const button = (label: RegExp) =>
  [...document.querySelectorAll("button")].find((b) => label.test(b.textContent ?? ""))!;
const answer = (data: unknown, fromCache = false) =>
  act(async () => fs.on("allowlist/me@example.com").cb(snap(data, fromCache)));

function Inside() {
  const info = useAccessInfo();
  return (
    <div data-testid="app">
      dashboard for {info?.email} admin={String(info?.isAdmin)}
    </div>
  );
}
const open = async () => {
  mount(
    <AccessGate>
      <Inside />
    </AccessGate>,
  );
  await act(async () => {});
};

beforeEach(() => {
  fs.reset();
  rejectAccount.mockClear();
  auth.user = { ...ME };
  auth.loading = false;
  auth.signInWithGoogle = vi.fn(async () => ({}));
  auth.signOut = vi.fn(async () => {});
});
afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("AccessGate", () => {
  it("while the login state is unknown: a loading screen, no dashboard", async () => {
    auth.loading = true;
    auth.user = null;
    await open();
    expect(text()).toContain("Loading");
    expect(app()).toBeNull();
  });

  it("signed out: ONLY the Google button, no dashboard, nothing asked of the database", async () => {
    auth.user = null;
    await open();
    expect(app()).toBeNull();
    expect(button(/continue with google/i)).toBeTruthy();
    expect(document.querySelectorAll("button")).toHaveLength(1);
    expect(fs.listeners).toHaveLength(0);
  });

  it("the Google button starts the sign-in", async () => {
    auth.user = null;
    await open();
    await act(async () => button(/continue with google/i).click());
    expect(auth.signInWithGoogle).toHaveBeenCalledTimes(1);
  });

  it("closing the Google window is not reported as an error; a real failure is", async () => {
    auth.user = null;
    await open();
    auth.signInWithGoogle = vi.fn(async () => {
      throw Object.assign(new Error("closed"), { code: "auth/popup-closed-by-user" });
    });
    await act(async () => button(/continue with google/i).click());
    expect(document.querySelector('[role="alert"]')).toBeNull();

    auth.signInWithGoogle = vi.fn(async () => {
      throw Object.assign(new Error("Network request failed"), {
        code: "auth/network-request-failed",
      });
    });
    await act(async () => button(/continue with google/i).click());
    expect(document.querySelector('[role="alert"]')!.textContent).toContain(
      "Network request failed",
    );
  });

  it("signed in, waiting for the list: 'checking', no dashboard, can sign out", async () => {
    await open();
    expect(text()).toContain("Checking your access");
    expect(app()).toBeNull();
    await act(async () => button(/sign out/i).click());
    expect(auth.signOut).toHaveBeenCalledTimes(1);
  });

  it("a person on the list sees the dashboard, and the menus learn who they are", async () => {
    await open();
    await answer({ addedBy: "boss@example.com" });
    expect(app()!.textContent).toBe("dashboard for me@example.com admin=false");
    expect(rejectAccount).not.toHaveBeenCalled();
  });

  it("the administrator is told so", async () => {
    await open();
    await answer({ role: "admin" });
    expect(app()!.textContent).toBe("dashboard for me@example.com admin=true");
  });

  it("a person who is not allowed: back to the login screen with a clear message, account cleaned up", async () => {
    fs.setFails = { code: "permission-denied" };
    await open();
    await answer(null);
    await act(async () => {});
    expect(app()).toBeNull();
    expect(document.querySelector('[role="alert"]')!.textContent).toContain("Access not allowed");
    expect(text()).toContain("me@example.com");
    expect(rejectAccount).toHaveBeenCalledTimes(1);
    expect(rejectAccount).toHaveBeenCalledWith(auth.user);
    expect(button(/continue with google/i)).toBeTruthy();
  });

  it("an unverified address is refused without asking the database", async () => {
    auth.user = { ...ME, emailVerified: false };
    await open();
    expect(app()).toBeNull();
    expect(fs.listeners).toHaveLength(0);
    expect(rejectAccount).toHaveBeenCalledTimes(1);
  });

  it("signing in again after a refusal clears the old message", async () => {
    fs.setFails = { code: "permission-denied" };
    await open();
    await answer(null);
    auth.user = null; // rejectAccount signed them out
    await act(async () => {});
    await act(async () => button(/continue with google/i).click());
    expect(document.querySelector('[role="alert"]')).toBeNull();
  });

  it("an unexpected error is shown, with a way out", async () => {
    await open();
    await act(async () =>
      fs.on("allowlist/me@example.com").onError!(
        Object.assign(new Error("offline"), { code: "unavailable" }),
      ),
    );
    expect(app()).toBeNull();
    expect(document.querySelector('[role="alert"]')!.textContent).toContain("offline");
    await act(async () => button(/sign out/i).click());
    expect(auth.signOut).toHaveBeenCalled();
  });
});
