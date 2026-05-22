import { useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import type { FeedWidget, TileStyle } from "@/lib/rss";

interface Props {
  widget: FeedWidget;
  open: boolean;
  onClose: () => void;
  onSave: (patch: Partial<FeedWidget>) => void;
}

const STYLES: { value: TileStyle; label: string; desc: string }[] = [
  { value: "full", label: "Full", desc: "Title, excerpt & meta" },
  { value: "condensed", label: "Condensed", desc: "Titles only" },
  { value: "compact", label: "Compact", desc: "Tight one-line list" },
  { value: "mini", label: "Mini", desc: "Smallest, ultra-dense" },
];


export function EditFeedDialog({ widget, open, onClose, onSave }: Props) {
  const [title, setTitle] = useState(widget.customTitle ?? "");
  const [url, setUrl] = useState(widget.url);
  const [style, setStyle] = useState<TileStyle>(widget.style ?? "full");

  if (!open) return null;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    onSave({
      customTitle: title.trim() || undefined,
      url: url.trim(),
      style,
    });
    onClose();
  }

  if (typeof document === "undefined") return null;

  const dialog = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/70 backdrop-blur-sm animate-in fade-in"
      onClick={onClose}
    >
      <div
        className="glass rounded-2xl w-full max-w-lg shadow-[var(--shadow-card)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h2 className="font-display text-lg font-semibold">Edit feed</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded hover:bg-secondary"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={submit} className="p-5 space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium block">Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Custom title (optional)"
              className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-ring/30"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium block">Feed URL</label>
            <input
              type="url"
              required
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-ring/30"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium block">Display style</label>
            <div className="grid grid-cols-2 gap-2">
              {STYLES.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => setStyle(s.value)}
                  className={`text-left rounded-lg border p-3 transition ${
                    style === s.value
                      ? "border-primary bg-primary/10 shadow-[var(--shadow-glow)]"
                      : "border-border hover:border-primary/50 bg-secondary/40"
                  }`}
                >
                  <p className="text-sm font-medium">{s.label}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {s.desc}
                  </p>
                </button>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-md text-sm hover:bg-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90"
            >
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
