import { useEffect, useState } from "react";
import { subscribeAuth, signInWithGoogle, signOut, type User } from "./firebase";

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return subscribeAuth((u) => {
      setUser(u);
      setLoading(false);
    });
  }, []);

  return { user, loading, signInWithGoogle, signOut };
}
