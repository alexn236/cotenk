import { useMemo } from "react";
import { parseBlocks, serializeBlocks, type BlockData } from "@/lib/blocks";
import { decorateTaskLines } from "@/lib/tasks";
import { EmbedFrame } from "./block";
import { Markdown } from "./markdown";
import { HtmlPageFrame } from "./html-page";
import { isHtmlPage } from "@/lib/html-page";

/**
 * Read-only rendering of a page body — used for template previews. An
 * HTML page runs whole in its own frame.
 * Markdown blocks go through the shared renderer; embeds run in the same
 * sandboxed frame the editor uses.
 */
export function DocPreview({ content }: { content: string }) {
  const html = isHtmlPage(content);
  const parts = useMemo(() => {
    if (html) return [];
    // Consecutive non-embed blocks render as one markdown chunk so lists
    // and tables keep their rhythm.
    const out: (BlockData | BlockData[])[] = [];
    for (const b of parseBlocks(content)) {
      const last = out[out.length - 1];
      if (b.type === "embed") out.push(b);
      else if (Array.isArray(last)) last.push(b);
      else out.push([b]);
    }
    return out;
  }, [content, html]);

  if (html) {
    return (
      <div className="flex h-[60vh] overflow-hidden rounded-[8px] border border-line">
        <HtmlPageFrame content={content} title="HTML page preview" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {parts.map((p, i) =>
        Array.isArray(p) ? (
          <Markdown key={i}>{decorateTaskLines(serializeBlocks(p))}</Markdown>
        ) : (
          <EmbedFrame key={i} html={p.text} title="Embedded HTML" />
        ),
      )}
    </div>
  );
}
