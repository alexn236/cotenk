/**
 * Random ids for rows that reach the server (docs, folders, chats,
 * listings). Time + counter ids collided across users and devices —
 * two people creating a page in the same millisecond got the same id.
 */
export function newId(prefix?: string): string {
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : fallbackUuid();
  return prefix ? `${prefix}-${id}` : id;
}

/** RFC 4122 v4 from getRandomValues (older webviews lack randomUUID). */
function fallbackUuid(): string {
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
