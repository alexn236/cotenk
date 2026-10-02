import type { Doc } from "./types";

/**
 * `[[Page title]]` links between pages (Obsidian-compatible: `[[Title|
 * label]]` and `[[Title#Heading]]` work too). The source keeps the plain
 * brackets; for rendering they become `cotenk:page/…` links that the
 * markdown renderer resolves by title.
 */

const WIKILINK_RE = /\[\[([^[\]\n|#]+)(#[^[\]\n|]*)?(?:\|([^[\]\n]+))?\]\]/g;

export const PAGE_HREF = "cotenk:page/";

/** Case- and whitespace-insensitive title key. */
export const titleKey = (t: string) => t.trim().replace(/\s+/g, " ").toLowerCase();

/** Rewrites [[links]] outside code spans/fences into markdown links. */
export function linkifyWikilinks(md: string): string {
  if (!md.includes("[[")) return md;
  let inFence = false;
  return md
    .split("\n")
    .map((line) => {
      if (/^\s*(```|~~~)/.test(line)) {
        inFence = !inFence;
        return line;
      }
      if (inFence || !line.includes("[[")) return line;
      // Odd segments of a backtick split are inline code.
      return line
        .split("`")
        .map((seg, i) =>
          i % 2 === 1
            ? seg
            : seg.replace(WIKILINK_RE, (_m, title: string, _h?: string, label?: string) => {
                const text = (label ?? title).trim().replace(/[[\]]/g, "");
                return `[${text}](${PAGE_HREF}${encodeURIComponent(title.trim())})`;
              }),
        )
        .join("`");
    })
    .join("\n");
}

/**
 * Points [[old title]] links (outside code) at `to` — after a rename. The
 * heading and label parts of a link are kept.
 */
export function renameWikilinks(md: string, from: string, to: string): string {
  if (!md.includes("[[")) return md;
  const key = titleKey(from);
  let inFence = false;
  return md
    .split("\n")
    .map((line) => {
      if (/^\s*(```|~~~)/.test(line)) {
        inFence = !inFence;
        return line;
      }
      if (inFence || !line.includes("[[")) return line;
      return line
        .split("`")
        .map((seg, i) =>
          i % 2 === 1
            ? seg
            : seg.replace(
                WIKILINK_RE,
                (m, title: string, heading?: string, label?: string) =>
                  titleKey(title) === key
                    ? `[[${to}${heading ?? ""}${label ? `|${label}` : ""}]]`
                    : m,
              ),
        )
        .join("`");
    })
    .join("\n");
}

export function findDocByTitle(docs: Doc[], title: string): Doc | null {
  const key = titleKey(title);
  return docs.find((d) => titleKey(d.title || "Untitled") === key) ?? null;
}

/** Titles a page links to via [[…]]. */
export function outgoingTitles(content: string): string[] {
  return [...content.matchAll(WIKILINK_RE)].map((m) => m[1].trim());
}

/** Pages that link to `doc` with [[its title]], most recent first. */
export function backlinksTo(docs: Doc[], doc: Doc): Doc[] {
  const key = titleKey(doc.title);
  if (!key) return [];
  return docs
    .filter(
      (d) =>
        d.id !== doc.id &&
        d.content.includes("[[") &&
        outgoingTitles(d.content).some((t) => titleKey(t) === key),
    )
    .sort((a, b) => b.updatedAt - a.updatedAt);
}
