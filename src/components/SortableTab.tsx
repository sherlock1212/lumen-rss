import { useRef, useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { TabContextMenu, type TabMenuCloseReason } from "@/components/TabContextMenu";

interface Props {
  id: string;
  name: string;
  active: boolean;
  isEditing: boolean;
  canRemove: boolean;
  onActivate: () => void;
  onStartEdit: () => void;
  onFinishEdit: (name: string | null) => void;
  onRemove: () => void;
}

/**
 * One tab of the bar. It shows only its name, so every tab keeps the same width whether
 * it is active or not. Rename: double click (or F2). Rename / delete: right click
 * (or the keyboard "menu" key) opens a small menu.
 */
export function SortableTab({
  id,
  name,
  active,
  isEditing,
  canRemove,
  onActivate,
  onStartEdit,
  onFinishEdit,
  onRemove,
}: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const nameButton = useRef<HTMLButtonElement | null>(null);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  function closeMenu(reason: TabMenuCloseReason) {
    setMenu(null);
    // Back to the tab only when the menu was dismissed: after "Rename" the name field has the focus.
    if (reason === "escape") nameButton.current?.focus();
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group flex items-center px-3 pt-2 pb-2.5 -mb-px text-sm border-b-2 transition ${
        active
          ? "border-primary text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground"
      }`}
      onDoubleClick={() => {
        if (!isEditing) onStartEdit();
      }}
      onContextMenu={(e) => {
        if (isEditing) return; // keep the normal menu (copy / paste) inside the name field
        e.preventDefault();
        // Opened from the keyboard the browser reports no pointer position.
        const fromKeyboard = e.clientX === 0 && e.clientY === 0;
        const box = e.currentTarget.getBoundingClientRect();
        setMenu(fromKeyboard ? { x: box.left, y: box.bottom } : { x: e.clientX, y: e.clientY });
      }}
    >
      {isEditing ? (
        <input
          autoFocus
          defaultValue={name}
          onBlur={(e) => onFinishEdit(e.target.value || name)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onFinishEdit((e.target as HTMLInputElement).value || name);
            if (e.key === "Escape") onFinishEdit(null);
          }}
          className="bg-transparent outline-none border-b border-primary w-24"
        />
      ) : (
        <button
          ref={(el) => {
            nameButton.current = el;
          }}
          onClick={onActivate}
          {...attributes}
          {...listeners}
          onKeyDown={(e) => {
            if (e.key === "F2") {
              e.preventDefault();
              onStartEdit();
            }
          }}
          title="Double-click to rename · right-click for more"
          className="cursor-grab active:cursor-grabbing"
        >
          {name}
        </button>
      )}
      {menu && (
        <TabContextMenu
          x={menu.x}
          y={menu.y}
          canRemove={canRemove}
          onRename={onStartEdit}
          onRemove={onRemove}
          onClose={closeMenu}
        />
      )}
    </div>
  );
}
