/**
 * Curated page templates that ship with CoTenk. They double as the
 * "official" shelf of the marketplace and as examples of what agents can
 * build: plain markdown plus self-contained HTML embeds.
 */

export type TemplateCategory =
  | "Planning"
  | "Team"
  | "Personal"
  | "Agents"
  | "Dashboards";

export const TEMPLATE_CATEGORIES: TemplateCategory[] = [
  "Planning",
  "Team",
  "Personal",
  "Agents",
  "Dashboards",
];

export type Template = {
  id: string;
  title: string;
  description: string;
  category: TemplateCategory;
  author: string;
  /** Page body (markdown, may contain HTML embed blocks). */
  content: string;
  /** Contains at least one interactive embed. */
  interactive: boolean;
};

const KPI_EMBED = `<div class="kpi">
<style>
.kpi{padding:4px 2px}
.kpi .tabs{display:flex;gap:6px;margin-bottom:14px}
.kpi button{border:1px solid var(--ck-line);background:var(--ck-panel-2);color:var(--ck-ink-2);border-radius:6px;padding:4px 10px;font:inherit;font-size:12px;cursor:pointer}
.kpi button.on{background:var(--ck-accent);color:var(--ck-on-accent);border-color:var(--ck-accent)}
.kpi .bars{display:flex;align-items:flex-end;gap:10px;height:160px;border-bottom:1px solid var(--ck-line)}
.kpi .bar{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%}
.kpi .fill{width:100%;border-radius:5px 5px 0 0;background:var(--ck-accent);transition:height .45s cubic-bezier(.16,1,.3,1)}
.kpi .val{font-size:11px;color:var(--ck-ink-2);margin-bottom:4px}
.kpi .labels{display:flex;gap:10px;margin-top:6px}
.kpi .labels span{flex:1;text-align:center;font-size:11px;color:var(--ck-ink-3)}
</style>
<div class="tabs"><button class="on" data-k="users">Active users</button><button data-k="rev">Revenue</button><button data-k="nps">NPS</button></div>
<div class="bars" id="bars"></div>
<div class="labels" id="labels"></div>
<script>
var D={users:[420,510,640,700,860,1040],rev:[3.1,3.8,4.4,5.2,6.0,7.3],nps:[31,34,33,38,41,44]};
var M=["Apr","May","Jun","Jul","Aug","Sep"];
var bars=document.getElementById("bars"),labels=document.getElementById("labels");
M.forEach(function(m){var b=document.createElement("div");b.className="bar";b.innerHTML='<span class="val"></span><div class="fill" style="height:0"></div>';bars.appendChild(b);var l=document.createElement("span");l.textContent=m;labels.appendChild(l)});
function show(k){var v=D[k],max=Math.max.apply(null,v);[].forEach.call(bars.children,function(b,i){b.querySelector(".fill").style.height=(v[i]/max*85)+"%";b.querySelector(".val").textContent=k==="rev"?"€"+v[i]+"k":v[i]});document.querySelectorAll(".tabs button").forEach(function(x){x.classList.toggle("on",x.dataset.k===k)})}
document.querySelectorAll(".tabs button").forEach(function(x){x.onclick=function(){show(x.dataset.k)}});
show("users");
</script>
</div>`;

