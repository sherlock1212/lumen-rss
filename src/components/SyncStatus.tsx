import { AlertTriangle, Check, CloudOff, Loader2 } from "lucide-react";
import type { SyncInfo } from "@/lib/useDashboard";

/**
 * Small round indicator next to the account button: tells the user whether their
 * work is saved. The normal states (saved / saving / loading) are icon-only, the
 * text is kept for screen readers and the tooltip. Problems keep a visible label.
 */
export function SyncIndicator({ sync }: { sync: SyncInfo }) {
  const { status } = sync;
  const base =
    "hidden md:inline-flex h-7 items-center justify-center rounded-full border text-[11px] font-medium select-none";
  const quiet = `${base} w-7 border-border text-muted-foreground`;
  const warn = `${base} gap-1.5 px-2.5 border-amber-500/40 text-amber-500`;

  if (status === "synced") {
    return (
      <span role="status" className={quiet} title="All changes are saved">
        <Check className="h-3.5 w-3.5 text-primary" />
        <span className="sr-only">Saved</span>
      </span>
    );
  }
  if (status === "loading") {
    return (
      <span role="status" className={quiet} title="Loading your dashboard">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        <span className="sr-only">Loading</span>
      </span>
    );
  }
  if (status === "saving") {
    const offline = typeof navigator !== "undefined" && navigator.onLine === false;
    if (offline) {
      return (
        <span
          role="status"
          className={warn}
          title="You are offline: changes will be saved when you reconnect"
        >
          <Loader2 className="h-3 w-3 animate-spin" /> Offline
        </span>
      );
    }
    return (
      <span role="status" className={quiet} title="Saving your changes">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        <span className="sr-only">Saving</span>
      </span>
    );
  }
  if (status === "offline") {
    return (
      <span role="status" className={warn} title="Can't reach your saved dashboard">
        <CloudOff className="h-3 w-3" /> Offline
      </span>
    );
  }
  return (
    <span
      role="status"
      className={`${base} gap-1.5 px-2.5 border-destructive/40 text-destructive`}
      title="Your latest changes are not saved"
    >
      <AlertTriangle className="h-3 w-3" /> Not saved
    </span>
  );
}

function bannerContent(sync: SyncInfo): { tone: "warn" | "danger"; text: string } | null {
  switch (sync.status) {
    case "offline":
      return {
        tone: "warn",
        text: "Can't reach your saved dashboard right now. Editing is paused so nothing gets overwritten. Check your connection (or any ad-blocker / VPN that blocks Google services), then reload.",
      };
    case "error":
      if (sync.issue === "unreadable") {
        return {
          tone: "danger",
          text: "Your saved dashboard couldn't be read, so nothing was changed or overwritten. Restore it from Data → Import (automatic backups or a backup file).",
        };
      }
      if (sync.issue === "permission-denied") {
        return {
          tone: "danger",
          text: "The database refused access to your data (permission denied). Check the Firestore security rules and that you're signed in with the right account.",
        };
      }
      return {
        tone: "danger",
        text: "Your latest changes could not be saved. Lumen keeps trying — don't close this tab. If it persists, export a backup from Data → Export.",
      };
    default:
      return null;
  }
}

/** Full-width notice, shown only when there is something the user needs to know. */
export function SyncBanner({ sync }: { sync: SyncInfo }) {
  const content = bannerContent(sync);
  if (!content) return null;
  const tone =
    content.tone === "danger"
      ? "border-destructive/40 bg-destructive/10 text-foreground"
      : "border-amber-500/40 bg-amber-500/10 text-foreground";
  return (
    <div
      role="status"
      className={`mb-4 flex items-start gap-3 rounded-lg border px-4 py-3 text-sm ${tone}`}
    >
      <AlertTriangle
        className={`h-4 w-4 mt-0.5 shrink-0 ${content.tone === "danger" ? "text-destructive" : "text-amber-500"}`}
      />
      <p>{content.text}</p>
    </div>
  );
}
