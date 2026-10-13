import { DatabaseBackup } from "lucide-react";
import { downloadJsonBackup, summarizeState } from "@/lib/backup";
import { EXPORT_INTERVAL_DAYS, SNOOZE_DAYS } from "@/lib/exportReminder";
import type { ExportReminder } from "@/lib/useExportReminder";
import type { DashboardState } from "@/lib/rss";

interface Props {
  reminder: ExportReminder;
  state: DashboardState;
  /**
   * True only when `state` is what is really stored (signed in and in sync).
   * Otherwise the file would not be a meaningful backup, so nothing is offered.
   */
  stateIsTrustworthy: boolean;
}

function message(daysSince: number | null) {
  if (daysSince === null) {
    return "You haven't downloaded a full backup yet. Keep a copy of your dashboard outside Firebase.";
  }
  if (daysSince >= EXPORT_INTERVAL_DAYS) {
    return `Your last full backup was ${daysSince} days ago. Time for a fresh one.`;
  }
  return "Time for a fresh backup.";
}

/** Monthly nudge to download the JSON backup. Hidden when there is nothing to back up. */
export function ExportReminderBanner({ reminder, state, stateIsTrustworthy }: Props) {
  if (!reminder.due || !stateIsTrustworthy) return null;
  const { feedCount, bookmarkCount } = summarizeState(state);
  if (feedCount + bookmarkCount === 0) return null;

  return (
    <div
      role="status"
      className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm"
    >
      <DatabaseBackup className="h-4 w-4 shrink-0 text-amber-500" />
      <p className="flex-1 min-w-[12rem]">{message(reminder.daysSince)}</p>
      <div className="flex items-center gap-2">
        <button
          onClick={() => {
            downloadJsonBackup(state);
            reminder.markExported();
          }}
          className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:opacity-90"
        >
          Download backup
        </button>
        <button
          onClick={reminder.snooze}
          className="px-3 py-1.5 rounded-md border border-border text-xs font-medium hover:bg-secondary"
        >
          Remind me in {SNOOZE_DAYS} days
        </button>
      </div>
    </div>
  );
}
