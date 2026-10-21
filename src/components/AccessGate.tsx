import { useEffect, useState, type ReactNode } from "react";
import { Loader2, LogIn, ShieldAlert, Sparkles } from "lucide-react";
import { useAuth } from "@/lib/useAuth";
import { AccessContext, useAccess } from "@/lib/useAccess";
import { rejectAccount } from "@/lib/firebase";

function Shell({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-full flex items-center justify-center p-6">
      <div className="glass rounded-2xl w-full max-w-sm p-8 text-center shadow-[var(--shadow-card)]">
        <div className="mx-auto mb-4 h-12 w-12 rounded-xl flex items-center justify-center bg-[var(--gradient-primary)] shadow-[var(--shadow-glow)]">
          <Sparkles className="h-6 w-6 text-white drop-shadow" />
        </div>
        <h1 className="font-display text-2xl font-bold text-gradient">Lumen</h1>
        <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-6">
          RSS Dashboard
        </p>
        {children}
      </div>
    </main>
  );
}

function Spinner({ label }: { label: string }) {
  return (
    <p
      role="status"
      className="flex items-center justify-center gap-2 text-sm text-muted-foreground"
    >
      <Loader2 className="h-4 w-4 animate-spin" /> {label}
    </p>
  );
}

function LoginScreen({
  refused,
  onSignIn,
}: {
  refused: string | null;
  onSignIn: () => Promise<unknown>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setBusy(true);
    setError(null);
    try {
      await onSignIn();
    } catch (e) {
      const code = (e as { code?: string }).code;
      // Closing the Google window is not an error worth showing.
      if (code !== "auth/popup-closed-by-user" && code !== "auth/cancelled-popup-request") {
        setError((e as Error).message);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell>
      <p className="text-sm text-muted-foreground mb-5">
        This is a private dashboard. Sign in with your Google account to continue.
      </p>
      {refused && (
        <div
          role="alert"
          className="mb-5 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-left text-sm"
        >
          <p className="flex items-center gap-2 font-medium text-destructive">
            <ShieldAlert className="h-4 w-4 shrink-0" /> Access not allowed
          </p>
          <p className="mt-1 text-muted-foreground">
            <span className="break-all">{refused}</span> is not enabled for this dashboard. Ask the
            administrator to add your address, then sign in again.
          </p>
        </div>
      )}
      {error && (
        <p role="alert" className="mb-4 text-sm text-destructive">
          {error}
        </p>
      )}
      <button
        onClick={handleClick}
        disabled={busy}
        className="hover-border w-full h-11 inline-flex items-center justify-center gap-2 rounded-md bg-primary text-primary-foreground text-sm font-semibold shadow-[var(--shadow-glow)] disabled:opacity-60"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
        Continue with Google
      </button>
    </Shell>
  );
}

/**
 * Everything inside is shown only to a signed-in person who is allowed in. Anybody else sees
 * the sign-in screen, and nothing of the dashboard (not even its code paths) runs for them.
 */
export function AccessGate({ children }: { children: ReactNode }) {
  const { user, loading, signInWithGoogle, signOut } = useAuth();
  const access = useAccess(user);
  const [refused, setRefused] = useState<string | null>(null);

  const deniedEmail = access.status === "denied" ? access.email || (user?.email ?? "") : null;
  useEffect(() => {
    if (!user || deniedEmail === null) return;
    setRefused(deniedEmail || "This account");
    void rejectAccount(user);
  }, [user, deniedEmail]);

  if (loading) {
    return (
      <Shell>
        <Spinner label="Loading…" />
      </Shell>
    );
  }

  if (!user || access.status === "denied") {
    return (
      <LoginScreen
        refused={refused}
        onSignIn={() => {
          setRefused(null);
          return signInWithGoogle();
        }}
      />
    );
  }

  if (access.status === "checking") {
    return (
      <Shell>
        <Spinner label="Checking your access…" />
        <button
          onClick={() => void signOut()}
          className="mt-4 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
        >
          Sign out
        </button>
      </Shell>
    );
  }

  if (access.status === "error") {
    return (
      <Shell>
        <p role="alert" className="text-sm text-destructive mb-4">
          Could not check your access: {access.message}
        </p>
        <button
          onClick={() => void signOut()}
          className="hover-border h-9 px-4 rounded-md border border-border bg-surface/60 text-sm"
        >
          Sign out
        </button>
      </Shell>
    );
  }

  if (access.status !== "allowed") {
    // Not reachable (signed-out was handled above); here only so the types are exact.
    return (
      <Shell>
        <Spinner label="Loading…" />
      </Shell>
    );
  }

  return (
    <AccessContext.Provider value={{ email: access.email, isAdmin: access.isAdmin }}>
      {children}
    </AccessContext.Provider>
  );
}
