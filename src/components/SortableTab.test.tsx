// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { DndContext } from "@dnd-kit/core";
import { SortableContext } from "@dnd-kit/sortable";
import { SortableTab } from "./SortableTab";
import { mount } from "@/test/render";

const calls = {
  onActivate: vi.fn(),
  onStartEdit: vi.fn(),
  onFinishEdit: vi.fn(),
  onRemove: vi.fn(),
};

const mounted: Array<() => Promise<void>> = [];

const open = async (props: { isEditing?: boolean; canRemove?: boolean } = {}) => {
  const view = mount(
    <DndContext>
      <SortableContext items={["t1"]}>
        <SortableTab
          id="t1"
          name="News"
          active
          isEditing={props.isEditing ?? false}
          canRemove={props.canRemove ?? true}
          {...calls}
        />
      </SortableContext>
    </DndContext>,
  );
  mounted.push(view.unmount);
  await act(async () => {});
};

const tab = () => document.querySelector("button[aria-roledescription]") as HTMLElement;
const menu = () => document.querySelector('[role="menu"]');
const items = () => Array.from(document.querySelectorAll('[role="menuitem"]'));
const item = (text: string) =>
  items().find((el) => el.textContent?.includes(text)) as HTMLElement | undefined;
const fire = (el: Element | Document, type: string, init: MouseEventInit = {}) => {
  const ev = new MouseEvent(type, { bubbles: true, cancelable: true, ...init });
  act(() => void el.dispatchEvent(ev));
  return ev;
};
const rightClick = (init: MouseEventInit = { clientX: 120, clientY: 60 }) =>
  fire(tab(), "contextmenu", init);

afterEach(async () => {
  // Unmount first: an open menu has listeners on the document that must not outlive the test.
  for (const unmount of mounted.splice(0)) await unmount();
  document.body.innerHTML = "";
  Object.values(calls).forEach((f) => f.mockClear());
});

describe("SortableTab: a plain, fixed-width tab", () => {
  it("shows only the name: no pencil and no cross beside it", async () => {
    await open();
    expect(tab().textContent).toBe("News");
    expect(document.querySelector('[aria-label="Rename tab"]')).toBeNull();
    expect(document.querySelector('[aria-label="Remove tab"]')).toBeNull();
    expect(document.querySelectorAll("svg")).toHaveLength(0);
  });

  it("clicking the name activates the tab", async () => {
    await open();
    fire(tab(), "click");
    expect(calls.onActivate).toHaveBeenCalledTimes(1);
  });
});

describe("rename with a double click or F2", () => {
  it("a double click starts renaming", async () => {
    await open();
    fire(tab(), "dblclick");
    expect(calls.onStartEdit).toHaveBeenCalledTimes(1);
  });

  it("F2 on the tab starts renaming", async () => {
    await open();
    act(() => void tab().dispatchEvent(new KeyboardEvent("keydown", { key: "F2", bubbles: true })));
    expect(calls.onStartEdit).toHaveBeenCalledTimes(1);
  });

  it("while the name is being edited, a double click does not restart it", async () => {
    await open({ isEditing: true });
    fire(document.querySelector("input")!, "dblclick");
    expect(calls.onStartEdit).not.toHaveBeenCalled();
  });
});

describe("right-click menu", () => {
  it("opens with Rename and Delete, and the browser menu stays away", async () => {
    await open();
    const ev = rightClick();
    expect(ev.defaultPrevented).toBe(true);
    expect(menu()).not.toBeNull();
    expect(items().map((i) => i.textContent?.trim())).toEqual(["Rename", "Delete tab…"]);
  });

  it("opens where the pointer is", async () => {
    await open();
    rightClick({ clientX: 120, clientY: 60 });
    const m = menu() as HTMLElement;
    expect(m.style.left).toBe("120px");
    expect(m.style.top).toBe("60px");
  });

  it("opened from the keyboard (no pointer position) it appears under the tab", async () => {
    await open();
    rightClick({ clientX: 0, clientY: 0 });
    expect(menu()).not.toBeNull();
  });

  it("Rename starts renaming and closes the menu", async () => {
    await open();
    rightClick();
    fire(item("Rename")!, "click");
    expect(calls.onStartEdit).toHaveBeenCalledTimes(1);
    expect(menu()).toBeNull();
    expect(calls.onRemove).not.toHaveBeenCalled();
  });

  it("Delete asks to remove the tab and closes the menu", async () => {
    await open();
    rightClick();
    fire(item("Delete")!, "click");
    expect(calls.onRemove).toHaveBeenCalledTimes(1);
    expect(menu()).toBeNull();
    expect(calls.onStartEdit).not.toHaveBeenCalled();
  });

  it("the last remaining tab cannot be deleted: only Rename is offered", async () => {
    await open({ canRemove: false });
    rightClick();
    expect(items().map((i) => i.textContent?.trim())).toEqual(["Rename"]);
  });

  it("Escape closes it, changes nothing and gives the focus back to the tab", async () => {
    await open();
    rightClick();
    act(() => void document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
    expect(menu()).toBeNull();
    expect(document.activeElement).toBe(tab());
    expect(calls.onStartEdit).not.toHaveBeenCalled();
    expect(calls.onRemove).not.toHaveBeenCalled();
  });

  it("moving the focus away (e.g. with Tab) closes it", async () => {
    await open();
    rightClick();
    act(() => tab().focus());
    expect(menu()).toBeNull();
  });

  it("a click elsewhere closes it without doing anything", async () => {
    await open();
    rightClick();
    fire(document.body, "pointerdown");
    expect(menu()).toBeNull();
    expect(calls.onStartEdit).not.toHaveBeenCalled();
    expect(calls.onRemove).not.toHaveBeenCalled();
  });

  it("the arrow keys move between the two entries", async () => {
    await open();
    rightClick();
    expect(document.activeElement).toBe(item("Rename"));
    act(
      () =>
        void menu()!.dispatchEvent(
          new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }),
        ),
    );
    expect(document.activeElement).toBe(item("Delete"));
  });

  it("while the name is being edited the normal browser menu is left alone", async () => {
    await open({ isEditing: true });
    const ev = fire(document.querySelector("input")!, "contextmenu", { clientX: 5, clientY: 5 });
    expect(ev.defaultPrevented).toBe(false);
    expect(menu()).toBeNull();
  });
});
