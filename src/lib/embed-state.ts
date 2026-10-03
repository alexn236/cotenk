/**
 * Saved state for interactive embeds. A widget calls
 * `cotenk.save(data)`; the JSON lands inside the embed block itself as
 *
 *   <script type="application/json" data-cotenk-state>{…}</script>
 *
 * so it lives in the page file, syncs like any other edit and survives a
 * reload. On load the widget reads it back from `cotenk.state`.
 */

const STATE_RE =
  /\n?<script type="application\/json" data-cotenk-state>([\s\S]*?)<\/script>\s*$/;

/** Upper bound for one embed's state — it is stored in the page. */
export const MAX_EMBED_STATE = 64 * 1024;

export function splitEmbedState(html: string): {
  body: string;
  state: string | null;
} {
  const m = STATE_RE.exec(html);
  if (!m) return { body: html, state: null };
  return { body: html.slice(0, m.index), state: m[1] };
}

/** Returns the embed HTML with `json` as its saved state. */
export function withEmbedState(html: string, json: string): string {
  const { body } = splitEmbedState(html);
  // "<" escaped so the JSON can never close the script tag.
  const safe = json.replace(/</g, "\\u003c");
  return `${body}\n<script type="application/json" data-cotenk-state>${safe}</script>`;
}

/** Strips saved state — for comparisons that should ignore it. */
export const stripEmbedState = (text: string) =>
  text.replace(
    /\n?<script type="application\/json" data-cotenk-state>[\s\S]*?<\/script>/g,
    "",
  );

/**
 * Bootstrap injected before the embed's own HTML: exposes `cotenk.state`
 * (the saved value or null) and `cotenk.save(data)`.
 */
export function embedApiScript(state: string | null): string {
  let initial = "null";
  if (state) {
    try {
      JSON.parse(state);
      initial = state.replace(/</g, "\\u003c");
    } catch {
      /* corrupt state — start fresh */
    }
  }
  return `<script>window.cotenk={state:${initial},save:function(d){this.state=d;try{parent.postMessage({cotenkSave:JSON.stringify(d)},"*")}catch(e){}}};</script>`;
}

/** Theme tokens exposed to embeds as --ck-* CSS variables. */
const EMBED_TOKENS = [
  "canvas",
  "panel",
  "panel-2",
  "elev",
  "line",
  "ink",
  "ink-2",
  "ink-3",
  "accent",
  "accent-2",
  "accent-dim",
  "on-accent",
  "danger",
] as const;

export function embedThemeCss(scheme: string): string {
  if (typeof document === "undefined") return "";
  const cs = getComputedStyle(document.documentElement);
  const vars = EMBED_TOKENS.map(
    (t) => `--ck-${t}:${cs.getPropertyValue(`--${t}`).trim()}`,
  ).join(";");
  return `:root{${vars};color-scheme:${scheme}}`;
}
