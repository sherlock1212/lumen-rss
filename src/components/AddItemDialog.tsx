import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { Plus, X, Loader2, Rss, Star } from "lucide-react";
import { fetchFeed } from "@/lib/rss";

interface Props {
  onAddFeed: (url: string, title?: string) => void;
  onAddBookmarks: () => void;
}

const PRESETS = [
  { name: "Hacker News",  url: "https://hnrss.org/frontpage" },
  { name: "The Verge",    url: "https://www.theverge.com/rss/index.xml" },
  { name: "TechCrunch",   url: "https://techcrunch.com/feed/" },
  { name: "NASA",         url: "https://www.nasa.gov/news-release/feed/" },
  { name: "BBC World",    url: "http://feeds.bbci.co.uk/news/world/rss.xml" },
  { name: "Wired",        url: "https://www.wired.com/feed/rss" },
  { name: "Ars Technica", url: "http://feeds.arstechnica.com/arstechnica/index" },
  { name: "CSS-Tricks",   url: "https://css-tricks.com/feed/" },
];

function looksLikeFeedUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return (
    /\.(xml|rss|atom)([?#]|$)/.test(lower) ||
    /\/(feed|rss|atom)(\/|$|\?)/.test(lower) ||
    lower.includes("feed=rss") ||
    lower.includes("feed=atom")
  );
}

async function discoverFeed(raw: string): Promise<{ url: string; title: string | null }[]> {
  const res = await fetch(`/api/discover-feed?url=${encodeURIComponent(raw)}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `Discovery failed (${res.status})`);
  return data.feeds as { url: string; title: string | null }[];
}

// ── Mode selector ─────────────────────────────────────────────────────────────
type Mode = "choose" | "feed";

interface ModalProps {
  onClose: () => void;
  onAddFeed: (url: string, title?: string) => void;
  onAddBookmarks: () => void;
}

function Modal({ onClose, onAddFeed, onAddBookmarks }: ModalProps) {
  const [mode, setMode] = useState<Mode>("choose");
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<{ url: string; title: string | null }[]>([]);

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

  function reset() {
    setUrl(""); setError(null); setCandidates([]); setLoading(false);
  }

  function close() { reset(); onClose(); }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const raw = url.trim();
    if (!raw) return;
    setLoading(true); setError(null); setCandidates([]);
    try {
      const normalised = raw.startsWith("http://") || raw.startsWith("https://") ? raw : `https://${raw}`;
      if (looksLikeFeedUrl(normalised)) {
        const feed = await fetchFeed(normalised);
        onAddFeed(normalised, feed.title);
        close();
      } else {
        const feeds = await discoverFeed(normalised);
        if (feeds.length === 1) {
          const feed = await fetchFeed(feeds[0].url).catch(() => null);
          onAddFeed(feeds[0].url, feed?.title ?? feeds[0].title ?? undefined);
          close();
        } else {
          setCandidates(feeds);
        }
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function handlePickCandidate(c: { url: string; title: string | null }) {
    setLoading(true); setError(null);
    try {
      const feed = await fetchFeed(c.url).catch(() => null);
      onAddFeed(c.url, feed?.title ?? c.title ?? undefined);
      close();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-background/70 backdrop-blur-sm animate-in fade-in"
      onClick={close}
    >
      <div
        className="glass rounded-2xl w-full max-w-lg shadow-[var(--shadow-card)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h2 className="font-display text-lg font-semibold">
            {mode === "choose" ? "Add item" : "Add feed"}
          </h2>
          <button onClick={close} className="p-1.5 rounded hover:bg-secondary">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* ── Mode: choose ── */}
        {mode === "choose" && (
          <div className="p-5 grid grid-cols-2 gap-3">
            <button
              onClick={() => setMode("feed")}
              className="flex flex-col items-center gap-3 p-5 rounded-xl border-2 border-border hover:border-primary hover:bg-primary/5 transition group"
            >
              <div className="h-12 w-12 rounded-xl flex items-center justify-center bg-[var(--gradient-primary)] shadow-[var(--shadow-glow)]">
                <Rss className="h-6 w-6 text-white" />
              </div>
              <div className="text-center">
                <p className="font-semibold text-sm">Feed RSS</p>
                <p className="text-xs text-muted-foreground mt-0.5">Subscribe to a news feed</p>
              </div>
            </button>
            <button
              onClick={() => { onAddBookmarks(); close(); }}
              className="flex flex-col items-center gap-3 p-5 rounded-xl border-2 border-border hover:border-primary hover:bg-primary/5 transition group"
            >
              <div className="h-12 w-12 rounded-xl flex items-center justify-center bg-[var(--gradient-primary)] shadow-[var(--shadow-glow)]">
                <Star className="h-6 w-6 text-white" fill="currentColor" />
              </div>
              <div className="text-center">
                <p className="font-semibold text-sm">Favourites</p>
                <p className="text-xs text-muted-foreground mt-0.5">Quick-access bookmark tile</p>
              </div>
            </button>
          </div>
        )}

        {/* ── Mode: feed ── */}
        {mode === "feed" && (
          <>
            <form onSubmit={handleSubmit} className="p-5 space-y-3">
              <label className="text-sm font-medium block">RSS / Atom URL or website address</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  required
                  autoFocus
                  value={url}
                  onChange={(e) => { setUrl(e.target.value); setError(null); setCandidates([]); }}
                  placeholder="https://example.com  or  https://example.com/feed.xml"
                  className="flex-1 bg-input border border-border rounded-md px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-ring/30"
                />
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50 flex items-center gap-2 shrink-0"
                >
                  {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {loading ? "Searching…" : "Add"}
                </button>
              </div>
              {error && <p className="text-xs text-destructive">{error}</p>}
              {!error && !loading && candidates.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  You can paste a website URL and we'll find the feed for you.
                </p>
              )}
            </form>

            {candidates.length > 1 && (
              <div className="px-5 pb-4 space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Multiple feeds found — pick one:
                </p>
                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {candidates.map((c) => (
                    <button
                      key={c.url}
                      onClick={() => handlePickCandidate(c)}
                      disabled={loading}
                      className="w-full text-left flex items-start gap-2.5 px-3 py-2.5 rounded-lg bg-secondary hover:bg-accent hover:text-accent-foreground transition border border-border disabled:opacity-50"
                    >
                      <Rss className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
                      <span className="text-xs leading-snug break-all">{c.url}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="px-5 pb-5">
              <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Or pick a popular feed</p>
              <div className="flex flex-wrap gap-2">
                {PRESETS.map((p) => (
                  <button
                    key={p.url}
                    onClick={() => { onAddFeed(p.url, p.name); close(); }}
                    className="px-3 py-1.5 rounded-full text-xs bg-secondary hover:bg-accent hover:text-accent-foreground transition border border-border"
                  >
                    + {p.name}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}

export function AddItemDialog({ onAddFeed, onAddBookmarks }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="hover-border h-9 inline-flex items-center gap-1.5 px-3 rounded-md bg-[var(--gradient-primary)] text-white font-semibold text-sm shadow-[var(--shadow-glow)] [text-shadow:0_1px_2px_rgba(0,0,0,0.25)]"
      >
        <Plus className="h-4 w-4" />
        Add item
      </button>
      {open && (
        <Modal
          onClose={() => setOpen(false)}
          onAddFeed={onAddFeed}
          onAddBookmarks={onAddBookmarks}
        />
      )}
    </>
  );
}
