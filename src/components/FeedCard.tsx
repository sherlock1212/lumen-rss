import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { fetchFeed, type FeedWidget, type TileStyle } from "@/lib/rss";
import { EditFeedDialog } from "./EditFeedDialog";
import {
  ExternalLink,
  GripVertical,
  Pencil,
  RefreshCw,
  Rss,
  Trash2,
} from "lucide-react";
import { ConfirmDialog } from "./ConfirmDialog";
import { useVisited } from "@/lib/useVisited";
import { useSeenItems } from "@/lib/useSeenItems";

/** Derives the site origin from either the feed's declared link or its feed URL. */
function siteOrigin(feedLink: string | undefined, feedUrl: string): string | null {
  const candidate = feedLink || feedUrl;
  try {
    return new URL(candidate).origin;
  } catch {
    return null;
  }
}

/**
 * Shows the site favicon, falling back to the Rss icon if unavailable.
 * Strategy:
 *   1. Google favicon CDN (fast, cached, works for ~95 % of sites)
 *   2. Direct /favicon.ico on the origin
 *   3. Lucide <Rss> icon
 */
function FeedFavicon({ feedLink, feedUrl }: { feedLink?: string; feedUrl: string }) {
  const origin = siteOrigin(feedLink, feedUrl);
  const googleUrl = origin
    ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(origin)}&sz=32`
    : null;
  const directUrl = origin ? `${origin}/favicon.ico` : null;

  const [src, setSrc] = useState<string | null>(googleUrl);
  const triedDirect = useRef(false);

  // Reset when the feed URL changes
  useEffect(() => {
    triedDirect.current = false;
    setSrc(googleUrl);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feedUrl, feedLink]);

  function handleError() {
    if (!triedDirect.current && directUrl) {
      triedDirect.current = true;
      setSrc(directUrl);
    } else {
      setSrc(null); // trigger fallback icon
    }
  }

  if (!src) {
    return <Rss className="h-3.5 w-3.5 text-white drop-shadow" />;
  }

  return (
    <img
      src={src}
      alt=""
      width={16}
      height={16}
      onError={handleError}
      className="h-4 w-4 rounded-sm object-contain"
    />
  );
}

interface Props {
  widget: FeedWidget;
  effectiveStyle: TileStyle;
  highlightNew: boolean;
  onRemove: () => void;
  onUpdate: (patch: Partial<FeedWidget>) => void;
}

const REFRESH_MS = 10 * 60 * 1000;

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
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
  effectiveStyle,
  highlightNew,
  onRemove,
  onUpdate,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const style = effectiveStyle;
  const { isVisited, markVisited } = useVisited();
  const { computeNew } = useSeenItems(widget.url);

  // Per-render set of links flagged as "new" (after fetch).
  const [newLinks, setNewLinks] = useState<Set<string>>(new Set());
  // After mouse-move dismissal, mark items as "fading" to shorten the fade.
  const [fading, setFading] = useState(false);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: widget.id });

  const dragStyle = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const query = useQuery({
    queryKey: ["feed", widget.url],
    queryFn: () => fetchFeed(widget.url),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    const offset = hashStr(widget.id) % REFRESH_MS;
    let interval: ReturnType<typeof setInterval> | undefined;
    const timeout = setTimeout(() => {
      query.refetch();
      interval = setInterval(() => query.refetch(), REFRESH_MS);
    }, offset);
    return () => {
      clearTimeout(timeout);
      if (interval) clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [widget.id]);

  // Whenever fetched data updates, recompute newly-arrived links.
  const dataKey = query.data?.fetchedAt;
  useEffect(() => {
    if (!query.data) return;
    if (!highlightNew) {
      setNewLinks(new Set());
      return;
    }
    const links = query.data.items.map((i) => i.link).filter(Boolean);
    const fresh = computeNew(links);
    setNewLinks(fresh);
    setFading(false);
    // Auto-clear after the CSS fade completes (~6s) to keep DOM clean.
    const t = setTimeout(() => setNewLinks(new Set()), 6500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataKey, highlightNew]);

  // On mouse activity over the card, fade highlights faster.
  function handleMouseMove() {
    if (!newLinks.size || fading) return;
    if (dismissTimer.current) return;
    dismissTimer.current = setTimeout(() => {
      setFading(true);
      setTimeout(() => setNewLinks(new Set()), 1300);
      dismissTimer.current = null;
    }, 1500);
  }

  useEffect(() => {
    return () => {
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
    };
  }, []);

  const title =
    widget.customTitle ??
    query.data?.title ??
    (() => {
      try {
        return new URL(widget.url).hostname.replace(/^www\./, "");
      } catch {
        return widget.url;
      }
    })();

  const itemPadding = useMemo(() => {
    switch (style) {
      case "mini":
        return "flex items-center gap-2 px-3 py-0.5";
      case "compact":
        return "flex items-center gap-2 px-3 py-1.5";
      case "condensed":
        return "block px-4 py-2";
      default:
        return "block px-4 py-3";
    }
  }, [style]);

  const maxH =
    style === "mini"
      ? "max-h-64"
      : style === "compact"
      ? "max-h-80"
      : "max-h-[28rem]";

  return (
    <div
      ref={setNodeRef}
      style={dragStyle}
      onMouseMove={handleMouseMove}
      className="glass rounded-xl flex flex-col overflow-hidden shadow-[var(--shadow-card)] transition hover:border-primary/30 group"
    >
      <header className="flex items-center gap-2 px-4 py-3 border-b border-border bg-surface/50">
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing p-1 -ml-1 rounded hover:bg-secondary text-muted-foreground"
          aria-label="Drag to reorder"
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>
        <div className="h-7 w-7 rounded-md flex items-center justify-center bg-[var(--gradient-primary)] shadow-[var(--shadow-glow)] shrink-0">
          <FeedFavicon feedLink={query.data?.link} feedUrl={widget.url} />
        </div>
        {query.data?.link ? (
          <a
            href={query.data.link}
            target="_blank"
            rel="noopener noreferrer"
            className="font-display font-semibold text-sm truncate flex-1 hover:text-primary hover:underline underline-offset-2 transition-colors"
            title={query.data.link}
          >
            {title}
          </a>
        ) : (
          <h3 className="font-display font-semibold text-sm truncate flex-1">
            {title}
          </h3>
        )}
        <div className="flex items-center opacity-0 group-hover:opacity-100 transition gap-0.5">
          <button
            onClick={() => setEditing(true)}
            className="p-1.5 rounded hover:bg-secondary"
            aria-label="Edit"
          >
            <Pencil className="h-3.5 w-3.5" />
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
            onClick={() => setConfirmOpen(true)}
            className="p-1.5 rounded hover:bg-destructive/20 text-destructive"
            aria-label="Remove"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </header>

      <div className={`flex-1 overflow-y-auto scroll-thin ${maxH}`}>
        {query.isLoading && (
          <div className="p-4 space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <div className="h-3 rounded bg-secondary/60 animate-pulse w-3/4" />
                {style === "full" && (
                  <div className="h-2 rounded bg-secondary/40 animate-pulse w-full" />
                )}
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
          </div>
        )}
        {query.data && (
          <ul>
            {query.data.items.map((item, i) => {
              const visited = isVisited(item.link);
              const isNew = highlightNew && newLinks.has(item.link);
              return (
                <li
                  key={i}
                  className={`border-b border-border last:border-b-0 hover:bg-secondary/40 transition ${
                    isNew ? `new-item${fading ? " fading" : ""}` : ""
                  }`}
                >
                  <a
                    href={item.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => markVisited(item.link)}
                    onAuxClick={() => markVisited(item.link)}
                    className={itemPadding}
                  >
                    {style === "compact" || style === "mini" ? (
                      <>
                        <span
                          className={`feed-item-title flex-1 truncate ${
                            style === "mini" ? "text-[11px]" : "text-xs"
                          }`}
                          data-visited={visited ? "true" : "false"}
                        >
                          {item.title}
                        </span>
                        {item.pubDate && style !== "mini" && (
                          <span className="text-[10px] text-muted-foreground shrink-0">
                            {timeAgo(item.pubDate)}
                          </span>
                        )}
                      </>
                    ) : (
                      <>
                        <div className="flex items-start gap-2">
                          <span
                            className="feed-item-title text-sm leading-snug flex-1"
                            data-visited={visited ? "true" : "false"}
                          >
                            {item.title}
                          </span>
                          <ExternalLink className="h-3 w-3 mt-1 opacity-40 shrink-0" />
                        </div>
                        {style === "full" && item.description && (
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                            {item.description}
                          </p>
                        )}
                        <div className="flex items-center gap-2 mt-1.5 text-[10px] uppercase tracking-wider text-muted-foreground/80">
                          {style === "full" && item.author && (
                            <>
                              <span>{item.author}</span>
                              {item.pubDate && <span>·</span>}
                            </>
                          )}
                          {item.pubDate && <span>{timeAgo(item.pubDate)}</span>}
                        </div>
                      </>
                    )}
                  </a>
                </li>
              );
            })}
            {query.data.items.length === 0 && (
              <p className="p-4 text-xs text-muted-foreground">
                No items in this feed.
              </p>
            )}
          </ul>
        )}
      </div>

      <EditFeedDialog
        widget={widget}
        open={editing}
        onClose={() => setEditing(false)}
        onSave={onUpdate}
      />

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Remove this feed?"
        description={`"${title}" will be removed from this tab. You can always add it back later.`}
        confirmLabel="Remove"
        onConfirm={() => {
          setConfirmOpen(false);
          onRemove();
        }}
      />
    </div>
  );
}
