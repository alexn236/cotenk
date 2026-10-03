import { useWorkspace } from "./store";
import { toast } from "./toast";
import { findDocByTitle } from "./wikilinks";
import { openExternal } from "./workspace";

/**
 * Navigation requests from sandboxed embeds and HTML pages (see
 * embedApiScript): open another CoTenk page by title, or a web link in
 * the system browser. Returns true when the message was one of them.
 */
export function handleFrameNavigation(data: unknown): boolean {
  const d = data as { cotenkOpenPage?: unknown; cotenkOpenUrl?: unknown } | null;
  if (typeof d?.cotenkOpenPage === "string") {
    const title = d.cotenkOpenPage.trim();
    const st = useWorkspace.getState();
    const doc = title ? findDocByTitle(st.docs, title) : null;
    if (doc) st.setActiveDoc(doc.id);
    else toast(`No page named “${title}”`, { tone: "error" });
    return true;
  }
  if (typeof d?.cotenkOpenUrl === "string") {
    openExternal(d.cotenkOpenUrl);
    return true;
  }
  return false;
}
