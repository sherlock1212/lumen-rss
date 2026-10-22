import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { Pencil, Trash2 } from "lucide-react";

export type TabMenuCloseReason = "escape" | "outside" | "action";

interface Props {
  /** Where the menu opens (window coordinates); it is moved if it would leave the window. */
  x: number;
  y: number;
  canRemove: boolean;
  onRename: () => void;
  onRemove: () => void;
  /** The menu must disappear: always called, also after an action. */
  onClose: (reason: TabMenuCloseReason) => void;
}

const ITEM =
  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-left outline-none transition hover:bg-secondary focus:bg-secondary";

/**
 * Small menu opened with a right click on a tab: Rename and Delete.
 * Drawn on `document.body` so the (scrolling) tab bar cannot clip it.
 */
export function TabContextMenu({ x, y, canRemove, onRename, onRemove, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({
      left: Math.max(4, Math.min(x, window.innerWidth - r.width - 4)),
      top: Math.max(4, Math.min(y, window.innerHeight - r.height - 4)),
    });
  }, [x, y]);

  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, []);

  useEffect(() => {
    const outside = (e: Event) => {
      if (!ref.current?.contains(e.target as Node)) onClose("outside");
    };
    const escape = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      onClose("escape");
    };
    const away = () => onClose("outside");
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("keydown", escape, true);
    window.addEventListener("blur", away);
    window.addEventListener("resize", away);
    window.addEventListener("scroll", away, true);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("keydown", escape, true);
      window.removeEventListener("blur", away);
      window.removeEventListener("resize", away);
      window.removeEventListener("scroll", away, true);
    };
  }, [onClose]);

  function moveFocus(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const items = Array.from(ref.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    if (items.length === 0) return;
    const i = items.indexOf(document.activeElement as HTMLElement);
    const next = e.key === "ArrowDown" ? i + 1 : i - 1;
    items[(next + items.length) % items.length].focus();
  }

  return createPortal(
    <div
      ref={ref}
      role="menu"
      aria-label="Tab menu"
      style={{ position: "fixed", left: pos.left, top: pos.top }}
      className="z-50 min-w-44 rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
      onKeyDown={moveFocus}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) onClose("outside");
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <button
        type="button"
        role="menuitem"
        className={ITEM}
        onClick={() => {
          onRename();
          onClose("action");
        }}
      >
        <Pencil className="h-4 w-4" /> Rename
      </button>
      {canRemove && (
        <button
          type="button"
          role="menuitem"
          className={`${ITEM} text-destructive`}
          onClick={() => {
            onRemove();
            onClose("action");
          }}
        >
          <Trash2 className="h-4 w-4" /> Delete tab…
        </button>
      )}
    </div>,
    document.body,
  );
}
