import type { Doc, Folder } from "./types";
import type { AgentKind } from "./agents";
import { docRelativePath } from "./file-sync";

/** Where each agent finds the full workspace guide (see extensions-runtime). */
const GUIDE: Record<AgentKind, string> = {
  claude: "the cotenk-workspace skill",
  devin:
    'the cotenk-workspace skill — load it with the load_skill tool of the "cotenk" MCP server, which also carries the tools of the MCP servers enabled in CoTenk',
};

/**
 * Workspace conventions handed to the agent on the first turn of a
 * chat. The agent works on the local mirror of the workspace, so these
 * rules are what keep its output readable by the CoTenk editor.
 */
export const workspacePreamble = (agent: AgentKind) =>
  WORKSPACE_PREAMBLE.replace("{guide}", GUIDE[agent]);

const WORKSPACE_PREAMBLE = `You are working inside a CoTenk workspace — a shared markdown workspace for people and agents. The current directory is the workspace root.

Conventions:
- Every page is a .md file. Subfolders are page folders (one level deep).
- Existing pages start with a frontmatter block (cotenk-id, title, folder, pinned). Keep it intact when editing; change "title:" to rename a page.
- To create a new page, write a new .md file whose first line is "# <Title>". No frontmatter needed — CoTenk adopts it automatically.
- Supported blocks: headings (#, ##, ###), paragraphs, "- " bullets, "1. " lists, "- [ ] " tasks, "> " quotes, fenced code, "---" dividers and GFM tables. Separate blocks with a blank line.
- Tasks may carry "@name" for an assignee and "due:YYYY-MM-DD" for a due date.
- Link other pages with [[Page title]] (or [[Page title|label]]).
- Interactive embeds: a block of raw, self-contained HTML (inline <style>/<script>, no external URLs or libraries) starting with a tag like <div> — it renders in a sandboxed iframe. Keep embeds under ~250 lines and avoid blank lines inside them. To keep widget state across reloads call cotenk.save(data) and read cotenk.state on load. Keep the background transparent and use the theme variables CoTenk injects: var(--ck-ink), var(--ck-ink-2), var(--ck-ink-3) for text, var(--ck-accent), var(--ck-accent-dim) for highlights, var(--ck-panel), var(--ck-panel-2), var(--ck-line) for surfaces and borders, var(--ck-danger) for errors.
- HTML pages: for a whole page that is an app or custom layout, make the page body one HTML document — after the "# Title" line it starts with <!doctype html> and contains nothing else. CoTenk runs it full-size in a sandboxed frame with the same --ck-* variables and cotenk.save/cotenk.state.
- Keep edits focused; do not delete content you were not asked to change.
- The full guide (file rules, embeds, task hand-offs, recipes) is {guide} — read it before creating pages or embeds. More CoTenk skills may be available the same way; use them when they fit the task. Finish each turn with 1–3 sentences on what changed and in which page.`;

/** Short context block that points the agent at one page. */
export function docContext(doc: Doc, folders: Folder[]): string {
  const title = doc.title.trim() || "Untitled";
  return `Context — the user is looking at the page "${title}" (file ${docRelativePath(doc, folders)}, cotenk-id ${doc.id}). If that path does not exist, search the workspace for the cotenk-id.`;
}

export type DocAction = {
  id: string;
  label: string;
  /** Visible prompt shown in the chat transcript. */
  prompt: string;
};

/** Quick actions offered from a page's "Ask agent" menu. */
export const DOC_ACTIONS: DocAction[] = [
  {
    id: "summarize",
    label: "Summarize this page",
    prompt:
      "Add a short \"## Summary\" section at the top of this page (below the title) with the 3–5 key points.",
  },
  {
    id: "continue",
    label: "Continue writing",
    prompt:
      "Read this page and continue writing it in the same tone and structure. Append the new content at the end.",
  },
  {
    id: "tasks",
    label: "Extract action items",
    prompt:
      "Find every action item or open question in this page and add them as \"- [ ] \" tasks under a \"## Next steps\" heading at the end.",
  },
  {
    id: "diagram",
    label: "Add an interactive diagram",
    prompt:
      "Add an interactive HTML embed to this page that visualizes its content (e.g. a flow, timeline or chart). Place it where it fits best.",
  },
  {
    id: "polish",
    label: "Polish and restructure",
    prompt:
      "Improve the structure and wording of this page: clear headings, tighter sentences, consistent lists. Keep all facts and tasks.",
  },
];
