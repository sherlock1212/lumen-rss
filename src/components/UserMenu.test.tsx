// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import type { ReactNode } from "react";
import { UserMenu } from "./UserMenu";
import { AccessContext } from "@/lib/useAccess";
import { auth } from "@/test/fakeAuth";
import { mount } from "@/test/render";

vi.mock("firebase/firestore", () => import("@/test/fakeFirestore"));
vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("@/lib/useAuth", () => import("@/test/fakeAuth"));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, ...rest }: { to: string; children: ReactNode }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}));

const open = async (isAdmin: boolean) => {
  mount(
    <AccessContext.Provider value={{ email: "me@example.com", isAdmin }}>
      <UserMenu />
    </AccessContext.Provider>,
  );
  await act(async () => {});
  await act(async () =>
    (document.querySelector('[aria-label="Account menu"]') as HTMLElement).click(),
  );
};
const menu = () => document.body.textContent ?? "";

beforeEach(() => {
  auth.user = { uid: "u1", email: "me@example.com", displayName: "Me Myself", photoURL: null };
  auth.loading = false;
  auth.signOut = vi.fn(async () => {});
});
afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("UserMenu (the round profile picture)", () => {
  it("opens a menu with the name, the address and Sign out", async () => {
    await open(false);
    expect(menu()).toContain("Me Myself");
    expect(menu()).toContain("me@example.com");
    expect(menu()).toMatch(/sign out/i);
  });

  it("the administrator also gets the way to the access page", async () => {
    await open(true);
    const link = [...document.querySelectorAll("a")].find((a) =>
      /manage access/i.test(a.textContent ?? ""),
    );
    expect(link?.getAttribute("href")).toBe("/admin");
  });

  it("an ordinary person does not", async () => {
    await open(false);
    expect(menu()).not.toMatch(/manage access/i);
    expect(document.querySelector('a[href="/admin"]')).toBeNull();
  });

  it("Sign out signs out", async () => {
    await open(false);
    const b = [...document.querySelectorAll("button")].find((x) =>
      /sign out/i.test(x.textContent ?? ""),
    )!;
    await act(async () => b.click());
    expect(auth.signOut).toHaveBeenCalledTimes(1);
  });

  it("there is no separate sign-in/sign-out button outside the menu", async () => {
    await open(false);
    document.body.innerHTML = "";
    mount(
      <AccessContext.Provider value={{ email: "me@example.com", isAdmin: false }}>
        <UserMenu />
      </AccessContext.Provider>,
    );
    await act(async () => {});
    expect(
      [...document.querySelectorAll("button")].map((b) => b.getAttribute("aria-label")),
    ).toEqual(["Account menu"]);
  });
});
