import { createFileRoute } from "@tanstack/react-router";
import React, { useState, useEffect, useRef } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useDashboard } from "@/lib/useDashboard";
import { computeDropSlot, measureColumns, sameSlot, type DropSlot } from "@/lib/dropSlot";
import { FeedCard } from "@/components/FeedCard";
import { AddItemDialog } from "@/components/AddItemDialog";
import { BookmarksCard } from "@/components/BookmarksCard";
import {
  Plus,
  Sparkles,
  X,
  Pencil,
} from "lucide-react";
import { UserMenu } from "@/components/UserMenu";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { LayoutMenu } from "@/components/LayoutMenu";
import { DataDialog } from "@/components/DataDialog";
import { SyncBanner, SyncIndicator } from "@/components/SyncStatus";
import { ExportReminderBanner } from "@/components/ExportReminder";
import { useExportReminder } from "@/lib/useExportReminder";


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
  const exportReminder = useExportReminder();
  // A backup is meaningful only when what is on screen is what is really stored.
  const stateIsTrustworthy = dash.sync.status === "synced" || dash.sync.status === "saving";
  const [newTabOpen, setNewTabOpen] = useState(false);
  const [newTabName, setNewTabName] = useState("");
  const [editingTab, setEditingTab] = useState<string | null>(null);
  const [tabToDelete, setTabToDelete] = useState<{ id: string; name: string } | null>(null);
  const [draggingId, setDraggingId]   = useState<string | null>(null);
  // Where the dragged tile would land right now; drives the marker and the final drop.
  const [slot, setSlot]               = useState<DropSlot | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const pointerRef = useRef<{ x: number; y: number } | null>(null);
  const frameRef = useRef(0);
  const stopTrackingRef = useRef<(() => void) | null>(null);

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

  /** Slot for the pointer's current position, measured from what is on screen right now. */
  function currentSlot(id: string): DropSlot | null {
    const p = pointerRef.current;
    if (!p || !gridRef.current) return null;
    return computeDropSlot(p, measureColumns(gridRef.current), id);
  }

  // While a tile is dragged, follow the pointer (and page scrolling, which moves the
  // tiles under a still pointer) and keep `slot` up to date, at most once per frame.
  function startTracking(id: string, start: { x: number; y: number } | null) {
    pointerRef.current = start;
    const update = () => {
      frameRef.current = 0;
      const next = currentSlot(id);
      setSlot((prev) => (sameSlot(prev, next) ? prev : next));
    };
    const schedule = () => {
      if (!frameRef.current) frameRef.current = requestAnimationFrame(update);
    };
    const onMove = (ev: PointerEvent) => {
      pointerRef.current = { x: ev.clientX, y: ev.clientY };
      schedule();
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("scroll", schedule, { capture: true, passive: true });
    stopTrackingRef.current = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("scroll", schedule, { capture: true });
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      frameRef.current = 0;
    };
    schedule();
  }

  function stopTracking() {
    stopTrackingRef.current?.();
    stopTrackingRef.current = null;
  }

  useEffect(() => stopTracking, []);

  function handleWidgetDragStart(e: DragStartEvent) {
    const id = String(e.active.id);
    setDraggingId(id);
    const ev = e.activatorEvent as Partial<PointerEvent> | undefined;
    startTracking(
      id,
      typeof ev?.clientX === "number" && typeof ev?.clientY === "number"
        ? { x: ev.clientX, y: ev.clientY }
        : null,
    );
  }

  function handleWidgetDragEnd(e: DragEndEvent) {
    const id = String(e.active.id);
    // Measure again at the moment of the drop rather than trusting the last marker.
    const target = currentSlot(id);
    const p = pointerRef.current;
    stopTracking();
    setDraggingId(null);
    setSlot(null);
    // Released outside the window: treat it as a cancel.
    const outside = !p || p.x < 0 || p.y < 0 || p.x > window.innerWidth || p.y > window.innerHeight;
    if (!target || outside) return;
    dash.reorderWidgets(id, target.col, target.index);
  }

  function handleWidgetDragCancel() {
    stopTracking();
    setDraggingId(null);
    setSlot(null);
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
            <DataDialog
              state={dash.state}
              onImport={dash.importTabs}
              onReplace={dash.replaceState}
              backups={dash.backups}
              exportInfo={
                exportReminder.enabled && stateIsTrustworthy
                  ? {
                      lastExportAt: exportReminder.lastExportAt,
                      onExported: exportReminder.markExported,
                    }
                  : null
              }
            />
            <LayoutMenu
              columns={cols}
              onSetColumns={dash.setColumns}
              tabStyle={dash.activeTab.defaultStyle}
              globalStyle={dash.state.globalDefaultStyle ?? "full"}
              highlightNew={dash.state.highlightNew ?? true}
              onSetTabStyle={dash.setTabStyle}
              onSetGlobalStyle={dash.setGlobalStyle}
              onToggleHighlightNew={dash.setHighlightNew}
            />
            <SyncIndicator sync={dash.sync} />
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
        <SyncBanner sync={dash.sync} />
        <ExportReminderBanner
          reminder={exportReminder}
          state={dash.state}
          stateIsTrustworthy={stateIsTrustworthy}
        />
        {dash.activeTab.widgets.length === 0 ? (
          <EmptyState onAddFeed={dash.addWidget} onAddBookmarks={dash.addBookmarksTile} />
        ) : (
          <DndContext
            sensors={sensors}
            // The drop position comes from the pointer (see lib/dropSlot.ts), not from dnd-kit.
            collisionDetection={() => []}
            onDragStart={handleWidgetDragStart}
            onDragEnd={handleWidgetDragEnd}
            onDragCancel={handleWidgetDragCancel}
          >
            <div ref={gridRef} className={`grid grid-cols-1 gap-4 ${gridClass}`}>
              {Array.from({ length: cols }).map((_, col) => {
                const items = dash.widgetsByColumn(col);
                // The tiles the dragged one will be placed among (it is not one of them).
                const others = items.filter((w) => w.id !== draggingId);
                const here = slot && slot.col === col ? slot : null;
                return (
                  <Column
                    key={col}
                    col={col}
                    ids={items.map((w) => w.id)}
                    active={!!here}
                    showEmptyMarker={!!here && others.length === 0}
                  >
                    {items.map((w) => {
                      const i = others.findIndex((o) => o.id === w.id);
                      return (
                      <TileWithIndicator
                        key={w.id}
                        id={w.id}
                        before={!!here && i !== -1 && i === here.index}
                        after={!!here && i !== -1 && i === others.length - 1 && here.index === others.length}
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
                      );
                    })}
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


/** The line (with round ends) that shows where the dragged tile will land. */
function DropMarker({ className }: { className: string }) {
  return (
    <div className={`absolute left-4 right-4 z-10 h-1 pointer-events-none ${className}`}>
      <div className="absolute inset-0 rounded-full bg-primary shadow-[0_0_10px_3px_var(--color-primary)]" />
      <div className="absolute -left-1 -top-1.5 h-4 w-4 rounded-full border-2 border-primary bg-background shadow-[0_0_6px_2px_var(--color-primary)]" />
      <div className="absolute -right-1 -top-1.5 h-4 w-4 rounded-full border-2 border-primary bg-background shadow-[0_0_6px_2px_var(--color-primary)]" />
    </div>
  );
}

function TileWithIndicator({
  id,
  children,
  before,
  after,
}: {
  id: string;
  children: React.ReactNode;
  /** The dragged tile will land just above this one. */
  before: boolean;
  /** The dragged tile will land just below this one (it is the last of its column). */
  after: boolean;
}) {
  return (
    <div className="relative" data-tile-id={id}>
      {before && <DropMarker className="-top-2.5" />}
      {after && <DropMarker className="-bottom-2.5" />}
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

// Tiles must not slide around while another one is being dragged: the marker alone
// says where the tile will land, and sliding tiles would make it jump.
const noShift = () => null;

function Column({
  col,
  ids,
  active,
  showEmptyMarker,
  children,
}: {
  col: number;
  ids: string[];
  /** The dragged tile will land in this column. */
  active: boolean;
  /** ...and the column has no other tiles, so the marker goes at its top. */
  showEmptyMarker: boolean;
  children: React.ReactNode;
}) {
  return (
    <SortableContext items={ids} strategy={noShift}>
      <div
        data-column={col}
        className={`relative flex flex-col gap-4 min-h-32 rounded-xl transition-colors ${
          active ? "bg-primary/5 outline outline-2 outline-primary/20" : ""
        }`}
      >
        {showEmptyMarker && <DropMarker className="top-2" />}
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
