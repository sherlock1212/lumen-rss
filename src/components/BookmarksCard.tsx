import { useState, useEffect, useRef } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Check, GripVertical, Star, Trash2, Plus, X, Pencil } from "lucide-react";
import type { FeedWidget, Bookmark } from "@/lib/rss";
import { ConfirmDialog } from "./ConfirmDialog";

interface Props {
  widget: FeedWidget;
  onRemove: () => void;
  onUpdate: (patch: Partial<FeedWidget>) => void;
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function BookmarkFavicon({ url }: { url: string }) {
  const origin = (() => {
    try {
      return new URL(url).origin;
    } catch {
      return null;
    }
  })();
  const googleUrl = origin
    ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(origin)}&sz=32`
    : null;
  const [src, setSrc] = useState<string | null>(googleUrl);
  const triedDirect = useRef(false);

  useEffect(() => {
    triedDirect.current = false;
    setSrc(googleUrl);
  }, [url]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!src) return <div className="h-4 w-4 rounded-sm bg-muted-foreground/20" />;
  return (
    <img
      src={src}
      alt=""
      width={16}
      height={16}
      onError={() => {
        if (!triedDirect.current && origin) {
          triedDirect.current = true;
          setSrc(`${origin}/favicon.ico`);
        } else {
          setSrc(null);
        }
      }}
      className="h-4 w-4 rounded-sm object-contain shrink-0"
    />
  );
}

/** The label used when none is given: the site name, e.g. "example.com". */
function hostnameTitle(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

interface RowProps {
  bookmark: Bookmark;
  onRename: (id: string, title: string) => void;
  onAskRemove: (bookmark: Bookmark) => void;
}

/** One bookmark: the link, plus buttons to rename it or remove it (after a confirmation). */
function BookmarkRow({ bookmark, onRename, onAskRemove }: RowProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(bookmark.title);
  // Set as soon as an edit is finished (saved or cancelled), so that the blur which follows
  // the input disappearing cannot save a second time or undo a cancel.
  const finished = useRef(false);

  function start() {
    finished.current = false;
    setDraft(bookmark.title);
    setEditing(true);
  }

  function save() {
    if (finished.current) return;
    finished.current = true;
    // An empty label falls back to the site name, as when the bookmark is added.
    const next = draft.trim() || hostnameTitle(bookmark.url);
    setEditing(false);
    if (next !== bookmark.title) onRename(bookmark.id, next);
  }

  function cancel() {
    finished.current = true;
    setEditing(false);
  }

  if (editing) {
    return (
      <li className="flex items-center gap-2.5 px-3 py-1.5 border-b border-border last:border-b-0 bg-secondary/30">
        <BookmarkFavicon url={bookmark.url} />
        <form
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
          className="flex-1 flex items-center gap-1 min-w-0"
        >
          <input
            autoFocus
            aria-label="Bookmark label"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onFocus={(e) => e.currentTarget.select()}
            onBlur={save}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                cancel();
              }
            }}
            className="flex-1 min-w-0 bg-input border border-border rounded px-2 py-0.5 text-sm outline-none focus:border-primary"
          />
          {/* mousedown is stopped so the input keeps focus: otherwise its blur would save first */}
          <button
            type="submit"
            aria-label="Save label"
            onMouseDown={(e) => e.preventDefault()}
            className="p-1 rounded hover:bg-secondary text-primary shrink-0"
          >
            <Check className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            aria-label="Cancel renaming"
            onMouseDown={(e) => e.preventDefault()}
            onClick={cancel}
            className="p-1 rounded hover:bg-secondary text-muted-foreground shrink-0"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </form>
      </li>
    );
  }

  const reveal =
    "opacity-0 group-hover/item:opacity-100 group-focus-within/item:opacity-100 focus-visible:opacity-100 transition shrink-0";
  return (
    <li className="group/item flex items-center gap-2.5 px-3 py-2 border-b border-border last:border-b-0 hover:bg-secondary/40 transition">
      <BookmarkFavicon url={bookmark.url} />
      <a
        href={bookmark.url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex-1 text-sm truncate hover:text-primary hover:underline underline-offset-2 transition-colors"
        title={bookmark.url}
      >
        {bookmark.title}
      </a>
      <button
        onClick={start}
        className={`${reveal} p-1 rounded hover:bg-secondary text-muted-foreground`}
        aria-label="Rename bookmark"
        title="Rename"
      >
        <Pencil className="h-3 w-3" />
      </button>
      <button
        onClick={() => onAskRemove(bookmark)}
        className={`${reveal} p-1 rounded hover:bg-destructive/20 text-destructive`}
        aria-label="Remove bookmark"
        title="Remove"
      >
        <X className="h-3 w-3" />
      </button>
    </li>
  );
}

export function BookmarksCard({ widget, onRemove, onUpdate }: Props) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(widget.customTitle ?? "Favourites");
  const [addOpen, setAddOpen] = useState(false);
  const [newUrl, setNewUrl] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  // The bookmark waiting for the "remove?" answer. The target is kept while the dialog closes,
  // so its text does not go blank during the fade-out.
  const [removeOpen, setRemoveOpen] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<Bookmark | null>(null);

  const bookmarks: Bookmark[] = widget.bookmarks ?? [];

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: widget.id,
  });

  const dragStyle = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  function saveTitle() {
    const t = titleDraft.trim() || "Favourites";
    onUpdate({ customTitle: t });
    setEditingTitle(false);
  }

  function handleAddBookmark(e: React.FormEvent) {
    e.preventDefault();
    const url = newUrl.trim();
    if (!url) return;
    let normalized = url;
    if (!normalized.startsWith("http://") && !normalized.startsWith("https://")) {
      normalized = `https://${normalized}`;
    }
    try {
      new URL(normalized);
    } catch {
      setAddError("Invalid URL");
      return;
    }
    const title = newTitle.trim() || hostnameTitle(normalized);
    onUpdate({ bookmarks: [...bookmarks, { id: uid(), url: normalized, title }] });
    setNewUrl("");
    setNewTitle("");
    setAddError(null);
    setAddOpen(false);
  }

  function removeBookmark(id: string) {
    onUpdate({ bookmarks: bookmarks.filter((b) => b.id !== id) });
  }

  function renameBookmark(id: string, title: string) {
    onUpdate({ bookmarks: bookmarks.map((b) => (b.id === id ? { ...b, title } : b)) });
  }

  return (
    <div
      ref={setNodeRef}
      style={dragStyle}
      className="tile glass rounded-xl flex flex-col overflow-hidden shadow-[var(--shadow-card)] transition hover:border-primary/30 group"
    >
      {/* Header */}
      <header className="flex items-center gap-2 px-4 py-3 border-b border-border bg-surface/50">
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing p-1 -ml-1 rounded hover:bg-secondary text-muted-foreground"
          aria-label="Drag to reorder"
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>

        {/* Star icon badge */}
        <div className="h-7 w-7 rounded-md flex items-center justify-center shadow-[var(--shadow-glow)] shrink-0">
          <Star className="h-3.5 w-3.5 text-white drop-shadow" fill="currentColor" />
        </div>

        {/* Editable title */}
        {editingTitle ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              saveTitle();
            }}
            className="flex-1 flex gap-1"
          >
            <input
              autoFocus
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={saveTitle}
              className="flex-1 bg-input border border-border rounded px-2 py-0.5 text-sm outline-none focus:border-primary min-w-0"
            />
          </form>
        ) : (
          <span
            className="font-display font-semibold text-sm truncate flex-1 cursor-text"
            onDoubleClick={() => {
              setTitleDraft(widget.customTitle ?? "Favourites");
              setEditingTitle(true);
            }}
            title="Double-click to rename"
          >
            {widget.customTitle ?? "Favourites"}
          </span>
        )}

        {/* Toolbar */}
        <div className="flex items-center opacity-0 group-hover:opacity-100 transition gap-0.5">
          <button
            onClick={() => {
              setTitleDraft(widget.customTitle ?? "Favourites");
              setEditingTitle(true);
            }}
            className="p-1.5 rounded hover:bg-secondary"
            aria-label="Rename"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => {
              setAddOpen(true);
              setNewUrl("");
              setNewTitle("");
              setAddError(null);
            }}
            className="p-1.5 rounded hover:bg-secondary"
            aria-label="Add bookmark"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setConfirmOpen(true)}
            className="p-1.5 rounded hover:bg-destructive/20 text-destructive"
            aria-label="Remove tile"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </header>

      {/* Bookmark list */}
      <div className="flex-1 overflow-y-auto scroll-thin max-h-[28rem]">
        {bookmarks.length === 0 && !addOpen && (
          <div className="p-4 text-center">
            <p className="text-xs text-muted-foreground mb-2">No bookmarks yet.</p>
            <button
              onClick={() => setAddOpen(true)}
              className="text-xs text-primary hover:underline"
            >
              + Add your first bookmark
            </button>
          </div>
        )}

        <ul>
          {bookmarks.map((b) => (
            <BookmarkRow
              key={b.id}
              bookmark={b}
              onRename={renameBookmark}
              onAskRemove={(bm) => {
                setRemoveTarget(bm);
                setRemoveOpen(true);
              }}
            />
          ))}
        </ul>

        {/* Inline add form */}
        {addOpen && (
          <form
            onSubmit={handleAddBookmark}
            className="p-3 border-t border-border space-y-2 bg-secondary/20"
          >
            <input
              autoFocus
              type="text"
              value={newUrl}
              onChange={(e) => {
                setNewUrl(e.target.value);
                setAddError(null);
              }}
              placeholder="URL (e.g. https://example.com)"
              className="w-full bg-input border border-border rounded px-2 py-1.5 text-xs outline-none focus:border-primary focus:ring-2 focus:ring-ring/30"
            />
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Label (optional — auto-detected from URL)"
              className="w-full bg-input border border-border rounded px-2 py-1.5 text-xs outline-none focus:border-primary focus:ring-2 focus:ring-ring/30"
            />
            {addError && <p className="text-xs text-destructive">{addError}</p>}
            <div className="flex gap-2">
              <button
                type="submit"
                className="flex-1 py-1.5 rounded bg-primary text-primary-foreground text-xs font-medium hover:opacity-90"
              >
                Add
              </button>
              <button
                type="button"
                onClick={() => setAddOpen(false)}
                className="flex-1 py-1.5 rounded border border-border text-xs hover:bg-secondary"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>

      <ConfirmDialog
        open={removeOpen}
        onOpenChange={setRemoveOpen}
        title="Remove this bookmark?"
        description={`"${removeTarget?.title ?? ""}" will be removed from this tile.`}
        confirmLabel="Remove"
        onConfirm={() => {
          setRemoveOpen(false);
          if (removeTarget) removeBookmark(removeTarget.id);
        }}
      />

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Remove this tile?"
        description={`"${widget.customTitle ?? "Favourites"}" and all its bookmarks will be removed.`}
        confirmLabel="Remove"
        onConfirm={() => {
          setConfirmOpen(false);
          onRemove();
        }}
      />
    </div>
  );
}
