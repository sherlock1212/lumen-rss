import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { LogOut, Loader2, ShieldCheck } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useAuth } from "@/lib/useAuth";
import { useAccessInfo } from "@/lib/useAccess";

/** The round profile picture. It opens a small menu: access management (admin only) and sign out. */
export function UserMenu() {
  const { user, loading, signOut } = useAuth();
  const [busy, setBusy] = useState(false);
  const access = useAccessInfo();

  if (loading || !user) {
    return (
      <div className="h-9 w-9 flex items-center justify-center text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
      </div>
    );
  }

  const name = user.displayName ?? user.email ?? "Account";
  const isAdmin = access?.isAdmin ?? false;

  async function handleSignOut() {
    setBusy(true);
    try {
      await signOut();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          title={name}
          aria-label="Account menu"
          className="hover-border h-9 w-9 inline-flex items-center justify-center rounded-full"
        >
          {user.photoURL ? (
            <img
              src={user.photoURL}
              alt=""
              className="h-8 w-8 rounded-full border border-border"
              referrerPolicy="no-referrer"
            />
          ) : (
            <span className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center text-xs font-semibold">
              {name.charAt(0).toUpperCase()}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-2">
        <div className="px-2 py-1.5">
          <p className="truncate text-sm font-medium">{user.displayName ?? "Signed in"}</p>
          {user.email && <p className="truncate text-xs text-muted-foreground">{user.email}</p>}
        </div>
        <div className="my-1 h-px bg-border" />
        {isAdmin && (
          <Link
            to="/admin"
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-secondary transition"
          >
            <ShieldCheck className="h-4 w-4" /> Manage access
          </Link>
        )}
        <button
          onClick={handleSignOut}
          disabled={busy}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-secondary transition disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
          Sign out
        </button>
      </PopoverContent>
    </Popover>
  );
}
