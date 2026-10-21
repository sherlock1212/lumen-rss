// Stand-in for ./useAuth: `auth.user` is the signed-in user (null = signed out).
import { vi, type Mock } from "vitest";

export interface FakeUser {
  uid: string;
  email?: string | null;
  emailVerified?: boolean;
  displayName?: string | null;
  photoURL?: string | null;
}

export const auth: {
  user: FakeUser | null;
  loading: boolean;
  signInWithGoogle: Mock<(...a: unknown[]) => Promise<unknown>>;
  signOut: Mock<(...a: unknown[]) => Promise<unknown>>;
} = {
  user: { uid: "u1" },
  loading: false,
  signInWithGoogle: vi.fn(async () => ({})),
  signOut: vi.fn(async () => {}),
};

export const useAuth = () => ({
  user: auth.user,
  loading: auth.loading,
  signInWithGoogle: (...a: unknown[]) => auth.signInWithGoogle(...a),
  signOut: (...a: unknown[]) => auth.signOut(...a),
});
