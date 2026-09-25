export type Heading = {
  level: 1 | 2 | 3;
  text: string;
  slug: string;
};

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[`*_~[\]()]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

/** Extract h1-h3 headings from markdown source (skips fenced code blocks). */
export function extractHeadings(markdown: string): Heading[] {
  const out: Heading[] = [];
  let inFence = false;
  for (const line of markdown.split("\n")) {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const m = /^(#{1,3})\s+(.+?)\s*#*\s*$/.exec(line);
    if (m) {
      out.push({
        level: m[1].length as 1 | 2 | 3,
        text: m[2],
        slug: slugify(m[2]),
      });
    }
  }
  return out;
}
