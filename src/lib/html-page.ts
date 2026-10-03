import {
  embedApiScript,
  embedThemeCss,
  splitEmbedState,
  withEmbedState,
} from "./embed-state";

/**
 * HTML pages: a page whose whole content is one HTML document instead of
 * markdown. Stored like any page (same file, same sync) and recognised by
 * its first tag, so agents make one just by writing `<!doctype html>…`.
 * It runs full-size in a sandboxed frame with the same `--ck-*` theme
 * variables and `cotenk.save()` state as embeds.
 */

const HTML_PAGE_RE = /^\s*(<!doctype\s+html|<html[\s>])/i;

export const isHtmlPage = (content: string) => HTML_PAGE_RE.test(content);

export const HTML_PAGE_TEMPLATE = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body { max-width: 720px; margin: 0 auto; padding: 56px 32px; }
  h1 { font-size: 30px; letter-spacing: -0.02em; margin: 0 0 8px; }
  p { color: var(--ck-ink-2); margin: 0 0 24px; }
  button {
    font: inherit; padding: 8px 16px; border: 0; border-radius: 8px;
    background: var(--ck-accent); color: var(--ck-on-accent); cursor: pointer;
  }
</style>
</head>
<body>
  <h1>Hello</h1>
  <p>This page is plain HTML, CSS and JavaScript. Edit the code, or ask
  the agent to build something here. var(--ck-…) colours follow the theme.</p>
  <button id="counter"></button>
  <script>
    // cotenk.save() keeps state in the page, cotenk.state reads it back.
    let n = (cotenk.state && cotenk.state.n) || 0;
    const btn = document.getElementById("counter");
    const show = () => (btn.textContent = "Clicked " + n + "×");
    btn.onclick = () => { n++; show(); cotenk.save({ n }); };
    show();
  </script>
</body>
</html>
`;

/**
 * The page as the frame runs it: theme variables, a quiet base style
 * (zero specificity, so the page's own CSS wins) and the cotenk API go
 * into <head>.
 */
export function htmlPageDoc(
  content: string,
  scheme: string,
  /** Replaces the in-app cotenk API (exported sites bring their own). */
  api?: (state: string | null) => string,
): string {
  const { body, state } = splitEmbedState(content);
  const inject = `<style>${embedThemeCss(scheme)}:where(body){margin:0;color:var(--ck-ink);background:var(--ck-canvas);font:15px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif}</style>${(api ?? embedApiScript)(state)}`;
  const head = /<head(\s[^>]*)?>/i.exec(body);
  if (head) {
    const at = head.index + head[0].length;
    return body.slice(0, at) + inject + body.slice(at);
  }
  const html = /<html(\s[^>]*)?>/i.exec(body);
  if (html) {
    const at = html.index + html[0].length;
    return `${body.slice(0, at)}<head>${inject}</head>${body.slice(at)}`;
  }
  return inject + body;
}

/** An embed block's HTML as a page of its own (saved state comes along). */
export function embedAsHtmlPage(html: string): string {
  const { body, state } = splitEmbedState(html);
  const page = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>body { max-width: 760px; margin: 0 auto; padding: 48px 32px; }</style>
</head>
<body>
${body.trim()}
</body>
</html>
`;
  return state ? withEmbedState(page, state) : page;
}
