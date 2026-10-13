import { AlertTriangle, Check, CloudOff, Loader2, UserX } from "lucide-react";
import type { SyncInfo } from "@/lib/useDashboard";

/** Small pill next to the account button: tells the user whether their work is saved. */
export function SyncIndicator({ sync }: { sync: SyncInfo }) {
  const { status } = sync;
  const base =
    "hidden md:inline-flex h-7 items-center gap-1.5 px-2.5 rounded-full border text-[11px] font-medium select-none";

  if (status === "synced") {
    return (
      <span className={`${base} border-border text-muted-foreground`} title="All changes are saved">
        <Check className="h-3 w-3 text-primary" /> Saved
      </span>
    );
  }
  if (status === "loading") {
    return (
      <span className={`${base} border-border text-muted-foreground`} title="Loading your dashboard">
        <Loader2 className="h-3 w-3 animate-spin" /> Loading
      </span>
    );
  }
  if (status === "saving") {
    const offline = typeof navigator !== "undefined" && navigator.onLine === false;
    return (
      <span
        className={`${base} border-amber-500/40 text-amber-500`}
        title={offline ? "You are offline: changes will be saved when you reconnect" : "Saving your changes"}
      >
        <Loader2 className="h-3 w-3 animate-spin" /> {offline ? "Offline" : "Saving…"}
      </span>
    );
  }
  if (status === "guest") {
    return (
      <span className={`${base} border-amber-500/40 text-amber-500`} title="Sign in to save your dashboard">
        <UserX className="h-3 w-3" /> Not saved
      </span>
    );
  }
  if (status === "offline") {
    return (
      <span className={`${base} border-amber-500/40 text-amber-500`} title="Can't reach your saved dashboard">
        <CloudOff className="h-3 w-3" /> Offline
      </span>
    );
  }
  return (
    <span className={`${base} border-destructive/40 text-destructive`} title="Your latest changes are not saved">
      <AlertTriangle className="h-3 w-3" /> Not saved
    </span>
  );
}

function bannerContent(sync: SyncInfo): { tone: "warn" | "danger"; text: string } | null {
  switch (sync.status) {
    case "guest":
      return {
        tone: "warn",
        text: "You're not signed in. Changes are kept only in this tab and will be lost when you reload. Sign in to save your dashboard.",
      };
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
    <div role="status" className={`mb-4 flex items-start gap-3 rounded-lg border px-4 py-3 text-sm ${tone}`}>
      <AlertTriangle
        className={`h-4 w-4 mt-0.5 shrink-0 ${content.tone === "danger" ? "text-destructive" : "text-amber-500"}`}
      />
      <p>{content.text}</p>
    </div>
  );
}
