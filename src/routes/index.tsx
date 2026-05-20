import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  closestCorners,
  useSensor,
  useSensors,
  useDroppable,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useDashboard } from "@/lib/useDashboard";
import { FeedCard } from "@/components/FeedCard";
import { AddFeedDialog } from "@/components/AddFeedDialog";
import {
  Columns2,
  Columns3,
  Columns4,
  Plus,
  Sparkles,
  X,
  Pencil,
} from "lucide-react";
import { UserMenu } from "@/components/UserMenu";
import { ConfirmDialog } from "@/components/ConfirmDialog";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Lumen — A modern RSS reader" },
      {
        name: "description",
        content:
          "A modern, fast, customizable RSS reader dashboard. Build your own personal news start page with multiple tabs and columns.",
      },
      { property: "og:title", content: "Lumen — A modern RSS reader" },
      {
        property: "og:description",
        content:
          "Modern customizable RSS dashboard. No CORS hassles — feeds fetched and parsed server-side.",
      },
    ],
  }),
  component: Home,
});

function Home() {
  const dash = useDashboard();
  const [newTabOpen, setNewTabOpen] = useState(false);
  const [newTabName, setNewTabName] = useState("");
  const [editingTab, setEditingTab] = useState<string | null>(null);
  const [tabToDelete, setTabToDelete] = useState<{ id: string; name: string } | null>(null);

  const cols = dash.activeTab.columns;
  const gridClass =
    cols === 2
      ? "md:grid-cols-2"
      : cols === 4
      ? "md:grid-cols-2 lg:grid-cols-4"
      : "md:grid-cols-2 lg:grid-cols-3";

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  function handleWidgetDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    if (activeId === overId) return;

    // Dropped on a column droppable (empty area)
    if (overId.startsWith("col:")) {
      const col = Number(overId.slice(4));
      dash.reorderWidgets(activeId, col, -1);
      return;
    }
    // Dropped on another widget
    const overWidget = dash.activeTab.widgets.find((w) => w.id === overId);
    if (!overWidget) return;
    const colItems = dash.activeTab.widgets.filter(
      (w) => w.column === overWidget.column && w.id !== activeId,
    );
    const overIdx = colItems.findIndex((w) => w.id === overId);
    dash.reorderWidgets(activeId, overWidget.column, overIdx);
  }

  function handleTabDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    dash.reorderTabs(String(active.id), String(over.id));
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-30 glass border-b border-border">
        <div className="flex items-center gap-3 px-4 md:px-6 py-3">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-lg flex items-center justify-center bg-[var(--gradient-primary)] shadow-[var(--shadow-glow)]">
              <Sparkles className="h-5 w-5 text-white drop-shadow" />
            </div>
            <div>
              <h1 className="font-display text-lg font-bold leading-none text-gradient">
                Lumen
              </h1>
              <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                RSS Dashboard
              </p>
            </div>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <div className="hidden md:flex items-center gap-1 bg-surface/60 rounded-md p-0.5 border border-border">
              {[2, 3, 4].map((n) => {
                const Icon = n === 2 ? Columns2 : n === 3 ? Columns3 : Columns4;
                return (
                  <button
                    key={n}
                    onClick={() => dash.setColumns(n)}
                    className={`p-1.5 rounded ${
                      cols === n
                        ? "bg-primary text-primary-foreground"
                        : "hover:bg-secondary text-muted-foreground"
                    }`}
                    aria-label={`${n} columns`}
                  >
                    <Icon className="h-4 w-4" />
                  </button>
                );
              })}
            </div>
            <AddFeedDialog onAdd={dash.addWidget} />
          </div>
        </div>

        {/* Tabs */}
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleTabDragEnd}
        >
          <SortableContext
            items={dash.state.tabs.map((t) => t.id)}
            strategy={horizontalListSortingStrategy}
          >
            <div className="flex items-end gap-1 px-4 md:px-6 overflow-x-auto scroll-thin">
              {dash.state.tabs.map((t) => (
                <SortableTab
                  key={t.id}
                  id={t.id}
                  name={t.name}
                  active={t.id === dash.state.activeTabId}
                  isEditing={editingTab === t.id}
                  canRemove={dash.state.tabs.length > 1}
                  onActivate={() => dash.setActiveTab(t.id)}
                  onStartEdit={() => setEditingTab(t.id)}
                  onFinishEdit={(name) => {
                    if (name) dash.renameTab(t.id, name);
                    setEditingTab(null);
                  }}
                  onRemove={() => dash.removeTab(t.id)}
                />
              ))}
              {newTabOpen ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (newTabName.trim()) {
                      dash.addTab(newTabName.trim());
                      setNewTabName("");
                      setNewTabOpen(false);
                    }
                  }}
                  className="px-2 pb-2"
                >
                  <input
                    autoFocus
                    value={newTabName}
                    onChange={(e) => setNewTabName(e.target.value)}
                    onBlur={() => setNewTabOpen(false)}
                    placeholder="Tab name"
                    className="bg-input border border-border rounded px-2 py-1 text-sm w-28 outline-none focus:border-primary"
                  />
                </form>
              ) : (
                <button
                  onClick={() => setNewTabOpen(true)}
                  className="p-2 mb-0.5 text-muted-foreground hover:text-foreground"
                  aria-label="New tab"
                >
                  <Plus className="h-4 w-4" />
                </button>
              )}
            </div>
          </SortableContext>
        </DndContext>
      </header>

      <main className="flex-1 p-4 md:p-6">
        {dash.activeTab.widgets.length === 0 ? (
          <EmptyState onAdd={dash.addWidget} />
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragEnd={handleWidgetDragEnd}
          >
            <div className={`grid grid-cols-1 gap-4 ${gridClass}`}>
              {Array.from({ length: cols }).map((_, col) => {
                const items = dash.widgetsByColumn(col);
                return (
                  <Column key={col} col={col} ids={items.map((w) => w.id)}>
                    {items.map((w) => (
                      <FeedCard
                        key={w.id}
                        widget={w}
                        onRemove={() => dash.removeWidget(w.id)}
                        onUpdate={(patch) => dash.updateWidget(w.id, patch)}
                      />
                    ))}
                  </Column>
                );
              })}
            </div>
          </DndContext>
        )}
      </main>

      <footer className="px-4 md:px-6 py-4 text-center text-xs text-muted-foreground border-t border-border">
        Built with care · Feeds fetched server-side · Auto-refreshes every 10 min.
      </footer>
    </div>
  );
}

