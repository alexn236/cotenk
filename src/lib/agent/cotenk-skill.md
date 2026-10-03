---
name: cotenk-workspace
description: Use when working inside a CoTenk workspace folder (a directory of .md pages with "cotenk-id" frontmatter, e.g. ~/Documents/CoTenk) — creating, editing, renaming or moving pages, managing tasks (- [ ] with @owner and due:), adding images, or building interactive embeds, dashboards, HTML apps and multi-page websites.
---

# Working in a CoTenk workspace

CoTenk is a local-first workspace where people and AI agents share pages, tasks and context. Your current directory is the workspace root. Every page is a file here — a `.md` file for a markdown page, an `.html` file for an artifact page (an app, a tool, a website) — and the CoTenk app watches the folder:

- You edit real files. Whatever you save shows up within about a second in the page the user has open, often while they watch — the blocks you wrote light up with an "agent" tag.
- The user can undo your change with Ctrl+Z, but only while that page is open. Don't count on it. Edit carefully.
- Everything stays on the user's machine — there is no cloud copy. A deleted file deletes the page (CoTenk keeps it under "Recently deleted" for 60 days, but don't rely on that).
- Depending on the user's setting, your edits and commands are either shown to them as a diff to approve first, or applied right away.

## 0. What you can build here

| You want… | Make… | Section |
| --- | --- | --- |
| Notes, docs, plans, meeting notes | a markdown page | 1–2 |
| A to-do someone (or an agent) owns | a task: `- [ ] text @owner due:YYYY-MM-DD` | 3 |
| A small chart, tracker or diagram *inside* a page of notes | an interactive embed (HTML block) | 4 |
| A picture in a page | an image file in `assets/` + `![caption](cotenk-image:assets/…)` | 2 |
| A tool, app, game, viewer, calculator, dashboard or landing page — anything where the interactive part *is* the page | an artifact page: a `.html` file | 5 |
| A real website with several pages | several artifact pages linked with `href="cotenk:page/<Title>"` — the user can export it as a static site | 5 |

Rule of thumb: if the user asks for *a tool* ("a star-history viewer", "a pricing calculator", "a habit tracker"), make an artifact page — it gets the whole page and a real layout. Use an embed only for a widget that illustrates notes around it.
| Pages that reference each other | `[[Page title]]` links | 2 |

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

- **Never change, remove or copy `cotenk-id`.** It is the page's identity. If you rewrite a file without it, CoTenk deletes the page and adopts the file as a new one (new id, lost pin, lost version history).
- The frontmatter holds exactly four keys: `cotenk-id`, `title`, `folder`, `pinned`. Write values as plain text on one line, without quotes. CoTenk drops any other key.
- The body starts after the frontmatter. For existing pages the title is **not** in the body, so "the top of the page" means the first line after the closing `---`. Don't add a `# Title` line to an existing page.
- **Rename:** edit the `title:` line. CoTenk renames the file to the title's slug for you. If you rename the file yourself, CoTenk moves it back.
- **Move to another folder:** set `folder:` to the folder's exact display name. Copy it from another page's `folder:` line. Case doesn't matter. An empty value means the top level. An unknown name creates a new folder. Don't move the file yourself, because CoTenk moves it back.
- **Pin or unpin:** set `pinned: true` or `pinned: false`.
- **Delete:** only when the user explicitly asks. Deleting the file deletes the page.
- Use UTF-8 **without BOM** and **LF** line endings. CoTenk tolerates CRLF and a BOM, but rewrites such files once to normalize them — which shows up as an extra change. Prefer your file-edit tools over shell redirects (Windows PowerShell 5.1 `Set-Content`/`Out-File` adds a BOM).

### Creating a page

1. Write a new `.md` file **without frontmatter**. Make the first line `# <Title>`, then a blank line, then the content. Use `##` and `###` for sections below it.
2. Name the file after the title's slug (`Launch plan` becomes `launch-plan.md`). Otherwise CoTenk renames it.
3. Put it at the root for a top-level page. For a page in a folder, use that folder's existing directory, e.g. `q3-plans/launch-plan.md` for the folder "Q3 Plans" (matched by display name or its slug). A directory that matches no folder creates a new folder.
4. Within about a second CoTenk adopts the file: the `# Title` line becomes the page title (and leaves the body), and frontmatter is written into the file. **Re-read the file before editing it again.** Never write it again from a stale copy without the frontmatter.

### Layout rules

