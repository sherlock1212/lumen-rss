import { useState } from "react";
import { LogIn, LogOut, Loader2 } from "lucide-react";
import { useAuth } from "@/lib/useAuth";

export function UserMenu() {
  const { user, loading, signInWithGoogle, signOut } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSignIn() {
    setBusy(true);
    setError(null);
    try {
      await signInWithGoogle();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleSignOut() {
    setBusy(true);
    try {
      await signOut();
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="h-8 w-8 flex items-center justify-center text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <button
        onClick={handleSignIn}
        disabled={busy}
        title={error ?? "Sign in with Google"}
        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-border bg-surface/60 text-foreground text-xs font-medium hover:bg-secondary disabled:opacity-50"
      >
        {busy ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <LogIn className="h-3.5 w-3.5" />
        )}
        Sign in
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {user.photoURL ? (
        <img
          src={user.photoURL}
          alt={user.displayName ?? "User"}
          className="h-8 w-8 rounded-full border border-border"
          referrerPolicy="no-referrer"
        />
      ) : (
        <div className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center text-xs font-semibold">
          {(user.displayName ?? user.email ?? "?").charAt(0).toUpperCase()}
        </div>
      )}
      <button
        onClick={handleSignOut}
        disabled={busy}
        className="p-1.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground"
        title={`Sign out (${user.displayName ?? user.email})`}
        aria-label="Sign out"
      >
        <LogOut className="h-4 w-4" />
      </button>
    </div>
  );
}
