// Stand-in for ./useAuth: `auth.user` is the signed-in user (null = guest).
export const auth: { user: { uid: string } | null } = { user: { uid: "u1" } };
export const useAuth = () => ({ user: auth.user, loading: false });
