import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { Upload, X, Loader2 } from "lucide-react";
import { parseOpml } from "@/lib/opml";
import type { DashboardTab } from "@/lib/rss";

interface Props {
  onImport: (tabs: DashboardTab[]) => void;
}

interface ModalProps {
  onClose: () => void;
  onImport: (tabs: DashboardTab[]) => void;
}

function Modal({ onClose, onImport }: ModalProps) {
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [summary, setSummary]   = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Close on ESC
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Prevent body scroll
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
        `Imported ${result.tabs.length} tab${result.tabs.length === 1 ? "" : "s"} and ${result.feedCount} feed${result.feedCount === 1 ? "" : "s"}.${
          result.skipped ? ` Skipped ${result.skipped} non-feed item${result.skipped === 1 ? "" : "s"}.` : ""
        }`,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-background/70 backdrop-blur-sm animate-in fade-in"
      onClick={onClose}
    >
      <div
        className="glass rounded-2xl w-full max-w-lg shadow-[var(--shadow-card)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h2 className="font-display text-lg font-semibold">Import feeds</h2>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-secondary" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-sm text-muted-foreground">
            Import an <strong>OPML</strong> file or your{" "}
            <strong>uStart.org</strong> XML export. Each top-level group
            becomes a new tab; columns and custom titles are preserved.
            Link tiles (non-RSS) are skipped.
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

          {error   && <p className="text-sm text-destructive">{error}</p>}
          {summary && (
            <div className="text-sm rounded-md border border-border bg-secondary/40 p-3">
              ✓ {summary}
            </div>
          )}
          {summary && (
            <button
              onClick={onClose}
              className="w-full px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90"
            >
              Done
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function ImportOpmlDialog({ onImport }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Import OPML / uStart.org export"
        className="hover-border h-9 inline-flex items-center justify-center px-3 rounded-md border border-border bg-surface/60 text-foreground text-sm font-medium"
      >
        <Upload className="h-4 w-4" />
        <span className="hidden md:inline ml-1.5">Import</span>
      </button>

      {open && <Modal onClose={() => setOpen(false)} onImport={onImport} />}
    </>
  );
}