const TIMELINE_EMBED = `<div class="tl">
<style>
.tl{padding:6px 0 4px}
.tl .row{display:grid;grid-template-columns:110px 1fr;align-items:center;gap:10px;margin:6px 0}
.tl .name{font-size:12.5px;color:var(--ck-ink-2)}
.tl .track{position:relative;height:22px;border-radius:6px;background:var(--ck-panel-2)}
.tl .seg{position:absolute;top:3px;bottom:3px;border-radius:4px;background:var(--ck-accent);opacity:.8;cursor:pointer;transition:opacity .15s}
.tl .seg:hover{opacity:1}
.tl .axis{display:grid;grid-template-columns:120px repeat(6,1fr);font-size:11px;color:var(--ck-ink-3);margin-top:4px}
.tl .tip{margin-top:10px;font-size:12.5px;color:var(--ck-ink-2);min-height:1.5em}
</style>
<div id="rows"></div>
<div class="axis"><span></span><span>Oct</span><span>Nov</span><span>Dec</span><span>Jan</span><span>Feb</span><span>Mar</span></div>
<div class="tip" id="tip">Hover a bar for details.</div>
<script>
var P=[["Discovery",0,1.5,"Interviews and problem framing"],["Design",1,3,"Flows, prototypes, reviews"],["Build",2,5,"Core features and integrations"],["Beta",4,5.5,"Private beta with 20 teams"],["Launch",5.5,6,"Public launch"]];
var rows=document.getElementById("rows"),tip=document.getElementById("tip");
P.forEach(function(p){var r=document.createElement("div");r.className="row";r.innerHTML='<span class="name"></span><div class="track"><div class="seg"></div></div>';r.querySelector(".name").textContent=p[0];var s=r.querySelector(".seg");s.style.left=(p[1]/6*100)+"%";s.style.width=((p[2]-p[1])/6*100)+"%";s.onmouseenter=function(){tip.textContent=p[0]+" — "+p[3]};rows.appendChild(r)});
</script>
</div>`;

const TIMER_EMBED = `<div class="ft">
<style>
.ft{display:flex;flex-direction:column;align-items:center;gap:12px;padding:12px 0}
.ft .time{font:600 44px/1 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:-.02em;color:var(--ck-ink)}
.ft .modes,.ft .ctl{display:flex;gap:6px}
.ft button{border:1px solid var(--ck-line);background:var(--ck-panel-2);color:var(--ck-ink-2);border-radius:6px;padding:5px 12px;font:inherit;font-size:12px;cursor:pointer}
.ft button.on,.ft .go{background:var(--ck-accent);color:var(--ck-on-accent);border-color:var(--ck-accent)}
.ft .ring{width:100%;max-width:260px;height:4px;border-radius:4px;background:var(--ck-panel-2);overflow:hidden}
.ft .ring div{height:100%;background:var(--ck-accent);width:0;transition:width 1s linear}
.ft .done{font-size:12px;color:var(--ck-ink-3)}
</style>
<div class="modes"><button class="on" data-m="25">Focus 25</button><button data-m="5">Break 5</button><button data-m="15">Long 15</button></div>
<div class="time" id="t">25:00</div>
<div class="ring"><div id="bar"></div></div>
<div class="ctl"><button class="go" id="go">Start</button><button id="reset">Reset</button></div>
<div class="done" id="done">0 focus sessions</div>
<script>
var total=1500,left=1500,timer=null,count=0;
var t=document.getElementById("t"),bar=document.getElementById("bar"),go=document.getElementById("go");
function draw(){var m=Math.floor(left/60),s=left%60;t.textContent=(m<10?"0":"")+m+":"+(s<10?"0":"")+s;bar.style.width=((total-left)/total*100)+"%"}
function stop(){clearInterval(timer);timer=null;go.textContent="Start"}
go.onclick=function(){if(timer){stop();return}go.textContent="Pause";timer=setInterval(function(){left--;if(left<=0){stop();left=0;if(total===1500){count++;document.getElementById("done").textContent=count+" focus session"+(count===1?"":"s")}}draw()},1000)};
document.getElementById("reset").onclick=function(){stop();left=total;draw()};
document.querySelectorAll(".modes button").forEach(function(b){b.onclick=function(){stop();total=left=+b.dataset.m*60;document.querySelectorAll(".modes button").forEach(function(x){x.classList.toggle("on",x===b)});draw()}});
draw();
</script>
</div>`;

