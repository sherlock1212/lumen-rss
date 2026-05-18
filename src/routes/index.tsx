import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
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

  const cols = dash.activeTab.columns;
  const gridClass =
    cols === 2
      ? "md:grid-cols-2"
      : cols === 4
      ? "md:grid-cols-2 lg:grid-cols-4"
      : "md:grid-cols-2 lg:grid-cols-3";

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top bar */}
      <header className="sticky top-0 z-30 glass border-b border-border">
        <div className="flex items-center gap-3 px-4 md:px-6 py-3">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-lg flex items-center justify-center bg-[var(--gradient-primary)] shadow-[var(--shadow-glow)]">
              <Sparkles className="h-4.5 w-4.5 text-primary-foreground" />
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
        <div className="flex items-end gap-1 px-4 md:px-6 overflow-x-auto scroll-thin">
          {dash.state.tabs.map((t) => {
            const active = t.id === dash.state.activeTabId;
            const isEditing = editingTab === t.id;
            return (
              <div
                key={t.id}
                className={`group flex items-center gap-1 px-3 pt-2 pb-2.5 -mb-px text-sm border-b-2 transition ${
                  active
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {isEditing ? (
                  <input
                    autoFocus
                    defaultValue={t.name}
                    onBlur={(e) => {
                      dash.renameTab(t.id, e.target.value || t.name);
                      setEditingTab(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        dash.renameTab(
                          t.id,
                          (e.target as HTMLInputElement).value || t.name,
                        );
                        setEditingTab(null);
                      }
                      if (e.key === "Escape") setEditingTab(null);
                    }}
                    className="bg-transparent outline-none border-b border-primary w-24"
                  />
                ) : (
                  <button onClick={() => dash.setActiveTab(t.id)}>
                    {t.name}
                  </button>
                )}
                {active && !isEditing && (
                  <>
                    <button
                      onClick={() => setEditingTab(t.id)}
                      className="opacity-0 group-hover:opacity-100 p-0.5 hover:text-foreground"
                      aria-label="Rename tab"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                    {dash.state.tabs.length > 1 && (
                      <button
                        onClick={() => dash.removeTab(t.id)}
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
          })}
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
      </header>

      {/* Grid */}
      <main className="flex-1 p-4 md:p-6">
        {dash.activeTab.widgets.length === 0 ? (
          <EmptyState onAdd={dash.addWidget} />
        ) : (
          <div className={`grid grid-cols-1 gap-4 ${gridClass}`}>
            {Array.from({ length: cols }).map((_, col) => (
              <div key={col} className="flex flex-col gap-4">
                {dash.widgetsByColumn(col).map((w) => (
                  <FeedCard
                    key={w.id}
                    widget={w}
                    onRemove={() => dash.removeWidget(w.id)}
                    onMove={(d) => dash.moveWidget(w.id, d)}
                    canMoveLeft={col > 0}
                    canMoveRight={col < cols - 1}
                  />
                ))}
              </div>
            ))}
          </div>
        )}
      </main>

      <footer className="px-4 md:px-6 py-4 text-center text-xs text-muted-foreground border-t border-border">
        Built with care · Feeds fetched server-side — no CORS, no tracking.
      </footer>
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
