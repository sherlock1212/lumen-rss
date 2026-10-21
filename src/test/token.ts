// A Firebase-looking ID token for tests. Only the middle part matters to our code; the
// signature is fake because Firestore (not our code) is what really checks it.
const b64url = (o: unknown) =>
  btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(o))))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

export function fakeToken(
  email = "me@example.com",
  expiresInSeconds = 3600,
  now = Date.now(),
  extra: Record<string, unknown> = {},
): string {
  const exp = Math.floor(now / 1000) + expiresInSeconds;
  return `${b64url({ alg: "RS256" })}.${b64url({ email, exp, email_verified: true, ...extra })}.sig`;
}
