import {
  ChartBar,
  CheckSquare,
  Code,
  FileHtml,
  Lightbulb,
  Lightning,
  ListBullets,
  ListNumbers,
  Minus,
  Quotes,
  Table,
  TextHOne,
  TextHTwo,
  TextHThree,
  TextT,
  Gauge,
} from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";
import type { BlockType } from "@/lib/blocks";

export type SlashItem = {
  id: string;
  type: BlockType;
  label: string;
  desc: string;
  keywords: string[];
  icon: Icon;
  /** Initial block text (tables, callouts, embed starters). */
  preset?: string;
  /** Non-block action handled by the editor instead of a type switch. */
  action?: "ask-agent";
  group: "Basic" | "Embeds" | "Agent";
};

const CHART_PRESET = `<div class="chart">
<style>
.chart{display:flex;align-items:flex-end;gap:10px;height:150px;padding:8px 2px 0;border-bottom:1px solid var(--ck-line)}
.chart .b{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%;gap:4px;font-size:11px;color:var(--ck-ink-3)}
.chart .f{width:100%;border-radius:5px 5px 0 0;background:var(--ck-accent);opacity:.85;transition:opacity .15s}
.chart .f:hover{opacity:1}
</style>
<script>
var data=[["Mon",4],["Tue",7],["Wed",5],["Thu",9],["Fri",6]];
var max=Math.max.apply(null,data.map(function(d){return d[1]}));
document.currentScript.parentNode.innerHTML+=data.map(function(d){return '<div class="b"><span>'+d[1]+'</span><div class="f" style="height:'+(d[1]/max*80)+'%"></div><span>'+d[0]+'</span></div>'}).join("");
</script>
</div>`;

const PROGRESS_PRESET = `<div class="prog">
<style>
.prog .r{margin:8px 0}
.prog .t{display:flex;justify-content:space-between;font-size:12.5px;color:var(--ck-ink-2);margin-bottom:5px}
.prog .bar{height:6px;border-radius:6px;background:var(--ck-panel-2);overflow:hidden}
.prog .bar div{height:100%;border-radius:6px;background:var(--ck-accent)}
</style>
<script>
var goals=[["Launch beta",70],["Onboard 20 teams",45],["Publish 10 templates",90]];
document.currentScript.parentNode.innerHTML+=goals.map(function(g){return '<div class="r"><div class="t"><span>'+g[0]+'</span><span>'+g[1]+'%</span></div><div class="bar"><div style="width:'+g[1]+'%"></div></div></div>'}).join("");
</script>
</div>`;

export const SLASH_ITEMS: SlashItem[] = [
  {
    id: "text",
    type: "paragraph",
    label: "Text",
    desc: "Plain paragraph",
    keywords: ["text", "paragraph", "absatz", "plain"],
    icon: TextT,
    group: "Basic",
  },
  {
    id: "h1",
    type: "h1",
    label: "Heading 1",
    desc: "Large section heading",
    keywords: ["heading", "überschrift", "h1", "title", "titel"],
    icon: TextHOne,
    group: "Basic",
  },
  {
    id: "h2",
    type: "h2",
    label: "Heading 2",
    desc: "Medium section heading",
    keywords: ["heading", "überschrift", "h2", "subtitle"],
    icon: TextHTwo,
    group: "Basic",
  },
  {
    id: "h3",
    type: "h3",
    label: "Heading 3",
    desc: "Small section heading",
    keywords: ["heading", "überschrift", "h3"],
    icon: TextHThree,
    group: "Basic",
  },
  {
    id: "todo",
    type: "todo",
    label: "To-do",
    desc: "Task with a checkbox · @who due:date",
    keywords: ["todo", "task", "aufgabe", "checkbox", "to-do"],
    icon: CheckSquare,
    group: "Basic",
  },
  {
    id: "bullet",
    type: "bullet",
    label: "Bulleted list",
    desc: "Simple list",
    keywords: ["bullet", "liste", "ul", "list", "aufzählung"],
    icon: ListBullets,
    group: "Basic",
  },
  {
    id: "numbered",
    type: "numbered",
    label: "Numbered list",
    desc: "Ordered list",
    keywords: ["numbered", "num", "ol", "1.", "liste", "ordered", "nummeriert"],
    icon: ListNumbers,
    group: "Basic",
  },
  {
    id: "table",
    type: "paragraph",
    label: "Table",
    desc: "Markdown table",
    keywords: ["table", "tabelle", "grid", "rows"],
    icon: Table,
    preset: "| Name | Status | Owner |\n| --- | --- | --- |\n| First item | In progress | @you |",
    group: "Basic",
  },
  {
    id: "quote",
    type: "quote",
    label: "Quote",
    desc: "Highlighted quote",
    keywords: ["quote", "zitat", "blockquote"],
    icon: Quotes,
    group: "Basic",
  },
  {
    id: "callout",
    type: "quote",
    label: "Callout",
    desc: "Note that stands out",
    keywords: ["callout", "hinweis", "note", "tip", "info"],
    icon: Lightbulb,
    preset: "💡 ",
    group: "Basic",
  },
  {
    id: "code",
    type: "code",
    label: "Code",
    desc: "Code block",
    keywords: ["code", "codeblock", "```", "pre"],
    icon: Code,
    group: "Basic",
  },
  {
    id: "divider",
    type: "divider",
    label: "Divider",
    desc: "Horizontal line",
    keywords: ["divider", "trennlinie", "hr", "---", "linie"],
    icon: Minus,
    group: "Basic",
  },
  {
    id: "embed",
    type: "embed",
    label: "HTML embed",
    desc: "Your own sandboxed HTML",
    keywords: ["embed", "html", "iframe", "einbetten", "custom"],
    icon: FileHtml,
    group: "Embeds",
  },
  {
    id: "chart",
    type: "embed",
    label: "Bar chart",
    desc: "Interactive chart, edit the data",
    keywords: ["chart", "diagramm", "graph", "bar", "embed"],
    icon: ChartBar,
    preset: CHART_PRESET,
    group: "Embeds",
  },
  {
    id: "progress",
    type: "embed",
    label: "Progress bars",
    desc: "Goals with progress",
    keywords: ["progress", "fortschritt", "okr", "goals", "ziele", "embed"],
    icon: Gauge,
    preset: PROGRESS_PRESET,
    group: "Embeds",
  },
  {
    id: "ask-agent",
    type: "paragraph",
    label: "Ask agent…",
    desc: "Let the agent write or build here",
    keywords: ["ai", "ki", "agent", "devin", "ask", "generate", "build"],
    icon: Lightning,
    action: "ask-agent",
    group: "Agent",
  },
];

export function filterSlashItems(query: string): SlashItem[] {
  const q = query.toLowerCase();
  if (!q) return SLASH_ITEMS;
  return SLASH_ITEMS.filter((item) =>
    `${item.label} ${item.keywords.join(" ")}`.toLowerCase().includes(q),
  );
}
