import { useState } from "react";
import { Plus, X, Loader2 } from "lucide-react";
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

export function AddFeedDialog({ onAdd }: Props) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const feed = await fetchFeed(url.trim());
      onAdd(url.trim(), feed.title);
      setUrl("");
      setOpen(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function handlePreset(presetUrl: string, name: string) {
    onAdd(presetUrl, name);
    setOpen(false);
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[var(--gradient-primary)] text-primary-foreground font-medium text-sm shadow-[var(--shadow-glow)] hover:opacity-90 transition"
      >
        <Plus className="h-4 w-4" />
        Add feed
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/70 backdrop-blur-sm animate-in fade-in"
          onClick={() => setOpen(false)}
        >
          <div
            className="glass rounded-2xl w-full max-w-lg shadow-[var(--shadow-card)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-5 border-b border-border">
              <h2 className="font-display text-lg font-semibold">
                Add a new feed
              </h2>
              <button
                onClick={() => setOpen(false)}
                className="p-1.5 rounded hover:bg-secondary"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-5 space-y-3">
              <label className="text-sm font-medium block">
                RSS / Atom URL
              </label>
              <div className="flex gap-2">
                <input
                  type="url"
                  required
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://example.com/feed.xml"
                  className="flex-1 bg-input border border-border rounded-md px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-ring/30"
                />
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50 flex items-center gap-2"
                >
                  {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Add
                </button>
              </div>
              {error && (
                <p className="text-xs text-destructive">{error}</p>
              )}
            </form>

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
