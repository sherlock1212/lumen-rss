import { getIdToken } from "./firebase";

/**
 * fetch() for our own server endpoints: adds the Firebase login token, which the server
 * checks. If the token was just rejected (it can expire while the tab sleeps) we ask for
 * a fresh one and try again once.
 */
export async function authFetch(input: string): Promise<Response> {
  const send = async (forceRefresh: boolean) => {
    const token = await getIdToken(forceRefresh);
    return fetch(input, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  };
  const res = await send(false);
  if (res.status !== 401) return res;
  return send(true);
}
