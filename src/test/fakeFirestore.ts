// A tiny in-memory stand-in for "firebase/firestore", used by the tests:
//   vi.mock("firebase/firestore", () => import("@/test/fakeFirestore"));
// `fs` lets a test push snapshots to the app and see what the app wrote.

type Listener = { ref: string; cb: (snap: unknown) => void; onError?: (e: unknown) => void };

export const fs = {
  listeners: [] as Listener[],
  /** every setDoc call, in order */
  sets: [] as { ref: string; data: any; options?: unknown }[],
  /** documents as the "server" holds them */
  store: new Map<string, any>(),
  deleted: [] as string[],
  reset() {
    fs.listeners = [];
    fs.sets = [];
    fs.store = new Map();
    fs.deleted = [];
  },
  /** listener on a document path ending with `suffix` (e.g. "data/seen") */
  on(suffix: string) {
    const l = fs.listeners.find((x) => x.ref.endsWith(suffix));
    if (!l) throw new Error(`no listener on *${suffix}`);
    return l;
  },
};

/** What the app sees in onSnapshot: `data === null` means "document does not exist". */
export function snap(data: unknown, fromCache = false) {
  return {
    metadata: { fromCache },
    exists: () => data !== null,
    data: () => (data === null ? undefined : data),
  };
}

export const db = {};
export const doc = (_db: unknown, ...p: string[]) => p.join("/");
export const collection = (_db: unknown, ...p: string[]) => p.join("/");
export const serverTimestamp = () => "SERVER_TIMESTAMP";

export const onSnapshot = (ref: string, a: any, b?: any, c?: any) => {
  const cb = typeof a === "function" ? a : b;
  const onError = typeof a === "function" ? b : c;
  const l: Listener = { ref, cb, onError };
  fs.listeners.push(l);
  return () => {
    fs.listeners = fs.listeners.filter((x) => x !== l);
  };
};

export const setDoc = async (ref: string, data: unknown, options?: unknown) => {
  fs.sets.push({ ref, data, options });
  fs.store.set(ref, data);
};

export const getDoc = async (ref: string) => ({
  exists: () => fs.store.has(ref),
  data: () => fs.store.get(ref),
});

export const getDocs = async (col: string) => {
  const ids = [...fs.store.keys()]
    .filter((k) => k.startsWith(col + "/") && !k.slice(col.length + 1).includes("/"))
    .map((k) => k.slice(col.length + 1));
  return { docs: ids.map((id) => ({ id, data: () => fs.store.get(`${col}/${id}`) })) };
};

export const deleteDoc = async (ref: string) => {
  fs.deleted.push(ref);
  fs.store.delete(ref);
};