function Column({
  col,
  ids,
  children,
}: {
  col: number;
  ids: string[];
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `col:${col}` });
  return (
    <SortableContext items={ids} strategy={verticalListSortingStrategy}>
      <div
        ref={setNodeRef}
        className={`flex flex-col gap-4 min-h-32 rounded-xl transition ${
          isOver ? "bg-primary/5 outline outline-2 outline-primary/30" : ""
        }`}
      >
        {children}
      </div>
    </SortableContext>
  );
}

function SortableTab({
  id,
  name,
  active,
  isEditing,
  canRemove,
  onActivate,
  onStartEdit,
  onFinishEdit,
  onRemove,
}: {
  id: string;
  name: string;
  active: boolean;
  isEditing: boolean;
  canRemove: boolean;
  onActivate: () => void;
  onStartEdit: () => void;
  onFinishEdit: (name: string | null) => void;
  onRemove: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group flex items-center gap-1 px-3 pt-2 pb-2.5 -mb-px text-sm border-b-2 transition ${
        active
          ? "border-primary text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground"
      }`}
    >
      {isEditing ? (
        <input
          autoFocus
          defaultValue={name}
          onBlur={(e) => onFinishEdit(e.target.value || name)}
          onKeyDown={(e) => {
            if (e.key === "Enter")
              onFinishEdit((e.target as HTMLInputElement).value || name);
            if (e.key === "Escape") onFinishEdit(null);
          }}
          className="bg-transparent outline-none border-b border-primary w-24"
        />
      ) : (
        <button
          onClick={onActivate}
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing"
        >
          {name}
        </button>
      )}
      {active && !isEditing && (
        <>
          <button
            onClick={onStartEdit}
            className="opacity-0 group-hover:opacity-100 p-0.5 hover:text-foreground"
            aria-label="Rename tab"
          >
            <Pencil className="h-3 w-3" />
          </button>
          {canRemove && (
            <button
              onClick={onRemove}
              className="opacity-0 group-hover:opacity-100 p-0.5 hover:text-destructive"
              aria-label="Remove tab"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </>
      )}
    </div>
  );
}

function EmptyState({
  onAdd,
}: {
  onAdd: (url: string, title?: string) => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-24">
      <div className="h-16 w-16 rounded-2xl flex items-center justify-center bg-[var(--gradient-primary)] shadow-[var(--shadow-glow)] mb-5">
        <Sparkles className="h-7 w-7 text-primary-foreground" />
      </div>
      <h2 className="font-display text-2xl font-bold mb-2">
        Your dashboard is empty
      </h2>
      <p className="text-muted-foreground max-w-md mb-6">
        Add your first RSS or Atom feed to start tracking what matters. We fetch
        everything server-side, so CORS never gets in the way.
      </p>
      <AddFeedDialog onAdd={onAdd} />
    </div>
  );
}
