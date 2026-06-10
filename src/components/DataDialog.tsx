import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { Upload, Download, X, Loader2, Database } from "lucide-react";
import { parseOpml } from "@/lib/opml";
import type { DashboardState, DashboardTab } from "@/lib/rss";

interface Props {
  state: DashboardState;
  onImport: (tabs: DashboardTab[]) => void;
}

// ── Export ────────────────────────────────────────────────────────────────────

function buildOpml(state: DashboardState): string {
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  const tabsXml = state.tabs
    .map((tab) => {
      const feedsXml = tab.widgets
        .map((w) => {
          if (w.kind === "bookmarks") {
            // Export bookmarks as a nested group inside the tab
            const bkXml = (w.bookmarks ?? [])
              .map(
                (b) =>
                  `      <outline type="link" text="${esc(b.title)}" url="${esc(b.url)}" />`,
              )
              .join("\n");
            return `    <outline text="${esc(w.customTitle ?? "Favourites")}" type="favourites">\n${bkXml}\n    </outline>`;
          }
          const titleAttr = w.customTitle ? ` title="${esc(w.customTitle)}"` : "";
          const colAttr = ` pos="{'col':${w.column},'row':0}"`;
          return `    <outline type="rss" text="${esc(w.customTitle ?? w.url)}"${titleAttr} xmlUrl="${esc(w.url)}"${colAttr} />`;
        })
        .join("\n");
      return `  <outline text="${esc(tab.name)}" title="${esc(tab.name)}">\n${feedsXml}\n  </outline>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head>
    <title>Lumen RSS Dashboard export</title>
    <dateCreated>${new Date().toUTCString()}</dateCreated>
  </head>
  <body>
${tabsXml}
  </body>
</opml>`;
}

function downloadFile(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Modal ─────────────────────────────────────────────────────────────────────

type Mode = "choose" | "import" | "export";

interface ModalProps {
  state: DashboardState;
  onImport: (tabs: DashboardTab[]) => void;
  onClose: () => void;
}

function Modal({ state, onImport, onClose }: ModalProps) {
  const [mode, setMode] = useState<Mode>("choose");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  async function handleFile(file: File) {
    setLoading(true);
    setError(null);
    setSummary(null);
    try {
      const text = await file.text();
      const result = parseOpml(text);
      onImport(result.tabs);
      setSummary(
        `Imported ${result.tabs.length} tab${result.tabs.length === 1 ? "" : "s"} ` +
        `and ${result.feedCount} feed${result.feedCount === 1 ? "" : "s"}.` +
        (result.skipped ? ` Skipped ${result.skipped} non-feed item${result.skipped === 1 ? "" : "s"}.` : ""),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function handleExportOpml() {
    const xml = buildOpml(state);
    const date = new Date().toISOString().slice(0, 10);
    downloadFile(xml, `lumen-export-${date}.opml`, "application/xml");
  }

  function handleExportJson() {
    const date = new Date().toISOString().slice(0, 10);
    downloadFile(
      JSON.stringify(state, null, 2),
      `lumen-export-${date}.json`,
      "application/json",
    );
  }

  // Count stats for export preview
  const totalFeeds = state.tabs.reduce(
    (n, t) => n + t.widgets.filter((w) => w.kind !== "bookmarks").length,
    0,
  );
  const totalBookmarks = state.tabs.reduce(
    (n, t) =>
      n + t.widgets.filter((w) => w.kind === "bookmarks").reduce((m, w) => m + (w.bookmarks?.length ?? 0), 0),
    0,
  );

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-background/70 backdrop-blur-sm animate-in fade-in"
      onClick={onClose}
    >
      <div
        className="glass rounded-2xl w-full max-w-lg shadow-[var(--shadow-card)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h2 className="font-display text-lg font-semibold">
            {mode === "choose" ? "Import / Export" : mode === "import" ? "Import feeds" : "Export backup"}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-secondary" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* ── Choose ── */}
        {mode === "choose" && (
          <div className="p-5 grid grid-cols-2 gap-3">
            <button
              onClick={() => setMode("import")}
              className="flex flex-col items-center gap-3 p-5 rounded-xl border-2 border-border hover:border-primary hover:bg-primary/5 transition"
            >
              <div className="h-12 w-12 rounded-xl flex items-center justify-center bg-[var(--gradient-primary)] shadow-[var(--shadow-glow)]">
                <Upload className="h-6 w-6 text-white" />
              </div>
              <div className="text-center">
                <p className="font-semibold text-sm">Import</p>
                <p className="text-xs text-muted-foreground mt-0.5">OPML or uStart.org export</p>
              </div>
            </button>
            <button
              onClick={() => setMode("export")}
              className="flex flex-col items-center gap-3 p-5 rounded-xl border-2 border-border hover:border-primary hover:bg-primary/5 transition"
            >
              <div className="h-12 w-12 rounded-xl flex items-center justify-center bg-[var(--gradient-primary)] shadow-[var(--shadow-glow)]">
                <Download className="h-6 w-6 text-white" />
              </div>
              <div className="text-center">
                <p className="font-semibold text-sm">Export</p>
                <p className="text-xs text-muted-foreground mt-0.5">Download backup file</p>
              </div>
            </button>
          </div>
        )}

        {/* ── Import ── */}
        {mode === "import" && (
          <div className="p-5 space-y-4">
            <p className="text-sm text-muted-foreground">
              Import an <strong>OPML</strong> file or your <strong>uStart.org</strong> XML export.
              Each top-level group becomes a new tab.
            </p>
            <input
              ref={fileRef}
              type="file"
              accept=".xml,.opml,text/xml,application/xml"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
                e.target.value = "";
              }}
            />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={loading}
              className="w-full py-8 rounded-lg border-2 border-dashed border-border hover:border-primary hover:bg-primary/5 transition flex flex-col items-center justify-center gap-2 text-sm text-muted-foreground disabled:opacity-50"
            >
              {loading ? (
                <Loader2 className="h-6 w-6 animate-spin" />
              ) : (
                <>
                  <Upload className="h-6 w-6" />
                  <span>Click to choose a .xml or .opml file</span>
                </>
              )}
            </button>
            {error && <p className="text-sm text-destructive">{error}</p>}
            {summary && (
              <>
                <div className="text-sm rounded-md border border-border bg-secondary/40 p-3">
                  ✓ {summary}
                </div>
                <button
                  onClick={onClose}
                  className="w-full px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90"
                >
                  Done
                </button>
              </>
            )}
          </div>
        )}

        {/* ── Export ── */}
        {mode === "export" && (
          <div className="p-5 space-y-4">
            {/* Stats */}
            <div className="rounded-lg border border-border bg-secondary/30 p-4 flex gap-6">
              <div className="text-center">
                <p className="text-2xl font-bold font-display text-primary">{state.tabs.length}</p>
                <p className="text-xs text-muted-foreground uppercase tracking-wider mt-0.5">Tabs</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold font-display text-primary">{totalFeeds}</p>
                <p className="text-xs text-muted-foreground uppercase tracking-wider mt-0.5">Feeds</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold font-display text-primary">{totalBookmarks}</p>
                <p className="text-xs text-muted-foreground uppercase tracking-wider mt-0.5">Bookmarks</p>
              </div>
            </div>

            <p className="text-sm text-muted-foreground">
              Choose a format. <strong>OPML</strong> is compatible with most RSS readers.
              <strong> JSON</strong> is a full backup that preserves everything including bookmarks.
            </p>

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={handleExportOpml}
                className="flex flex-col items-center gap-2 p-4 rounded-xl border-2 border-border hover:border-primary hover:bg-primary/5 transition"
              >
                <Download className="h-5 w-5 text-primary" />
                <div className="text-center">
                  <p className="font-semibold text-sm">OPML</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">RSS readers compatible</p>
                </div>
              </button>
              <button
                onClick={handleExportJson}
                className="flex flex-col items-center gap-2 p-4 rounded-xl border-2 border-border hover:border-primary hover:bg-primary/5 transition"
              >
                <Download className="h-5 w-5 text-primary" />
                <div className="text-center">
                  <p className="font-semibold text-sm">JSON</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">Full backup with bookmarks</p>
                </div>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

// ── Trigger button ────────────────────────────────────────────────────────────

export function DataDialog({ state, onImport }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Import / Export"
        className="hover-border h-9 inline-flex items-center justify-center gap-1.5 px-3 rounded-md border border-border bg-surface/60 text-foreground text-sm font-medium hover:bg-secondary transition"
      >
        <Database className="h-4 w-4" />
        <span className="hidden md:inline">Data</span>
      </button>
      {open && (
        <Modal state={state} onImport={onImport} onClose={() => setOpen(false)} />
      )}
    </>
  );
}
