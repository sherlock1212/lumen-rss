import { createFileRoute } from "@tanstack/react-router";
import React, { useState, useEffect } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  closestCorners,
  useSensor,
  useSensors,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
  type DragOverEvent,
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
import { AddItemDialog } from "@/components/AddItemDialog";
import { BookmarksCard } from "@/components/BookmarksCard";
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
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import { StyleMenu } from "@/components/StyleMenu";
import { DataDialog } from "@/components/DataDialog";


export const Route = createFileRoute("/")({
  ssr: false,
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

function DigitalClock() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    // Align to the next full second so the display doesn't lag
    const timeout = setTimeout(() => {
      setNow(new Date());
      interval = setInterval(() => setNow(new Date()), 1000);
    }, 1000 - (Date.now() % 1000));
    return () => {
      clearTimeout(timeout);
      clearInterval(interval);
    };
  }, []);

  const hh = now.getHours().toString().padStart(2, "0");
  const mm = now.getMinutes().toString().padStart(2, "0");
  const ss = now.getSeconds().toString().padStart(2, "0");
  const dateStr = now.toLocaleDateString(undefined, {
    weekday: "short",
    day: "2-digit",
    month: "short",
  });

  return (
    <div className="hidden md:flex flex-col items-end leading-none select-none gap-1"
         aria-label="Current time">
      {/* Time row */}
      <span
        className="font-mono text-xl font-bold"
        style={{
          color: "var(--color-foreground)",
          textShadow: "0 0 10px var(--color-primary), 0 0 24px color-mix(in oklab, var(--color-primary) 50%, transparent)",
          letterSpacing: "0.1em",
        }}
      >
        {hh}
        <span
          className="animate-pulse"
          style={{ color: "var(--color-primary)", opacity: 0.8 }}
        >:</span>
        {mm}
        <span
          className="text-sm font-medium ml-0.5"
          style={{ color: "var(--color-primary)", opacity: 0.65 }}
        >{ss}</span>
      </span>
      {/* Date row */}
      <span
        className="font-mono text-xs font-semibold uppercase tracking-[0.15em]"
        style={{
          color: "var(--color-foreground)",
          opacity: 0.7,
          textShadow: "0 0 6px color-mix(in oklab, var(--color-primary) 35%, transparent)",
        }}
      >
        {dateStr}
      </span>
    </div>
  );
}

function Home() {
  const dash = useDashboard();
  const [newTabOpen, setNewTabOpen] = useState(false);
  const [newTabName, setNewTabName] = useState("");
  const [editingTab, setEditingTab] = useState<string | null>(null);
  const [tabToDelete, setTabToDelete] = useState<{ id: string; name: string } | null>(null);
  const [draggingId, setDraggingId]   = useState<string | null>(null);
  const [overId, setOverId]           = useState<string | null>(null);

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

  function handleWidgetDragStart(e: DragStartEvent) {
    setDraggingId(String(e.active.id));
    setOverId(null);
  }

  function handleWidgetDragOver(e: DragOverEvent) {
    setOverId(e.over ? String(e.over.id) : null);
  }

  function handleWidgetDragEnd(e: DragEndEvent) {
    setDraggingId(null);
    setOverId(null);
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
      <header className="app-header sticky top-0 z-30">
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
            <AddItemDialog onAddFeed={dash.addWidget} onAddBookmarks={dash.addBookmarksTile} />
            <DataDialog state={dash.state} onImport={dash.importTabs} />
            <div className="hidden md:flex items-center gap-1 bg-surface/60 rounded-md p-0.5 border border-border">
              {[2, 3, 4].map((n) => {
                const Icon = n === 2 ? Columns2 : n === 3 ? Columns3 : Columns4;
                return (
                  <button
                    key={n}
                    onClick={() => dash.setColumns(n)}
                    className={`p-1.5 rounded ${
                      cols === n
                        ? "bg-primary/20 text-primary border border-primary/40"
                        : "hover:bg-secondary text-muted-foreground"
                    }`}
                    aria-label={`${n} columns`}
                  >
                    <Icon className="h-4 w-4" />
                  </button>
                );
              })}
            </div>
            <StyleMenu
              tabStyle={dash.activeTab.defaultStyle}
              globalStyle={dash.state.globalDefaultStyle ?? "full"}
              highlightNew={dash.state.highlightNew ?? true}
              onSetTabStyle={dash.setTabStyle}
              onSetGlobalStyle={dash.setGlobalStyle}
              onToggleHighlightNew={dash.setHighlightNew}
            />
            <ThemeSwitcher />
            <UserMenu />
            <DigitalClock />
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
                  onRemove={() => setTabToDelete({ id: t.id, name: t.name })}
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
          <EmptyState onAddFeed={dash.addWidget} onAddBookmarks={dash.addBookmarksTile} />
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleWidgetDragStart}
            onDragOver={handleWidgetDragOver}
            onDragEnd={handleWidgetDragEnd}
          >
            <div className={`grid grid-cols-1 gap-4 ${gridClass}`}>
              {Array.from({ length: cols }).map((_, col) => {
                const items = dash.widgetsByColumn(col);
                return (
                  <Column key={col} col={col} ids={items.map((w) => w.id)}>
                    {items.map((w) => (
                      <TileWithIndicator
                        key={w.id}
                        isOver={overId === w.id && draggingId !== w.id}
                      >
                        {w.kind === "bookmarks" ? (
                          <BookmarksCard
                            widget={w}
                            onRemove={() => dash.removeWidget(w.id)}
                            onUpdate={(patch) => dash.updateWidget(w.id, patch)}
                          />
                        ) : (
                          <FeedCard
                            widget={w}
                            effectiveStyle={dash.resolveStyle(w)}
                            highlightNew={dash.state.highlightNew ?? true}
                            onRemove={() => dash.removeWidget(w.id)}
                            onUpdate={(patch) => dash.updateWidget(w.id, patch)}
                          />
                        )}
                      </TileWithIndicator>
                    ))}
                  </Column>
                );
              })}
            </div>
            <DragOverlay dropAnimation={null}>
              {draggingId ? (
                <DragGhost widget={dash.activeTab.widgets.find((w) => w.id === draggingId)!} />
              ) : null}
            </DragOverlay>
          </DndContext>
        )}
      </main>

      <footer className="px-4 md:px-6 py-4 text-center text-xs text-muted-foreground border-t border-border">
        Built with care · Feeds fetched server-side · Auto-refreshes every 10 min.
      </footer>

      <ConfirmDialog
        open={!!tabToDelete}
        onOpenChange={(o) => !o && setTabToDelete(null)}
        title="Delete this tab?"
        description={
          tabToDelete
            ? `"${tabToDelete.name}" and all its feeds will be permanently removed.`
            : ""
        }
        onConfirm={() => {
          if (tabToDelete) dash.removeTab(tabToDelete.id);
          setTabToDelete(null);
        }}
      />
    </div>
  );
}


