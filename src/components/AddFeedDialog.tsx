import { useState } from "react";
import { Plus, X, Loader2, Rss } from "lucide-react";
import { fetchFeed } from "@/lib/rss";

interface Props {
  onAdd: (url: string, title?: string) => void;
}

const PRESETS = [
  { name: "Hacker News", url: "https://hnrss.org/frontpage" },
  { name: "The Verge", url: "https://www.theverge.com/rss/index.xml" },
  { name: "TechCrunch", url: "https://techcrunch.com/feed/" },
  { name: "NASA", url: "https://www.nasa.gov/news-release/feed/" },
  { name: "BBC World", url: "http://feeds.bbci.co.uk/news/world/rss.xml" },
  { name: "Wired", url: "https://www.wired.com/feed/rss" },
  { name: "Ars Technica", url: "http://feeds.arstechnica.com/arstechnica/index" },
  { name: "CSS-Tricks", url: "https://css-tricks.com/feed/" },
];

// Heuristic: does the URL already look like a direct feed endpoint?
// If so we skip discovery and go straight to fetchFeed.
function looksLikeFeedUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return (
    /\.(xml|rss|atom)([?#]|$)/.test(lower) ||
    /\/(feed|rss|atom)(\/|$|\?)/.test(lower) ||
    lower.includes("feed=rss") ||
    lower.includes("feed=atom")
  );
}

async function discoverFeed(
  raw: string,
): Promise<{ url: string; title: string | null }[]> {
  const res = await fetch(
    `/api/discover-feed?url=${encodeURIComponent(raw)}`,
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `Discovery failed (${res.status})`);
  return data.feeds as { url: string; title: string | null }[];
}

export function AddFeedDialog({ onAdd }: Props) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // When discovery finds multiple feeds we show a picker
  const [candidates, setCandidates] = useState<
    { url: string; title: string | null }[]
  >([]);

  function reset() {
    setUrl("");
    setError(null);
    setCandidates([]);
    setLoading(false);
  }

  function close() {
    reset();
    setOpen(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const raw = url.trim();
    if (!raw) return;

    setLoading(true);
    setError(null);
    setCandidates([]);

    try {
      // Normalise: add https:// if the user omitted the scheme
      const normalised =
        raw.startsWith("http://") || raw.startsWith("https://")
          ? raw
          : `https://${raw}`;

      if (looksLikeFeedUrl(normalised)) {
        // Direct feed URL — validate and add immediately
        const feed = await fetchFeed(normalised);
        onAdd(normalised, feed.title);
        close();
      } else {
        // Homepage URL — run autodiscovery
        const feeds = await discoverFeed(normalised);
        if (feeds.length === 1) {
          // Single result: fetch to get the real title, then add
          const feed = await fetchFeed(feeds[0].url).catch(() => null);
          onAdd(feeds[0].url, feed?.title ?? feeds[0].title ?? undefined);
          close();
        } else {
          // Multiple candidates: let the user pick
          setCandidates(feeds);
        }
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function handlePickCandidate(candidate: {
    url: string;
    title: string | null;
  }) {
    setLoading(true);
    setError(null);
    try {
      const feed = await fetchFeed(candidate.url).catch(() => null);
      onAdd(candidate.url, feed?.title ?? candidate.title ?? undefined);
      close();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function handlePreset(presetUrl: string, name: string) {
    onAdd(presetUrl, name);
    close();
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="hover-border h-9 inline-flex items-center gap-1.5 px-3 rounded-md bg-[var(--gradient-primary)] text-white font-semibold text-sm shadow-[var(--shadow-glow)] [text-shadow:0_1px_2px_rgba(0,0,0,0.25)]"
      >
        <Plus className="h-4 w-4" />
        Add feed
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/70 backdrop-blur-sm animate-in fade-in"
          onClick={close}
        >
          <div
            className="glass rounded-2xl w-full max-w-lg shadow-[var(--shadow-card)]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-border">
              <h2 className="font-display text-lg font-semibold">
                Add a new feed
              </h2>
              <button
                onClick={close}
                className="p-1.5 rounded hover:bg-secondary"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* URL input */}
            <form onSubmit={handleSubmit} className="p-5 space-y-3">
              <label className="text-sm font-medium block">
                RSS / Atom URL or website address
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  required
                  value={url}
                  onChange={(e) => {
                    setUrl(e.target.value);
                    setError(null);
                    setCandidates([]);
                  }}
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
              {!error && !loading && !candidates.length && (
                <p className="text-xs text-muted-foreground">
                  You can paste a website URL and we'll find the feed for you.
                </p>
              )}
            </form>

            {/* Multiple feed candidates picker */}
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
                      <span className="text-xs leading-snug break-all">
                        {c.url}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Preset feeds */}
            <div className="px-5 pb-5">
              <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
                Or pick a popular feed
              </p>
              <div className="flex flex-wrap gap-2">
                {PRESETS.map((p) => (
                  <button
                    key={p.url}
                    onClick={() => handlePreset(p.url, p.name)}
                    className="px-3 py-1.5 rounded-full text-xs bg-secondary hover:bg-accent hover:text-accent-foreground transition border border-border"
                  >
                    + {p.name}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