- Folders are exactly one level deep. Files nested deeper are flattened into a folder named after their parent directory.
- Stay inside the workspace. Never write pages outside it or in dot-folders (`.claude/`, `.git/`). Those hold tooling, not pages.
- Every `.md` and `.html` file in the workspace becomes a page (except inside `assets/`), so don't leave scratch or temp files with those extensions behind.
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
| Image | `![caption](cotenk-image:assets/<file>)` on its own line; add `#w=480` after the path for a display width |
| File | `[name](cotenk-file:assets/files/<file>)` on its own line |
| Embed | raw HTML block, see section 4 |

Avoid these, which don't render or don't survive editing:

- **Inline HTML** inside markdown (`<br>`, `<span>`, `<details>`) shows as text. Only whole embed blocks render HTML.
- **Relative image paths** (`![](pic.png)`) don't resolve. Images live in the workspace's `assets/` folder and are referenced as `cotenk-image:assets/<file>` (png, jpg, webp, gif). Save the file there first, then add the line. `https://` image URLs also render, but a file in `assets/` keeps working offline — prefer it. Imported pages may carry inline `data:` images — keep them as they are.
- **Mermaid or math** fences show as plain code. Use an embed for diagrams.
- **`####` and deeper** headings are left out of the contents panel. Stay within `#` to `###`.
- **Nested lists** render flat, and the editor removes the indentation once the user edits the page. Prefer flat lists and use `###` subheadings to group.
- **A heading or paragraph glued to a list** (no blank line) becomes one mixed block, and its checkboxes can't be clicked. Always put a blank line before a list.
- Link pages with `[[Page title]]` only — markdown links to `.md` files don't resolve.

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

- **Libraries from these CDNs only:** `cdn.jsdelivr.net`, `unpkg.com`, `cdnjs.cloudflare.com`, `esm.sh` and `cdn.tailwindcss.com` (scripts, styles, ES modules). Web fonts from Google Fonts (`fonts.googleapis.com` / `fonts.gstatic.com`). Images and video from any `https://` URL. Everything else — other hosts, `fetch` to APIs — is blocked. For a small widget, plain inline JS and SVG is still best: it loads instantly and works offline.
- **Not available:** `localStorage`, `sessionStorage`, cookies, IndexedDB, `alert`/`confirm`/`prompt`, form submission (use button click handlers), popups or new windows, `eval`/`new Function`, and any access to the parent page or workspace files.
- **Links:** `<a href="https://…">` opens in the user's browser. `<a href="cotenk:page/Page%20title">` opens that CoTenk page. From script: `cotenk.openUrl(url)` / `cotenk.openPage("Page title")`.
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

## 5. Artifact pages: apps, tools and websites

When the user wants a tool, an app, a game, a dashboard, a landing page or a website — anything where the interactive part is the page — make an **artifact page**: an `.html` file holding one complete HTML document. CoTenk runs it full-size in a sandboxed frame; the user can switch between the page, its code, or both side by side.

**Create one** by writing a new file `<slug>.html` (e.g. `pricing-calculator.html`, or `q3-plans/pricing-calculator.html` inside a folder) — no frontmatter, no `# Title` line, just the document. The page title comes from `<title>`:

```html
<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Pricing calculator</title>
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

Within about a second CoTenk adopts the file and adds one identity comment right after the doctype:

```html
<!doctype html>
<!-- cotenk: {"id":"doc-m1abc23-0","title":"Pricing calculator","folder":"","pinned":false} -->
<html>…
```

- **Never change or remove that comment's `id`** — it's the page's identity, like `cotenk-id` in markdown. To rename the page, change `"title"` in the comment; to move it, `"folder"`. Re-read the file before editing it again after creating it.
- The file must start with `<!doctype html>` or `<html>` (the identity comment may follow the doctype). Blank lines are fine.
- An older artifact page may still be a `.md` file whose body is an HTML document; CoTenk turns it into an `.html` file by itself. Don't do it by hand.
- Same sandbox as embeds (section 4): the listed CDNs, Google Fonts and https images work; `fetch` to other hosts, `localStorage` and popups don't. Keep state with `cotenk.save()` / `cotenk.state`. Set text from data with `textContent`.
- The page background is already `var(--ck-canvas)` with `font:15px/1.6 system-ui`. For pages that belong to the workspace (tools, dashboards), use the `var(--ck-…)` colors so they follow light and dark mode. A website with its own brand may use its own palette.
- Make it responsive (`<meta name="viewport">`, flexible layouts) — it may be shown in a narrow side panel or exported to the web.
- Tasks and `[[links]]` inside an HTML page are not picked up — keep those on markdown pages.

### Multi-page websites

A website is a set of HTML pages that link to each other:

1. Make one artifact page (`.html` file) per site page, e.g. "Acme", "Acme — Pricing", "Acme — About". Use distinctive titles so they don't clash with the user's other pages.
2. Link them with `<a href="cotenk:page/Acme%20%E2%80%94%20Pricing">Pricing</a>` (the page title, URL-encoded). In CoTenk the link opens that page; external links open in the browser.
3. Repeat the shared header, nav and footer on every page (there is no include mechanism), and keep the CSS identical so the pages feel like one site.
4. Tell the user they can publish it: on the start page, **Export site** (or page menu → Export as website) saves a `.zip` with `index.html` plus one `.html` file per linked page, links rewritten to the files — ready for any static host (Netlify, GitHub Pages, Cloudflare Pages). `cotenk.save()` state then lives in the visitor's browser.

Good defaults for a site: a hero with a clear headline and one call to action, sections with generous spacing, a real font from Google Fonts, and Tailwind (`<script src="https://cdn.tailwindcss.com"></script>`) or hand-written CSS — whichever you can keep consistent across pages.

## 6. Working style

This is a productivity tool. Help the user get things done and keep pages easy to scan.

- **Edit the existing page** rather than creating new ones. Create a page only when asked, or when the result clearly deserves its own page.
- **Make small, focused edits.** The user sees each save live. Change only the part you were asked about, keep the rest byte-for-byte, and never delete user content unless asked.
- **Keep pages scannable:** short sections under `##` headings, short paragraphs, lists over prose, and action items as tasks with an owner and a due date where known.
- **Ask when the request is ambiguous** before restructuring or rewriting a large page. Which page? Which section? Replace or append?
- **End each turn with 1–3 sentences:** what changed and on which page(s), by title. Mention anything you left open.

## 7. Recipes

- **Summarize:** add `## Summary` as the first block of the body (right below the frontmatter), with 3–5 bullets of key points and decisions. Don't touch the rest of the page.
- **Continue writing:** read the whole page, match its tone and heading levels, and append at the end.
- **Extract action items:** collect every action item or open question as `- [ ]` tasks under `## Next steps` at the end. Keep the `@owner` and `due:` wherever the text names them. Don't duplicate existing tasks.
- **Meeting notes to tasks:** use the structure `## Agenda`, `## Notes`, `## Decisions` (bullets), `## Action items` (tasks with `@owner due:YYYY-MM-DD`). Record decisions as facts, and turn each follow-up into exactly one task.
- **Weekly review:** find the pages changed in the last 7 days (by file modification time), then fill `## Wins`, `## What didn't go well` and `## Next week` (3 prioritized tasks). List overdue open tasks by name.
- **Dashboard page:** gather the data from the workspace (tasks by owner or due date, numbers from pages) and write a short intro line with `_Updated YYYY-MM-DD_`. Add one or two embeds with the data baked in, plus a `## Highlights` bullet list and a `## Watch list` of tasks. Embeds can't read the workspace live, so re-run the recipe to refresh.
- **Add a diagram:** build a flow, timeline or chart embed (section 4) from the page's content and place it right after the section it illustrates.
- **Tool or app:** build it as one artifact page (section 5) with a clear header, the controls at the top and room for the result — not as an embed squeezed into a markdown page.
- **Landing page / website:** ask (or infer) the product, audience and tone, then build it as artifact pages (section 5): a start page with hero, features, social proof and a call to action, plus linked subpages if asked. Finish by telling the user about **Export site**.
- **Polish:** tighten the wording and structure, but keep every fact, task, owner, due date and embed. Never change a task's checked state.

## 8. Don't

- Don't edit, remove or duplicate `cotenk-id`, and don't add frontmatter keys.
- Don't rename or move page files by hand. Edit `title:` or `folder:` instead.
- Don't delete files, pages or sections the user didn't ask you to remove.
- Don't tick tasks you didn't complete, and don't reassign owners unless asked.
- Don't load anything from hosts other than the allowed CDNs, Google Fonts and https images, don't use storage APIs in embeds or HTML pages, and don't put blank lines in embeds.
- Don't use inline HTML, mermaid or nested lists in markdown, or relative image paths (use `cotenk-image:assets/…`).
- Don't create folders more than one level deep, and don't put `.md` files outside the workspace or in dot-folders.
- Don't rewrite a whole page when a targeted edit will do.