function TileWithIndicator({
  children,
  isOver,
}: {
  children: React.ReactNode;
  isOver: boolean;
}) {
  return (
    <div className="relative">
      {isOver && (
        <div className="absolute -top-2.5 left-4 right-4 z-10 h-1 pointer-events-none">
          <div className="absolute inset-0 rounded-full bg-primary shadow-[0_0_10px_3px_var(--color-primary)]" />
          <div className="absolute -left-1 -top-1.5 h-4 w-4 rounded-full border-2 border-primary bg-background shadow-[0_0_6px_2px_var(--color-primary)]" />
          <div className="absolute -right-1 -top-1.5 h-4 w-4 rounded-full border-2 border-primary bg-background shadow-[0_0_6px_2px_var(--color-primary)]" />
        </div>
      )}
      {children}
    </div>
  );
}

function DragGhost({ widget }: { widget: import("@/lib/rss").FeedWidget }) {
  if (!widget) return null;
  const label = widget.customTitle ?? widget.url ?? "Favourites";
  const isBookmarks = widget.kind === "bookmarks";
  return (
    <div
      className="glass rounded-xl shadow-2xl ring-2 ring-primary/50 pointer-events-none rotate-1 scale-[1.02]"
      style={{ opacity: 0.92 }}
    >
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-surface/50">
        <div className="h-7 w-7 rounded-md flex items-center justify-center bg-[var(--gradient-primary)] shadow-[var(--shadow-glow)] shrink-0 opacity-80">
          {isBookmarks
            ? <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 text-white fill-current" viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
            : <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 11a9 9 0 0 1 9 9"/><path d="M4 4a16 16 0 0 1 16 16"/><circle cx="5" cy="19" r="1"/></svg>
          }
        </div>
        <span className="font-display font-semibold text-sm truncate flex-1 text-foreground/80">
          {label}
        </span>
      </div>
      <div className="px-4 py-3 space-y-2">
        {[0.75, 0.55, 0.65].map((w, i) => (
          <div key={i} className="h-2.5 rounded bg-secondary/50 animate-pulse" style={{ width: `${w * 100}%` }} />
        ))}
      </div>
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
        className={`flex flex-col gap-4 min-h-32 rounded-xl transition-colors ${
          isOver ? "bg-primary/5 outline outline-2 outline-primary/20" : ""
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
  onAddFeed,
  onAddBookmarks,
}: {
  onAddFeed: (url: string, title?: string) => void;
  onAddBookmarks: () => void;
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
      <AddItemDialog onAddFeed={onAddFeed} onAddBookmarks={onAddBookmarks} />
    </div>
  );
}
