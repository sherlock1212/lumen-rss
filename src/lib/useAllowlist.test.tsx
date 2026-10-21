// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { useAllowlist } from "./useAllowlist";
import { fs } from "@/test/fakeFirestore";
import { mount } from "@/test/render";

vi.mock("firebase/firestore", () => import("@/test/fakeFirestore"));
vi.mock("./firebase", () => ({ db: {} }));

let l: ReturnType<typeof useAllowlist>;
const C = () => ((l = useAllowlist()), null);
const date = (iso: string) => ({ toDate: () => new Date(iso) });
const push = (docs: { id: string; data: unknown }[]) =>
  act(async () =>
    fs.on("allowlist").cb({ docs: docs.map((d) => ({ id: d.id, data: () => d.data })) }),
  );

beforeEach(async () => {
  fs.reset();
  mount(<C />);
  await act(async () => {});
});
afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("useAllowlist", () => {
  it("is 'not loaded' until the first answer", () => {
    expect(l.people).toBeNull();
  });

  it("lists everyone alphabetically, with date and administrator flag", async () => {
    await push([
      { id: "zed@example.com", data: { addedAt: date("2026-01-02T00:00:00Z") } },
      { id: "boss@example.com", data: { role: "admin" } },
      { id: "amy@example.com", data: undefined },
    ]);
    expect(l.people!.map((p) => p.email)).toEqual([
      "amy@example.com",
      "boss@example.com",
      "zed@example.com",
    ]);
    expect(l.people!.map((p) => p.isAdmin)).toEqual([false, true, false]);
    expect(l.people![2].addedAt).toEqual(new Date("2026-01-02T00:00:00Z"));
    expect(l.people![0].addedAt).toBeNull();
  });

  it("shows the reason when the list cannot be read", async () => {
    await act(async () => fs.on("allowlist").onError!(new Error("Missing permissions")));
    expect(l.error).toBe("Missing permissions");
  });

  it("add: saves a lowercase, trimmed address (the id), who added it and when", async () => {
    const out = await act(async () => l.add("  New.Person@Example.COM ", "boss@example.com"));
    expect(out).toBe("new.person@example.com");
    expect(fs.sets).toEqual([
      {
        ref: "allowlist/new.person@example.com",
        data: { addedAt: "SERVER_TIMESTAMP", addedBy: "boss@example.com" },
        options: undefined,
      },
    ]);
  });

  it.each(["", "nope", "a@b", "a b@example.com", "a/b@example.com", "@example.com"])(
    "add: refuses %j and saves nothing",
    async (bad) => {
      await expect(act(async () => l.add(bad, "boss@example.com"))).rejects.toThrow(/email/i);
      expect(fs.sets).toHaveLength(0);
    },
  );

  it("add: never overwrites the administrator's own entry", async () => {
    await expect(act(async () => l.add("Boss@Example.com", "boss@example.com"))).rejects.toThrow(
      /you/i,
    );
    expect(fs.sets).toHaveLength(0);
  });

  it("remove: deletes that address's document", async () => {
    await act(async () => l.remove("amy@example.com"));
    expect(fs.deleted).toEqual(["allowlist/amy@example.com"]);
  });
});
