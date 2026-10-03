---
name: cotenk-workspace
description: Use when working inside a CoTenk workspace folder (a directory of .md pages with "cotenk-id" frontmatter, e.g. ~/Documents/CoTenk) — creating, editing, renaming or moving pages, managing tasks (- [ ] with @owner and due:), or building interactive HTML embeds, HTML pages, charts and dashboards.
---

# Working in a CoTenk workspace

CoTenk is a productivity workspace. It stores Notion-style pages, tasks and interactive embeds as plain markdown files. Your current directory is the workspace root. Every page is a `.md` file here, and the CoTenk app watches the folder:

- You edit real files. Whatever you save shows up within about a second in the page the user has open, often while they watch.
- The user can undo your change with Ctrl+Z, but only while that page is open. Don't count on it. Edit carefully.
- Pages sync to the cloud and the user's other devices. A deleted file deletes the page everywhere.

## 1. Files and frontmatter

A synced page looks like this:

```
---
cotenk-id: doc-m1abc23-0
title: Weekly Sync
folder: Product
pinned: false
---

## Decisions
...
```

- **Never change, remove or copy `cotenk-id`.** It is the page's identity. If you rewrite a file without it, CoTenk deletes the page and adopts the file as a new one (new id, lost pin, cloud churn).
- The frontmatter holds exactly four keys: `cotenk-id`, `title`, `folder`, `pinned`. Write values as plain text on one line, without quotes. CoTenk drops any other key.
- The body starts after the frontmatter. For existing pages the title is **not** in the body, so "the top of the page" means the first line after the closing `---`. Don't add a `# Title` line to an existing page.
- **Rename:** edit the `title:` line. CoTenk renames the file to the title's slug for you. If you rename the file yourself, CoTenk moves it back.
- **Move to another folder:** set `folder:` to the folder's exact display name. Copy it from another page's `folder:` line. Case doesn't matter. An empty value means the top level. An unknown name creates a new folder. Don't move the file yourself, because CoTenk moves it back.
- **Pin or unpin:** set `pinned: true` or `pinned: false`.
- **Delete:** only when the user explicitly asks. Deleting the file deletes the page for good, in the cloud too.
- Use UTF-8 **without BOM** and **LF** line endings. CoTenk tolerates CRLF and a BOM, but rewrites such files once to normalize them — which shows up as an extra change. Prefer your file-edit tools over shell redirects (Windows PowerShell 5.1 `Set-Content`/`Out-File` adds a BOM).

### Creating a page

1. Write a new `.md` file **without frontmatter**. Make the first line `# <Title>`, then a blank line, then the content. Use `##` and `###` for sections below it.
2. Name the file after the title's slug (`Launch plan` becomes `launch-plan.md`). Otherwise CoTenk renames it.
3. Put it at the root for a top-level page. For a page in a folder, use that folder's existing directory, e.g. `q3-plans/launch-plan.md` for the folder "Q3 Plans" (matched by display name or its slug). A directory that matches no folder creates a new folder.
4. Within about a second CoTenk adopts the file: the `# Title` line becomes the page title (and leaves the body), and frontmatter is written into the file. **Re-read the file before editing it again.** Never write it again from a stale copy without the frontmatter.

### Layout rules

- Folders are exactly one level deep. Files nested deeper are flattened into a folder named after their parent directory.
- Stay inside the workspace. Never write pages outside it or in dot-folders (`.claude/`, `.git/`). Those hold tooling, not pages.
- Every `.md` file in the workspace becomes a page, so don't leave scratch or temp `.md` files behind.
- If the user is typing in the same page, the newer change wins. Re-read right before each edit, make targeted replacements instead of rewriting the whole file, and check afterwards that your change stuck.

## 2. Markdown that renders

Separate blocks with **one blank line**. Keep consecutive list items on consecutive lines with no blank lines between them.

