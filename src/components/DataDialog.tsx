import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { Upload, Download, X, Loader2, Database, ArrowLeft, AlertTriangle } from "lucide-react";
import { buildOpml, parseOpml } from "@/lib/opml";
import {
  buildBackupJson,
  parseBackup,
  summarizeState,
  withFreshIds,
  type ParsedBackup,
} from "@/lib/backup";
import type { DashboardState, DashboardTab } from "@/lib/rss";

interface Props {
  state: DashboardState;
  /** Add tabs next to the existing ones. */
  onImport: (tabs: DashboardTab[]) => void;
  /** Replace the whole dashboard (restore from a JSON backup). */
  onReplace: (state: DashboardState) => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function downloadFile(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoking immediately can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function timestamp() {
  return new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
}

/** A JSON backup starts with "{"; OPML / uStart exports are XML. */
function looksLikeJson(text: string) {
  return /^\s*[{[]/.test(text);
}

// ── Modal ─────────────────────────────────────────────────────────────────────

type Mode = "choose" | "import" | "export";

interface ModalProps extends Props {
  onClose: () => void;
}

function Modal({ state, onImport, onReplace, onClose }: ModalProps) {
  const [mode, setMode] = useState<Mode>("choose");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  // A parsed JSON backup waiting for the user to choose "add" or "replace".
  const [pending, setPending] = useState<ParsedBackup | null>(null);
  const [confirmReplace, setConfirmReplace] = useState(false);
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

  function resetImport() {
    setError(null);
    setSummary(null);
    setPending(null);
    setConfirmReplace(false);
  }

  async function handleFile(file: File) {
    setLoading(true);
    resetImport();
    try {
      const text = await file.text();
      if (looksLikeJson(text)) {
        // Lumen JSON backup: ask whether to add or replace before touching anything.
        setPending(parseBackup(text));
      } else {
        const result = parseOpml(text);
        onImport(result.tabs);
        const parts = [
          plural(result.tabs.length, "tab"),
          plural(result.feedCount, "feed"),
        ];
        if (result.bookmarkCount) parts.push(plural(result.bookmarkCount, "bookmark"));
        setSummary(
          `Imported ${parts.join(", ")}.` +
            (result.skipped
              ? ` Skipped ${plural(result.skipped, "unsupported item")}.`
              : ""),
        );
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function handleAddBackup() {
    if (!pending) return;
    onImport(withFreshIds(pending.state.tabs));
    const { tabCount, feedCount, bookmarkCount } = pending.summary;
    setSummary(
      `Added ${plural(tabCount, "tab")} (${plural(feedCount, "feed")}, ` +
        `${plural(bookmarkCount, "bookmark")}) next to your existing tabs.`,
    );
    setPending(null);
  }

  function handleReplaceBackup() {
    if (!pending) return;
    // Safety net: save what is on screen right now before overwriting it.
    downloadFile(
      buildBackupJson(state),
      `lumen-backup-before-restore-${timestamp()}.json`,
      "application/json",
    );
    onReplace(pending.state);
    setSummary(
      "Dashboard restored from backup. A copy of your previous dashboard was downloaded just before.",
    );
    setPending(null);
    setConfirmReplace(false);
  }

  function handleExportOpml() {
    downloadFile(buildOpml(state), `lumen-export-${timestamp()}.opml`, "application/xml");
  }

  function handleExportJson() {
    downloadFile(buildBackupJson(state), `lumen-backup-${timestamp()}.json`, "application/json");
  }

  const current = summarizeState(state);

  const title =
    mode === "choose" ? "Import / Export" : mode === "import" ? "Import" : "Export";

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-background/70 backdrop-blur-sm animate-in fade-in"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="glass rounded-2xl w-full max-w-lg shadow-[var(--shadow-card)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div className="flex items-center gap-2">
            {mode !== "choose" && (
              <button
                onClick={() => { setMode("choose"); resetImport(); }}
                className="p-1.5 -ml-1.5 rounded hover:bg-secondary"
                aria-label="Back"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
            )}
            <h2 className="font-display text-lg font-semibold">{title}</h2>
          </div>
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
                <p className="text-xs text-muted-foreground mt-0.5">Backup, OPML or uStart</p>
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
                <p className="text-xs text-muted-foreground mt-0.5">Backup or OPML</p>
              </div>
            </button>
          </div>
        )}

        {/* ── Import ── */}
        {mode === "import" && (
          <div className="p-5 space-y-4">
            <input
              ref={fileRef}
              type="file"
              accept=".json,.xml,.opml,application/json,text/xml,application/xml"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
                e.target.value = "";
              }}
            />

            {/* Step 1: pick a file */}
            {!pending && !summary && (
              <>
                <p className="text-sm text-muted-foreground">
                  Choose a file. Lumen recognises the format automatically:
                </p>
                <ul className="text-sm text-muted-foreground space-y-1.5 list-disc pl-5">
                  <li>
                    <strong>Lumen backup (.json)</strong> — restores everything: tabs, feeds,
                    bookmarks and display settings. You choose whether to add it to or replace
                    your current dashboard.
                  </li>
                  <li>
                    <strong>OPML (.opml / .xml)</strong> — a feed list from Lumen or another
                    reader. Each top-level group becomes a new tab, added next to yours.
                  </li>
                  <li>
                    <strong>uStart.org export (.xml)</strong> — imported like OPML; columns and
                    custom titles are kept, link tiles are skipped.
                  </li>
                </ul>
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
                      <span>Click to choose a .json, .opml or .xml file</span>
                    </>
                  )}
                </button>
              </>
            )}

            {/* Step 2 (JSON only): add or replace */}
            {pending && !confirmReplace && (
              <>
                <div className="text-sm rounded-md border border-border bg-secondary/40 p-3">
                  <p className="font-medium mb-1">Lumen backup recognised</p>
                  <p className="text-muted-foreground">
                    {plural(pending.summary.tabCount, "tab")},{" "}
                    {plural(pending.summary.feedCount, "feed")},{" "}
                    {plural(pending.summary.bookmarkCount, "bookmark")}.
                    {pending.summary.skipped > 0 &&
                      ` ${plural(pending.summary.skipped, "unusable item")} will be skipped.`}
                  </p>
                </div>
                <p className="text-sm text-muted-foreground">
                  Your current dashboard has {plural(current.tabCount, "tab")},{" "}
                  {plural(current.feedCount, "feed")} and{" "}
                  {plural(current.bookmarkCount, "bookmark")}. What do you want to do?
                </p>
                <div className="grid gap-3">
                  <button
                    onClick={handleAddBackup}
                    className="text-left p-4 rounded-xl border-2 border-border hover:border-primary hover:bg-primary/5 transition"
                  >
                    <p className="font-semibold text-sm">Add as new tabs</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Keeps everything you have now and adds the tabs from the backup.
                      Display settings are not changed.
                    </p>
                  </button>
                  <button
                    onClick={() => setConfirmReplace(true)}
                    className="text-left p-4 rounded-xl border-2 border-border hover:border-destructive hover:bg-destructive/5 transition"
                  >
                    <p className="font-semibold text-sm">Replace everything</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Restores the dashboard exactly as in the backup, including display
                      settings. Your current tabs are removed.
                    </p>
                  </button>
                </div>
                <button
                  onClick={resetImport}
                  className="w-full px-4 py-2 rounded-md border border-border text-sm font-medium hover:bg-secondary"
                >
                  Cancel
                </button>
              </>
            )}

            {/* Step 3 (replace only): confirmation */}
            {pending && confirmReplace && (
              <>
                <div className="flex gap-3 text-sm rounded-md border border-destructive/40 bg-destructive/10 p-3">
                  <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
                  <p>
                    This replaces your current {plural(current.tabCount, "tab")},{" "}
                    {plural(current.feedCount, "feed")} and{" "}
                    {plural(current.bookmarkCount, "bookmark")} with the backup. A backup of
                    your current dashboard is downloaded automatically first.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setConfirmReplace(false)}
                    className="px-4 py-2 rounded-md border border-border text-sm font-medium hover:bg-secondary"
                  >
                    Back
                  </button>
                  <button
                    onClick={handleReplaceBackup}
                    className="px-4 py-2 rounded-md bg-destructive text-destructive-foreground text-sm font-medium hover:opacity-90"
                  >
                    Replace everything
                  </button>
                </div>
              </>
            )}

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
                <p className="text-2xl font-bold font-display text-primary">{current.tabCount}</p>
                <p className="text-xs text-muted-foreground uppercase tracking-wider mt-0.5">Tabs</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold font-display text-primary">{current.feedCount}</p>
                <p className="text-xs text-muted-foreground uppercase tracking-wider mt-0.5">Feeds</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold font-display text-primary">{current.bookmarkCount}</p>
                <p className="text-xs text-muted-foreground uppercase tracking-wider mt-0.5">Bookmarks</p>
              </div>
            </div>

            <div className="grid gap-3">
              <button
                onClick={handleExportJson}
                className="flex items-start gap-3 text-left p-4 rounded-xl border-2 border-border hover:border-primary hover:bg-primary/5 transition"
              >
                <Download className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                <div>
                  <p className="font-semibold text-sm">Full backup (JSON) — recommended</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Everything Lumen stores: tabs, feeds, bookmarks, columns, tile styles and
                    display options. Use it to restore Lumen exactly as it is now.
                  </p>
                </div>
              </button>
              <button
                onClick={handleExportOpml}
                className="flex items-start gap-3 text-left p-4 rounded-xl border-2 border-border hover:border-primary hover:bg-primary/5 transition"
              >
                <Download className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                <div>
                  <p className="font-semibold text-sm">Feed list (OPML)</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Tabs, feeds and bookmark tiles in a standard format that other RSS readers
                    understand. Tile styles and display options are not included.
                  </p>
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

export function DataDialog({ state, onImport, onReplace }: Props) {
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
        <Modal
          state={state}
          onImport={onImport}
          onReplace={onReplace}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