export const TEMPLATES: Template[] = [
  {
    id: "tpl-project-brief",
    title: "Project brief",
    description:
      "One page to align people and agents: goal, scope, milestones and owners.",
    category: "Planning",
    author: "CoTenk",
    interactive: false,
    content: `## Goal

What outcome are we driving, and how will we know we got there?

## Context

Why now. Links to research, previous attempts, constraints.

## Scope

- In: the parts we commit to
- Out: what we deliberately skip

## Milestones

| Milestone | Owner | Target |
| --- | --- | --- |
| Problem framing | @you | Week 1 |
| First prototype | @devin | Week 2 |
| Review with users | @team | Week 3 |

## Tasks

- [ ] Write the problem statement @you
- [ ] Collect three reference products @devin
- [ ] Book user interviews @team

> Keep this page short. If it grows, split details into linked pages.`,
  },
  {
    id: "tpl-meeting-notes",
    title: "Meeting notes",
    description:
      "Agenda, decisions and action items with owners and due dates — tasks show up in Tasks automatically.",
    category: "Team",
    author: "CoTenk",
    interactive: false,
    content: `**Date:** today · **Attendees:** @you, @team

## Agenda

1. Updates since last time
2. Open decisions
3. Next steps

## Notes

Capture the discussion here.

## Decisions

- Decision and the reason behind it

## Action items

- [ ] Follow up with the customer @you due:2026-10-01
- [ ] Draft the proposal @devin
- [ ] Share the recap in the channel @team`,
  },
  {
    id: "tpl-agent-handoff",
    title: "Agent handoff brief",
    description:
      "A spec an agent can execute: goal, context, constraints and a definition of done.",
    category: "Agents",
    author: "CoTenk",
    interactive: false,
    content: `## Goal

Describe the result in one or two sentences.

## Context

- Relevant pages, files or links
- What already exists and should be reused

## Constraints

- Tools or libraries that must (not) be used
- Style, tone or format requirements

## Definition of done

- [ ] The result exists where described above
- [ ] Open questions are listed at the end of this page
- [ ] A short summary of changes is added below

## Summary of changes

_Filled in by the agent._`,
  },
  {
    id: "tpl-kpi-dashboard",
    title: "KPI dashboard",
    description:
      "Interactive bar chart with metric tabs — replace the numbers or ask an agent to wire in yours.",
    category: "Dashboards",
    author: "CoTenk",
    interactive: true,
    content: `Monthly snapshot of the metrics that matter. Click a tab to switch the metric.

${KPI_EMBED}

## Highlights

- Active users grew 21% month over month
- Revenue passed €7k MRR

## Watch list

- [ ] Investigate the NPS dip in June @you
- [ ] Refresh numbers for October @devin due:2026-10-03`,
  },
  {
    id: "tpl-roadmap",
    title: "Roadmap timeline",
    description:
      "Hoverable timeline of phases — a lightweight Gantt view without any extra tool.",
    category: "Planning",
    author: "CoTenk",
    interactive: true,
    content: `Six-month plan at a glance. Hover a bar for details.

${TIMELINE_EMBED}

## Phases

### Discovery

Interviews and problem framing.

### Build

Core features and integrations.

### Launch

- [ ] Prepare launch checklist
- [ ] Write the announcement`,
  },
  {
    id: "tpl-focus",
    title: "Focus session",
    description:
      "Pomodoro timer next to your plan for the day — deep work without switching apps.",
    category: "Personal",
    author: "CoTenk",
    interactive: true,
    content: `${TIMER_EMBED}

## Today's focus

- [ ] The one thing that matters most
- [ ] Second priority
- [ ] Small win

## Notes

What got in the way, what worked.`,
  },
  {
    id: "tpl-weekly",
    title: "Weekly review",
    description:
      "Reflect, plan and reset every week. Works solo or as a team ritual.",
    category: "Personal",
    author: "CoTenk",
    interactive: false,
    content: `## Wins

-

## What didn't go well

-

## Next week

- [ ] Top priority
- [ ] Second priority
- [ ] Something to learn

> Tip: ask the agent to "summarize my week" — it can read every page you edited.`,
  },
  {
    id: "tpl-decision-log",
    title: "Decision log",
    description:
      "Keep a record of what was decided, why and by whom — searchable forever.",
    category: "Team",
    author: "CoTenk",
    interactive: false,
    content: `Every meaningful decision gets one row. Link to the page with the full discussion.

| Date | Decision | Why | Owner |
| --- | --- | --- | --- |
| 2026-09-01 | Store pages as plain markdown | Agents and tools can read them | @you |
| 2026-09-12 | Devin CLI first via ACP | Works out of the box | @team |

## Open decisions

- [ ] Pricing for marketplace listings @you`,
  },
];