| Block | Syntax |
| --- | --- |
| Headings | `# `, `## `, `### ` (one line each, blank line after) |
| Paragraph | plain text: **bold**, *italic*, `code`, ~~strike~~, [links](https://…) |
| Page link | `[[Page title]]` or `[[Page title\|label]]` — links another page by its title; the target page lists it under "Linked from" |
| Bullets / numbers | `- item` / `1. item` |
| Tasks | `- [ ] open`, `- [x] done` |
| Quote / callout | `> text` / `> 💡 text` |
| Code | fenced with a language tag, e.g. three backticks followed by `ts` |
| Divider | `---` on its own line |
| Table | GFM table (header row, `| --- |` separator row) |
| Embed | raw HTML block, see section 4 |

Avoid these, which don't render or don't survive editing:

- **Inline HTML** inside markdown (`<br>`, `<span>`, `<details>`) shows as text. Only whole embed blocks render HTML.
- **Images** (`![](...)`): external and relative images are blocked (imported pages may carry inline `data:` images — keep them as they are). Draw with an embed (inline SVG) instead.
- **Mermaid or math** fences show as plain code. Use an embed for diagrams.
- **`####` and deeper** headings are left out of the contents panel. Stay within `#` to `###`.
- **Nested lists** render flat, and the editor removes the indentation once the user edits the page. Prefer flat lists and use `###` subheadings to group.
- **A heading or paragraph glued to a list** (no blank line) becomes one mixed block, and its checkboxes can't be clicked. Always put a blank line before a list.
- There is no page-link syntax. Refer to other pages by their title.

## 3. Tasks

```
- [ ] Draft the Q4 pricing proposal @maria due:2026-10-03
- [ ] Collect three competitor examples @claude
- [x] Book the venue @tom
```

- The syntax is `- [ ] ` plus text. `@name` sets owners (several allowed). `due:YYYY-MM-DD` sets the due date (`📅 2026-10-03` also works, but prefer `due:`). Put a space before every marker.
- Every task in every page appears in the Tasks view, grouped by page or by due date (overdue, today, this week, later). Tasks inside code fences are ignored.
- These owner names are agents and show a ⚡ chip: `@agent @ai @claude @devin @codex @gemini @copilot @cursor`. Everything else is a person.
- Use real dates. Check today's date before writing `due:`, and resolve "Friday" or "next week" to an ISO date.
- Keep backticks out of task text, or the owner and due chips won't render.
- Quick-added tasks land in the page titled **Inbox**. Append there for "add a task" requests that name no page.
- **Tick only tasks you actually completed.** Never tick a person's task, and never tick one just to tidy up.

### A task handed to you ("hand to agent")

1. The context names the page file and its `cotenk-id`. If the path doesn't exist, search for the id (`grep -rl "cotenk-id: <id>" .`). Find the task by its text.
2. Do the work. Put small results in the page next to the task. Put large results in a new page and name it in the note.
3. Change the task's `- [ ]` to `- [x]`, then add one indented note line directly below it, with no blank line:

```
- [x] Collect three competitor examples @claude
  - Done: added a comparison table under "## Competitors" (Linear, Height, Notion).
```

4. If you can't finish, leave the box unticked and add `  - Blocked: <reason / question>` instead.

## 4. Interactive embeds

An embed is one block of raw, self-contained HTML. It runs in a sandboxed iframe inside the page.

Structure rules. The parser is strict:

- Put a blank line before and after the block.
- The block must **start with a tag** (`<div class="x">`), not a comment or text, and **end with `>`** (`</div>`).
- **No blank lines inside**, including lines that contain only spaces. No line inside may start with triple backticks or `~~~`.
- Use one root `<div>` with `<style>` and `<script>` inside it, like the built-in templates. Keep it under about 250 lines.

Sandbox limits (`sandbox="allow-scripts"` plus the app's content security policy):

- **No external resources:** no CDNs, script or CSS URLs, web fonts, remote images, or `fetch`. Write plain inline JS and CSS. Draw with inline SVG or divs. Use `data:` URIs only if you must.
- **Not available:** `localStorage`, `sessionStorage`, cookies, IndexedDB, `alert`/`confirm`/`prompt`, form submission (use button click handlers), popups or new windows, `eval`/`new Function`, and any access to the parent page or workspace files.
- **Saved widget state:** call `cotenk.save(data)` with a small JSON-serializable value (under 64 KB) when the user changes something worth keeping (a slider, a checklist, a counter). On load, read it back from `cotenk.state` (null until the first save), e.g. `var s=(cotenk.state&&cotenk.state.scope)||42`. CoTenk stores it inside the block as a trailing `<script type="application/json" data-cotenk-state>` line — leave that line alone when editing an embed. Everything else resets on reload, so bake reference data into the script and keep the source of truth in the page's markdown.
- **Sizing:** the frame height follows your content, from 80px up to 600px (taller content scrolls). Don't use `100vh` or `height:100%` on the root. Use fluid widths (flex or grid, percentages).

Theming. The body already has `margin:0`, a transparent background, `color:var(--ck-ink)` and `font:14px/1.5 system-ui`. Never hardcode colors. Use these variables so the embed works in light and dark mode:

- Text: `--ck-ink` (primary), `--ck-ink-2` (secondary), `--ck-ink-3` (muted)
- Accent: `--ck-accent`, `--ck-accent-2` (hover/strong), `--ck-accent-dim` (translucent tint), `--ck-on-accent` (text on accent)
- Surfaces: `--ck-canvas`, `--ck-panel`, `--ck-panel-2` (tracks, buttons), `--ck-elev`, `--ck-line` (borders)
- Errors or late items: `--ck-danger`

Example that follows every rule:

```html
<div class="sp">
<style>
.sp{padding:4px 2px}
.sp .row{display:grid;grid-template-columns:120px 1fr 44px;align-items:center;gap:10px;margin:7px 0;font-size:12.5px}
.sp .name{color:var(--ck-ink-2)}
.sp .track{height:8px;border-radius:8px;background:var(--ck-panel-2);overflow:hidden}
.sp .fill{height:100%;border-radius:8px;background:var(--ck-accent)}
.sp .fill.late{background:var(--ck-danger)}
.sp .pct{text-align:right;color:var(--ck-ink-3);font-variant-numeric:tabular-nums}
.sp .sum{margin-top:10px;font-size:12px;color:var(--ck-ink-3)}
</style>
<div id="rows"></div>
<div class="sum" id="sum"></div>
<script>
var D=[["Onboarding",8,10,false],["Billing",3,9,true],["Docs",5,6,false]];
var rows=document.getElementById("rows"),done=0,all=0;
D.forEach(function(d){var p=Math.round(d[1]/d[2]*100),r=document.createElement("div");r.className="row";r.innerHTML='<span class="name"></span><div class="track"><div class="fill"></div></div><span class="pct"></span>';r.querySelector(".name").textContent=d[0];r.querySelector(".pct").textContent=p+"%";var f=r.querySelector(".fill");f.style.width=p+"%";if(d[3])f.classList.add("late");rows.appendChild(r);done+=d[1];all+=d[2]});
document.getElementById("sum").textContent=done+" of "+all+" tasks done";
</script>
</div>
```

In the page, put the HTML as-is, without the code fence. Set text with `textContent`, not `innerHTML`, whenever the text comes from data.

### HTML pages

When the user wants a whole page that is an app, a landing page, a game or anything beyond blocks, make an **HTML page**: a page whose entire body is one HTML document. CoTenk recognises it by its first tag and runs it full-size in a sandboxed frame; the user can switch between the page and its code.

```html
# Pricing calculator

<!doctype html>
<html>
<head>
<style>
  body { max-width: 760px; margin: 0 auto; padding: 48px 32px; }
</style>
</head>
<body>
  <h1>Pricing calculator</h1>
  <script>/* … */</script>
</body>
</html>
```

- The body (after the frontmatter or the `# Title` line) must start with `<!doctype html>` or `<html>`. Nothing else may come before it, and no markdown after it.
- Same rules as embeds: self-contained, no external URLs or CDNs, `var(--ck-…)` colors, `cotenk.save()` / `cotenk.state` for state, `textContent` for data. Blank lines are fine here.
- The page background is already `var(--ck-canvas)` with `font:15px/1.6 system-ui`; set your own layout (max width, padding) in `body`.
- Tasks and `[[links]]` inside an HTML page are not picked up — keep those on markdown pages.

## 5. Working style

This is a productivity tool. Help the user get things done and keep pages easy to scan.

- **Edit the existing page** rather than creating new ones. Create a page only when asked, or when the result clearly deserves its own page.
- **Make small, focused edits.** The user sees each save live. Change only the part you were asked about, keep the rest byte-for-byte, and never delete user content unless asked.
- **Keep pages scannable:** short sections under `##` headings, short paragraphs, lists over prose, and action items as tasks with an owner and a due date where known.
- **Ask when the request is ambiguous** before restructuring or rewriting a large page. Which page? Which section? Replace or append?
- **End each turn with 1–3 sentences:** what changed and on which page(s), by title. Mention anything you left open.

## 6. Recipes

- **Summarize:** add `## Summary` as the first block of the body (right below the frontmatter), with 3–5 bullets of key points and decisions. Don't touch the rest of the page.
- **Continue writing:** read the whole page, match its tone and heading levels, and append at the end.
- **Extract action items:** collect every action item or open question as `- [ ]` tasks under `## Next steps` at the end. Keep the `@owner` and `due:` wherever the text names them. Don't duplicate existing tasks.
- **Meeting notes to tasks:** use the structure `## Agenda`, `## Notes`, `## Decisions` (bullets), `## Action items` (tasks with `@owner due:YYYY-MM-DD`). Record decisions as facts, and turn each follow-up into exactly one task.
- **Weekly review:** find the pages changed in the last 7 days (by file modification time), then fill `## Wins`, `## What didn't go well` and `## Next week` (3 prioritized tasks). List overdue open tasks by name.
- **Dashboard page:** gather the data from the workspace (tasks by owner or due date, numbers from pages) and write a short intro line with `_Updated YYYY-MM-DD_`. Add one or two embeds with the data baked in, plus a `## Highlights` bullet list and a `## Watch list` of tasks. Embeds can't read the workspace live, so re-run the recipe to refresh.
- **Add a diagram:** build a flow, timeline or chart embed (section 4) from the page's content and place it right after the section it illustrates.
- **Polish:** tighten the wording and structure, but keep every fact, task, owner, due date and embed. Never change a task's checked state.

## 7. Don't

- Don't edit, remove or duplicate `cotenk-id`, and don't add frontmatter keys.
- Don't rename or move page files by hand. Edit `title:` or `folder:` instead.
- Don't delete files, pages or sections the user didn't ask you to remove.
- Don't tick tasks you didn't complete, and don't reassign owners unless asked.
- Don't use external URLs, CDNs or storage APIs in embeds or HTML pages, or blank lines in embeds.
- Don't use inline HTML, images, mermaid or nested lists in markdown.
- Don't create folders more than one level deep, and don't put `.md` files outside the workspace or in dot-folders.
- Don't rewrite a whole page when a targeted edit will do.
