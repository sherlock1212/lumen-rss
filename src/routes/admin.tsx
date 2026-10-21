import { useState, type FormEvent } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Loader2, Plus, ShieldAlert, Sparkles, Trash2 } from "lucide-react";
import { AccessGate } from "@/components/AccessGate";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { UserMenu } from "@/components/UserMenu";
import { useAccessInfo } from "@/lib/useAccess";
import { useAllowlist } from "@/lib/useAllowlist";

export const Route = createFileRoute("/admin")({
  ssr: false,
  head: () => ({ meta: [{ title: "Manage access — Lumen" }] }),
  component: AdminPage,
});

function AdminPage() {
  return (
    <AccessGate>
      <AdminContent />
    </AccessGate>
  );
}

function AdminContent() {
  const access = useAccessInfo();

  return (
    <div className="min-h-full flex flex-col">
      <header className="app-header sticky top-0 z-40">
        <div className="flex items-center gap-3 px-4 md:px-6 py-3">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-lg flex items-center justify-center bg-[var(--gradient-primary)] shadow-[var(--shadow-glow)]">
              <Sparkles className="h-5 w-5 text-white drop-shadow" />
            </div>
            <h1 className="font-display text-lg font-bold leading-none text-gradient">Lumen</h1>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Link
              to="/"
              className="hover-border h-9 inline-flex items-center gap-1.5 px-3 rounded-md border border-border bg-surface/60 text-sm font-medium"
            >
              <ArrowLeft className="h-4 w-4" /> Dashboard
            </Link>
            <UserMenu />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 p-4 md:p-6">
        {access?.isAdmin ? (
          <AllowedList adminAddress={access.email} />
        ) : (
          <div role="alert" className="glass rounded-xl p-6 text-center">
            <ShieldAlert className="mx-auto mb-2 h-6 w-6 text-destructive" />
            <p className="font-display text-lg font-semibold">Administrators only</p>
            <p className="text-sm text-muted-foreground">
              Only the administrator can manage who has access.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}

function AllowedList({ adminAddress }: { adminAddress: string }) {
  const { people, error, add, remove } = useAllowlist();
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [toRemove, setToRemove] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFormError(null);
    try {
      await add(value, adminAddress);
      setValue("");
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-5">
      <div>
        <h2 className="font-display text-2xl font-bold">Manage access</h2>
        <p className="text-sm text-muted-foreground">
          Only you and the Google accounts listed here can open the dashboard. Use the address
          exactly as Google shows it for that account.
        </p>
      </div>

      <form onSubmit={submit} className="glass rounded-xl p-4 space-y-2">
        <label htmlFor="allow-email" className="text-sm font-medium">
          Add an email address
        </label>
        <div className="flex gap-2">
          <input
            id="allow-email"
            type="email"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="name@gmail.com"
            autoComplete="off"
            className="h-10 min-w-0 flex-1 rounded-md border border-input bg-background/60 px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
          <button
            type="submit"
            disabled={busy || !value.trim()}
            className="hover-border h-10 inline-flex items-center gap-1.5 px-4 rounded-md bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Add
          </button>
        </div>
        {formError && (
          <p role="alert" className="text-sm text-destructive">
            {formError}
          </p>
        )}
      </form>

      <div className="glass rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border bg-surface/50 text-sm font-medium">
          Allowed accounts{" "}
          {people && <span className="text-muted-foreground">({people.length})</span>}
        </div>
        {error ? (
          <p role="alert" className="p-4 text-sm text-destructive">
            Could not load the list: {error}
          </p>
        ) : people === null ? (
          <p role="status" className="p-4 text-sm text-muted-foreground flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </p>
        ) : people.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">Nobody yet.</p>
        ) : (
          <ul>
            {people.map((p) => (
              <li
                key={p.email}
                className="flex items-center gap-3 px-4 py-2.5 border-b border-border last:border-b-0"
              >
                <span className="min-w-0 flex-1 truncate text-sm">{p.email}</span>
                {p.isAdmin && (
                  <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
                    Administrator
                  </span>
                )}
                {p.addedAt && (
                  <span className="hidden sm:inline text-xs text-muted-foreground">
                    added {p.addedAt.toLocaleDateString()}
                  </span>
                )}
                {!p.isAdmin && (
                  <button
                    onClick={() => setToRemove(p.email)}
                    aria-label={`Remove ${p.email}`}
                    title="Remove"
                    className="p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-secondary"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <ConfirmDialog
        open={toRemove !== null}
        onOpenChange={(o) => !o && setToRemove(null)}
        title="Remove access?"
        description={`${toRemove ?? ""} will be signed out and will no longer be able to open the dashboard. Their saved data is kept, in case you allow them again.`}
        confirmLabel="Remove"
        onConfirm={() => {
          const email = toRemove;
          setToRemove(null);
          if (email) void remove(email);
        }}
      />
    </section>
  );
}
