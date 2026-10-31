// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { DndContext } from "@dnd-kit/core";
import { SortableContext } from "@dnd-kit/sortable";
import { BookmarksCard } from "./BookmarksCard";
import { mount } from "@/test/render";
import type { FeedWidget } from "@/lib/rss";

const widget = (): FeedWidget =>
  ({
    id: "w1",
    kind: "bookmarks",
    url: "",
    column: 0,
    bookmarks: [
      { id: "b1", url: "https://www.example.com/a", title: "Example" },
      { id: "b2", url: "https://other.org", title: "Other" },
    ],
  }) satisfies FeedWidget;

const onUpdate = vi.fn();
const onRemove = vi.fn();
const mounted: Array<() => Promise<void>> = [];

const open = async () => {
  const view = mount(
    <DndContext>
      <SortableContext items={["w1"]}>
        <BookmarksCard widget={widget()} onRemove={onRemove} onUpdate={onUpdate} />
      </SortableContext>
    </DndContext>,
  );
  mounted.push(view.unmount);
  await act(async () => {});
};

const btn = (label: string, n = 0) =>
  document.querySelectorAll(`button[aria-label="${label}"]`)[n] as HTMLElement;
const click = (el: Element) => act(() => void (el as HTMLElement).click());
const input = () =>
  document.querySelector('input[aria-label="Bookmark label"]') as HTMLInputElement;
const type = (value: string) => {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  act(() => {
    setter.call(input(), value);
    input().dispatchEvent(new Event("input", { bubbles: true }));
  });
};
const key = (k: string) =>
  act(() => void input().dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true })));
const dialog = () => document.querySelector('[role="alertdialog"]');
const dialogBtn = (text: string) =>
  Array.from(dialog()!.querySelectorAll("button")).find((b) => b.textContent === text)!;

afterEach(async () => {
  for (const u of mounted.splice(0)) await u();
  document.body.innerHTML = "";
  onUpdate.mockClear();
  onRemove.mockClear();
});

describe("BookmarksCard: rename", () => {
  it("renames with Enter, changing only that bookmark", async () => {
    await open();
    click(btn("Rename bookmark", 1));
    expect(input().value).toBe("Other");
    type("My site");
    key("Enter");
    const form = input().closest("form")!;
    act(() => void form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(onUpdate).toHaveBeenCalledTimes(1);
    const { bookmarks } = onUpdate.mock.calls[0][0];
    expect(bookmarks.map((b: any) => b.title)).toEqual(["Example", "My site"]);
    expect(bookmarks[1].url).toBe("https://other.org");
  });

  it("saves with the check button", async () => {
    await open();
    click(btn("Rename bookmark"));
    type("New");
    click(btn("Save label"));
    expect(onUpdate.mock.calls[0][0].bookmarks[0].title).toBe("New");
  });

  it("cancels with Escape without saving", async () => {
    await open();
    click(btn("Rename bookmark"));
    type("Changed");
    key("Escape");
    expect(onUpdate).not.toHaveBeenCalled();
    expect(input()).toBeNull();
    expect(document.body.textContent).toContain("Example");
  });

  it("cancels with the cross button", async () => {
    await open();
    click(btn("Rename bookmark"));
    type("Changed");
    click(btn("Cancel renaming"));
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it("an empty label falls back to the site name", async () => {
    await open();
    click(btn("Rename bookmark"));
    type("   ");
    click(btn("Save label"));
    expect(onUpdate.mock.calls[0][0].bookmarks[0].title).toBe("example.com");
  });

  it("does not write when the label is unchanged", async () => {
    await open();
    click(btn("Rename bookmark"));
    click(btn("Save label"));
    expect(onUpdate).not.toHaveBeenCalled();
  });
});

describe("BookmarksCard: remove", () => {
  it("asks for confirmation and removes nothing yet", async () => {
    await open();
    click(btn("Remove bookmark"));
    expect(dialog()).not.toBeNull();
    expect(dialog()!.textContent).toContain("Example");
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it("cancel keeps the bookmark", async () => {
    await open();
    click(btn("Remove bookmark"));
    click(dialogBtn("Cancel"));
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it("confirm removes only that bookmark", async () => {
    await open();
    click(btn("Remove bookmark", 1));
    click(dialogBtn("Remove"));
    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onUpdate.mock.calls[0][0].bookmarks.map((b: any) => b.id)).toEqual(["b1"]);
  });
});
