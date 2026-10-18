// Compact, stable identifier for a link (about 11 characters instead of ~100).
// Used for the "visited" list so the stored document stays far below Firestore's
// 1 MiB limit and each save moves less data. It is a 53-bit hash: a collision
// would only mean one article is shown as "visited" by mistake, and the chance is
// negligible for a few thousand links.

function cyrb53(str: string): number {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

/** Identifier of a link: lowercase letters and digits only (never contains ":" or "/"). */
export function linkId(link: string): string {
  return cyrb53(link).toString(36);
}

/**
 * Accepts what is stored in the database: a compact id as is, or an older full
 * address (which contains ":" and "/") converted to its id.
 */
export function toLinkId(stored: string): string {
  return /[:/]/.test(stored) ? linkId(stored) : stored;
}
