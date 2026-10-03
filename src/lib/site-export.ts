import { strToU8, zipSync } from "fflate";
import { useWorkspace } from "./store";
import { saveBytes } from "./files";
import { htmlPageDoc, isHtmlPage } from "./html-page";
import { titleKey } from "./wikilinks";
import type { Doc } from "./types";

/**
 * "Export as website": an HTML page and every HTML page it links to
 * (directly or through other pages) as a static site in a .zip — the
 * chosen page becomes index.html, the others <slug>.html. Links between pages (`href="cotenk:page/<Title>"`) turn
 * into links between the files, so the folder can go straight onto any
 * static host (Netlify, GitHub Pages, a USB stick).
 */

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "page";

/** File name per HTML page (by title key); `start` is index.html. */
function fileNames(pages: Doc[], start: Doc): Map<string, string> {
  const out = new Map<string, string>();
  const used = new Set(["index"]);
  out.set(titleKey(start.title || "Untitled"), "index.html");
  for (const d of pages) {
    const key = titleKey(d.title || "Untitled");
    if (out.has(key)) continue;
    let name = slug(d.title || "page");
    for (let i = 2; used.has(name); i++) name = `${slug(d.title || "page")}-${i}`;
    used.add(name);
    out.set(key, `${name}.html`);
  }
  return out;
}

/** cotenk:page/<Title> links → the exported file (or nowhere). */
function rewriteLinks(html: string, files: Map<string, string>): string {
  return html.replace(/(href\s*=\s*["'])cotenk:page\/([^"'#]*)(#[^"']*)?/gi, (_m, pre: string, raw: string, hash = "") => {
    let title = raw;
    try {
      title = decodeURIComponent(raw);
    } catch {
      /* keep as written */
    }
    const file = files.get(titleKey(title));
    return `${pre}${file ? file + hash : "#"}`;
  });
}

/** The cotenk API outside the app: state in the visitor's browser. */
function standaloneApi(pageKey: string, files: Map<string, string>) {
  const map = JSON.stringify(Object.fromEntries(files)).replace(/</g, "\\u003c");
  const key = JSON.stringify(`cotenk:${pageKey}`);
  return (state: string | null) => {
    let initial = "null";
    if (state) {
      try {
        JSON.parse(state);
        initial = state.replace(/</g, "\\u003c");
      } catch {
        /* corrupt state — start fresh */
      }
    }
    return `<script>(function(){var K=${key},M=${map},s=${initial};try{var v=localStorage.getItem(K);if(v)s=JSON.parse(v)}catch(e){}window.cotenk={state:s,save:function(d){this.state=d;try{localStorage.setItem(K,JSON.stringify(d))}catch(e){}},openPage:function(t){var f=M[String(t).trim().replace(/\\s+/g," ").toLowerCase()];if(f)location.href=f},openUrl:function(u){window.open(u,"_blank","noopener")}}})();</script>`;
  };
}

/** Titles a page links to with href="cotenk:page/<Title>". */
function linkedTitles(html: string): string[] {
  return [...html.matchAll(/href\s*=\s*["']cotenk:page\/([^"'#]*)/gi)].map((m) => {
    try {
      return decodeURIComponent(m[1]);
    } catch {
      return m[1];
    }
  });
}

/** `start` plus the HTML pages reachable from it through links. */
function sitePages(start: Doc): Doc[] {
  const byKey = new Map(
    useWorkspace
      .getState()
      .docs.filter((d) => isHtmlPage(d.content))
      .map((d) => [titleKey(d.title || "Untitled"), d]),
  );
  const out = [start];
  const seen = new Set([titleKey(start.title || "Untitled")]);
  for (let i = 0; i < out.length; i++) {
    for (const t of linkedTitles(out[i].content)) {
      const key = titleKey(t);
      const d = byKey.get(key);
      if (d && !seen.has(key)) {
        seen.add(key);
        out.push(d);
      }
    }
  }
  return out;
}

/** Builds the site zip starting at `startId`. False if cancelled. */
export async function exportSite(startId: string): Promise<boolean> {
  const start = useWorkspace.getState().docs.find((d) => d.id === startId);
  if (!start || !isHtmlPage(start.content)) {
    throw new Error("Only HTML pages can be exported as a website.");
  }
  const pages = sitePages(start);
  const theme = useWorkspace.getState().theme;
  const files = fileNames(pages, start);
  const zip: Record<string, Uint8Array> = {};
  for (const d of pages) {
    const key = titleKey(d.title || "Untitled");
    const name = files.get(key);
    if (!name || zip[name]) continue;
    let html = htmlPageDoc(rewriteLinks(d.content, files), theme, standaloneApi(key, files));
    if (!/<title>/i.test(html)) {
      const t = (d.title.trim() || "Untitled").replace(/[<&]/g, (c) => (c === "<" ? "&lt;" : "&amp;"));
      html = html.replace(/<head(\s[^>]*)?>/i, (m) => `${m}<title>${t}</title>`);
    }
    zip[name] = strToU8(html);
  }
  const bytes = zipSync(zip, { level: 6 });
  return saveBytes(`${slug(start.title || "site")}-site.zip`, bytes, "application/zip");
}
