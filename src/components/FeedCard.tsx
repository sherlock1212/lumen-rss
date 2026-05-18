import { useQuery } from "@tanstack/react-query";
import { fetchFeed, type FeedWidget } from "@/lib/rss";
import {
  ArrowLeft,
  ArrowRight,
  ExternalLink,
  RefreshCw,
  Rss,
  Trash2,
} from "lucide-react";

interface Props {
  widget: FeedWidget;
  onRemove: () => void;
  onMove: (dir: "left" | "right") => void;
  canMoveLeft: boolean;
  canMoveRight: boolean;
}

function timeAgo(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso).getTime();
  if (Number.isNaN(d)) return "";
  const diff = Math.max(0, Date.now() - d);
  const m = Math.floor(diff / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const dd = Math.floor(h / 24);
  return `${dd}d`;
}

export function FeedCard({
  widget,
  onRemove,
  onMove,
  canMoveLeft,
  canMoveRight,
}: Props) {
  const query = useQuery({
    queryKey: ["feed", widget.url],
    queryFn: () => fetchFeed(widget.url),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const title =
    widget.customTitle ??
    query.data?.title ??
    new URL(widget.url).hostname.replace(/^www\./, "");

  return (
    <div className="glass rounded-xl flex flex-col overflow-hidden shadow-[var(--shadow-card)] transition hover:border-primary/30 group">
      <header className="flex items-center gap-2 px-4 py-3 border-b border-border bg-surface/50">
        <div className="h-7 w-7 rounded-md flex items-center justify-center bg-[var(--gradient-primary)] shadow-[var(--shadow-glow)] shrink-0">
          <Rss className="h-3.5 w-3.5 text-primary-foreground" />
        </div>
        <h3 className="font-display font-semibold text-sm truncate flex-1">
          {title}
        </h3>
        <div className="flex items-center opacity-0 group-hover:opacity-100 transition gap-0.5">
          <button
            onClick={() => onMove("left")}
            disabled={!canMoveLeft}
            className="p-1.5 rounded hover:bg-secondary disabled:opacity-30 disabled:hover:bg-transparent"
            aria-label="Move left"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => onMove("right")}
            disabled={!canMoveRight}
            className="p-1.5 rounded hover:bg-secondary disabled:opacity-30 disabled:hover:bg-transparent"
            aria-label="Move right"
          >
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => query.refetch()}
            className="p-1.5 rounded hover:bg-secondary"
            aria-label="Refresh"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${query.isFetching ? "animate-spin" : ""}`}
            />
          </button>
          <button
            onClick={onRemove}
            className="p-1.5 rounded hover:bg-destructive/20 text-destructive"
            aria-label="Remove"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto scroll-thin max-h-[28rem]">
        {query.isLoading && (
          <div className="p-4 space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <div className="h-3 rounded bg-secondary/60 animate-pulse w-3/4" />
                <div className="h-2 rounded bg-secondary/40 animate-pulse w-full" />
              </div>
            ))}
          </div>
        )}
        {query.isError && (
          <div className="p-4 text-sm text-destructive">
            <p className="font-medium mb-1">Couldn't load feed</p>
            <p className="text-muted-foreground text-xs break-words">
              {(query.error as Error)?.message}
            </p>
            <p className="text-muted-foreground text-xs mt-2 break-all">
              {widget.url}
            </p>
          </div>
        )}
        {query.data && (
          <ul>
            {query.data.items.map((item, i) => (
              <li
                key={i}
                className="border-b border-border last:border-b-0 hover:bg-secondary/40 transition"
              >
                <a
                  href={item.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block px-4 py-3"
                >
                  <div className="flex items-start gap-2">
                    <span className="text-sm font-medium leading-snug flex-1 group-hover:text-foreground">
                      {item.title}
                    </span>
                    <ExternalLink className="h-3 w-3 mt-1 opacity-40 shrink-0" />
                  </div>
                  {item.description && (
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                      {item.description}
                    </p>
                  )}
                  <div className="flex items-center gap-2 mt-1.5 text-[10px] uppercase tracking-wider text-muted-foreground/80">
                    {item.author && <span>{item.author}</span>}
                    {item.author && item.pubDate && <span>·</span>}
                    {item.pubDate && <span>{timeAgo(item.pubDate)}</span>}
                  </div>
                </a>
              </li>
            ))}
            {query.data.items.length === 0 && (
              <p className="p-4 text-xs text-muted-foreground">
                No items in this feed.
              </p>
            )}
          </ul>
        )}
      </div>
    </div>
  );
}
