/**
 * Typed document blocks — the editing model on top of the raw markdown
 * that gets stored and synced. Storage stays markdown so agents and other
 * tools can keep reading/writing plain files.
 */

export type BlockType =
  | "paragraph"
  | "h1"
  | "h2"
  | "h3"
  | "bullet"
  | "numbered"
  | "todo"
  | "quote"
  | "code"
  | "divider"
  | "embed"
  | "image"
  | "file";

export type BlockData = {
  id: string;
  type: BlockType;
  /** Block text without the type marker. Empty for divider. */
  text: string;
  /** todo only. */
  checked?: boolean;
  /** code only — language tag on the fence. */
  lang?: string;
};

let blockCounter = 0;

/** Creates a block with a unique id. Only call from event handlers. */
export function createBlock(
  type: BlockType = "paragraph",
  text = "",
): BlockData {
  blockCounter += 1;
  return {
    id: `blk-${Date.now().toString(36)}-${blockCounter.toString(36)}`,
    type,
    text,
  };
}

const FENCE_RE = /^\s*(```|~~~)/;

/** True when a block reads as raw HTML → rendered as a sandboxed embed. */
export function looksLikeEmbed(md: string): boolean {
  const t = md.trim();
  if (t.length <= 6 || !/>$/.test(t)) return false;
  return /^(<!doctype[\s>]|<[a-zA-Z][a-zA-Z0-9-]*[\s>/])/i.test(t);
}

/** Tags that never have a closing pair. */
const VOID_TAGS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

const TAG_TOKEN =
  /<!--[\s\S]*?-->|<![^>]*>|<\/?[a-zA-Z][a-zA-Z0-9-]*(?:\s[^<>]*)?>/g;

/**
 * Rough open-tag depth of an HTML fragment — comments, doctypes,
 * processing instructions and self-closing/void tags don't count.
 * Used to decide whether a chunk's HTML continues in the next chunk.
 */
function openTagDepth(html: string): number {
  let depth = 0;
  for (const m of html.matchAll(TAG_TOKEN)) {
    const t = m[0];
    if (t.startsWith("<!--") || t.startsWith("<!") || t.endsWith("/>")) {
      continue;
    }
    if (t[1] === "/") {
      depth = Math.max(0, depth - 1);
    } else {
      const name = /^<([a-zA-Z][a-zA-Z0-9-]*)/.exec(t)![1].toLowerCase();
      if (!VOID_TAGS.has(name)) depth += 1;
    }
  }
  return depth;
}

/**
 * Parses markdown into typed blocks. Splits on blank lines first
 * (fence-aware), then decomposes each chunk: list items and task items
 * become one block per line, everything else maps to a single block.
 * Ids are positional — pure and safe inside a state initializer.
 */
export function parseBlocks(content: string): BlockData[] {
  const chunks: string[] = [];
  let current: string[] = [];
  let inFence = false;

  const flush = () => {
    const md = current.join("\n");
    if (md.trim().length > 0) chunks.push(md);
    current = [];
  };

  for (const line of content.split("\n")) {
    if (FENCE_RE.test(line)) inFence = !inFence;
    if (!inFence && line.trim() === "") flush();
    else current.push(line);
  }
  flush();

  // An HTML chunk with unclosed tags (e.g. a pasted full document whose
  // sections are separated by blank lines) swallows the following chunks
  // until its tags balance — mirrors how fences keep code together.
  const merged: string[] = [];
  for (let i = 0; i < chunks.length; i++) {
    let c = chunks[i];
    if (/^\s*<[a-zA-Z!]/.test(c)) {
      while (openTagDepth(c) > 0 && i + 1 < chunks.length) {
        c += "\n\n" + chunks[++i];
      }
    }
    merged.push(c);
  }

  const blocks: BlockData[] = [];
  let seq = 0;
  const push = (type: BlockType, text: string, extra?: Partial<BlockData>) =>
    blocks.push({ id: `blk-${seq++}`, type, text, ...extra });

  for (const chunk of merged) {
    const trimmed = chunk.trim();
    const lines = chunk.split("\n");

    // fenced code — always one block
    if (FENCE_RE.test(lines[0])) {
      const lang = lines[0].replace(FENCE_RE, "").trim();
      const body = lines.slice(1);
      if (FENCE_RE.test(body[body.length - 1] ?? "")) body.pop();
      push("code", body.join("\n"), { lang });
      continue;
    }

    // pure divider
    if (/^\s*([-*_])\1{2,}\s*$/.test(trimmed)) {
      push("divider", "");
      continue;
    }

    // a picture on its own: `![alt](src)`
    if (/^!\[[^\]\n]*\]\([^)\s]+\)$/.test(trimmed)) {
      push("image", trimmed);
      continue;
    }

    // an attached file: `[name](cotenk-file:path)`
    if (/^\[[^\]\n]+\]\(cotenk-file:[^)\s]+\)$/.test(trimmed)) {
      push("file", trimmed);
      continue;
    }

    // raw HTML embed
    if (looksLikeEmbed(trimmed)) {
      push("embed", trimmed);
      continue;
    }

    // a chunk of consecutive list items → one typed block per line
    const itemRe = /^(\s*)([-*+]|\d+\.)\s+(?:\[([ xX])\]\s+)?(.*)$/;
    const allItems = lines.every((l) => itemRe.test(l));
    if (allItems) {
      for (const line of lines) {
        const m = itemRe.exec(line)!;
        const marker = m[2];
        const check = m[3];
        const text = m[4];
        if (check !== undefined) {
          push("todo", text, { checked: check.toLowerCase() === "x" });
        } else if (/^\d+\.$/.test(marker)) {
          push("numbered", text);
        } else {
          push("bullet", text);
        }
      }
      continue;
    }

    const h = /^(#{1,3})\s+(.*)$/.exec(trimmed);
    if (h) {
      push((`h${h[1].length}`) as BlockType, h[2]);
      continue;
    }

    if (/^>\s?/.test(trimmed) && lines.every((l) => /^\s*>/.test(l))) {
      push(
        "quote",
        lines.map((l) => l.replace(/^\s*>\s?/, "")).join("\n"),
      );
      continue;
    }

    push("paragraph", chunk);
  }

  return blocks;
}

/** Serializes typed blocks back to markdown. Consecutive list-family
 *  blocks join tightly (single newline), everything else blank-line. */
export function serializeBlocks(blocks: BlockData[]): string {
  const isListish = (t: BlockType) =>
    t === "bullet" || t === "numbered" || t === "todo";

  const toMd = (b: BlockData): string => {
    switch (b.type) {
      case "h1":
        return `# ${b.text}`;
      case "h2":
        return `## ${b.text}`;
      case "h3":
        return `### ${b.text}`;
      case "bullet":
        return `- ${b.text}`;
      case "numbered":
        return `1. ${b.text}`;
      case "todo":
        return `- [${b.checked ? "x" : " "}] ${b.text}`;
      case "quote":
        return b.text
          .split("\n")
          .map((l) => `> ${l}`)
          .join("\n");
      case "code":
        return `\`\`\`${b.lang ?? ""}\n${b.text}\n\`\`\``;
      case "divider":
        return "---";
      case "embed":
        return b.text;
      default:
        return b.text;
    }
  };

  let out = "";
  let prev: BlockData | null = null;
  for (const b of blocks) {
    const md = toMd(b);
    if (md.trim() === "") continue;
    const tight = prev !== null && isListish(prev.type) && isListish(b.type);
    out += (prev === null ? "" : tight ? "\n" : "\n\n") + md;
    prev = b;
  }
  return out;
}
