import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { fetchFeed, type FeedWidget } from "@/lib/rss";
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

interface Props {
  widget: FeedWidget;
  onRemove: () => void;
  onUpdate: (patch: Partial<FeedWidget>) => void;
}

const REFRESH_MS = 10 * 60 * 1000; // 10 minutes

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

export function FeedCard({ widget, onRemove, onUpdate }: Props) {
  const [editing, setEditing] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const style = widget.style ?? "full";

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

  // Staggered auto-refresh: offset each widget within a 10-minute window
  // based on a stable hash of its id, then refetch on a 10-min cadence.
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

  return (
    <div
      ref={setNodeRef}
      style={dragStyle}
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
          <Rss className="h-3.5 w-3.5 text-white drop-shadow" />
        </div>
        <h3 className="font-display font-semibold text-sm truncate flex-1">
          {title}
        </h3>
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

      <div
        className={`flex-1 overflow-y-auto scroll-thin ${
          style === "compact" ? "max-h-80" : "max-h-[28rem]"
        }`}
      >
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
            {query.data.items.map((item, i) => (
              <li
                key={i}
                className="border-b border-border last:border-b-0 hover:bg-secondary/40 transition"
              >
                <a
                  href={item.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={
                    style === "compact"
                      ? "flex items-center gap-2 px-3 py-1.5"
                      : style === "condensed"
                      ? "block px-4 py-2"
                      : "block px-4 py-3"
                  }
                >
                  {style === "compact" ? (
                    <>
                      <span className="text-xs flex-1 truncate">
                        {item.title}
                      </span>
                      {item.pubDate && (
                        <span className="text-[10px] text-muted-foreground shrink-0">
                          {timeAgo(item.pubDate)}
                        </span>
                      )}
                    </>
                  ) : (
                    <>
                      <div className="flex items-start gap-2">
                        <span className="text-sm font-medium leading-snug flex-1">
                          {item.title}
                        </span>
                        <ExternalLink className="h-3 w-3 mt-1 opacity-40 shrink-0" />
                      </div>
                      {style === "full" && item.description && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                          {item.description}
                        </p>
                      )}
                      {(style === "full" || style === "condensed") && (
                        <div className="flex items-center gap-2 mt-1.5 text-[10px] uppercase tracking-wider text-muted-foreground/80">
                          {style === "full" && item.author && (
                            <>
                              <span>{item.author}</span>
                              {item.pubDate && <span>·</span>}
                            </>
                          )}
                          {item.pubDate && <span>{timeAgo(item.pubDate)}</span>}
                        </div>
                      )}
                    </>
                  )}
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
