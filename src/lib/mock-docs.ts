import type { Doc, Folder } from "./types";
import { isoDay } from "./tasks";

const inDays = (n: number) => isoDay(new Date(Date.now() + n * 86_400_000));

/** Current welcome-page version — see welcome.ts before changing. */
export const WELCOME_ID = "d-welcome-v2";

export const seedFolders: Folder[] = [
  { id: "f-product", name: "Product" },
  { id: "f-engineering", name: "Engineering" },
];

/**
 * Welcome-page hero: an animated activity chart with period tabs, hover
 * readout and counting KPIs. Plain inline HTML — the same kind of block
 * an agent writes — so clicking it shows the whole source.
 */
const PULSE_EMBED = `<div class="pl">
<style>
.pl{padding:6px 2px 2px}
.pl .top{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;margin-bottom:12px;flex-wrap:wrap}
.pl .kp{display:flex;gap:22px}
.pl .k b{display:block;font:600 24px/1.1 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:-.02em;color:var(--ck-ink);font-variant-numeric:tabular-nums}
.pl .k span{font-size:11px;color:var(--ck-ink-3)}
.pl .k i{font-style:normal;font-size:11px;color:var(--ck-accent);margin-left:4px}
.pl .tabs{display:flex;gap:4px}
.pl button{border:1px solid var(--ck-line);background:var(--ck-panel-2);color:var(--ck-ink-2);border-radius:6px;padding:3px 9px;font:inherit;font-size:11.5px;cursor:pointer}
.pl button.on{background:var(--ck-accent);color:var(--ck-on-accent);border-color:var(--ck-accent)}
.pl .wrap{position:relative}
.pl svg{display:block;width:100%;height:150px}
.pl .grid line{stroke:var(--ck-line);stroke-dasharray:2 4;vector-effect:non-scaling-stroke}
.pl .area{fill:var(--ck-accent);opacity:.12}
.pl .line{fill:none;stroke:var(--ck-accent);stroke-width:2;stroke-linejoin:round;stroke-linecap:round;vector-effect:non-scaling-stroke}
.pl .cur{stroke:var(--ck-ink-3);stroke-width:1;opacity:0;vector-effect:non-scaling-stroke}
.pl .dot{position:absolute;width:9px;height:9px;border-radius:50%;background:var(--ck-accent);border:2px solid var(--ck-canvas);transform:translate(-50%,-50%);opacity:0;pointer-events:none}
.pl .tip{position:absolute;pointer-events:none;background:var(--ck-elev);border:1px solid var(--ck-line);color:var(--ck-ink);border-radius:6px;padding:4px 8px;font-size:11.5px;white-space:nowrap;opacity:0;transform:translate(-50%,-125%);transition:opacity .12s}
.pl .ax{display:flex;justify-content:space-between;font-size:10.5px;color:var(--ck-ink-3);margin-top:5px}
.pl .foot{margin-top:12px;font-size:11.5px;color:var(--ck-ink-3)}
</style>
<div class="top"><div class="kp"><div class="k"><b id="k0">0</b><span>pages edited</span></div><div class="k"><b id="k1">0</b><span>tasks closed</span></div><div class="k"><b id="k2">0</b><span>agent turns<i id="k2d"></i></span></div></div><div class="tabs"><button class="on" data-r="7">7 days</button><button data-r="30">30 days</button><button data-r="90">90 days</button></div></div>
<div class="wrap"><svg id="sv" viewBox="0 0 600 150" preserveAspectRatio="none"><g class="grid" id="gr"></g><path class="area" id="ar"></path><path class="line" id="ln"></path><line class="cur" id="cu" y1="0" y2="150"></line></svg><div class="dot" id="dt"></div><div class="tip" id="tp"></div></div>
<div class="ax" id="ax"></div>
<div class="foot">A live chart with no libraries — under 100 lines of HTML sitting in this page. Click it to read the code, change a number, click away.</div>
<script>
var NS="http://www.w3.org/2000/svg",W=600,H=150,P=8,cur=7;
var svg=document.getElementById("sv"),gr=document.getElementById("gr"),ar=document.getElementById("ar"),ln=document.getElementById("ln"),cu=document.getElementById("cu"),dt=document.getElementById("dt"),tp=document.getElementById("tp"),ax=document.getElementById("ax");
function rnd(s){return function(){s=(s*9301+49297)%233280;return s/233280}}
function gen(n,seed,base,amp,trend){var r=rnd(seed),o=[],v=base;for(var i=0;i<n;i++){v=Math.max(0,v+(r()-.42)*amp+trend);o.push(Math.round(v))}return o}
var D={};[7,30,90].forEach(function(n){D[n]={p:gen(n,n*7+1,6,4,.15),t:gen(n,n*11+3,3,3,.08),a:gen(n,n*13+5,2,3,.2)}});
for(var i=1;i<4;i++){var g=document.createElementNS(NS,"line");g.setAttribute("x1",0);g.setAttribute("x2",W);g.setAttribute("y1",H*i/4);g.setAttribute("y2",H*i/4);gr.appendChild(g)}
function pts(v){var mx=Math.max.apply(null,v)||1,n=v.length;return v.map(function(y,i){return[i/(n-1)*W,P+(1-y/mx)*(H-2*P)]})}
function path(p){return p.map(function(q,i){return(i?"L":"M")+q[0].toFixed(1)+" "+q[1].toFixed(1)}).join(" ")}
function sum(v){return v.reduce(function(a,b){return a+b},0)}
function count(el,to){var from=+el.textContent||0,t0=performance.now();function f(t){var k=Math.min(1,(t-t0)/700);k=1-Math.pow(1-k,3);el.textContent=Math.round(from+(to-from)*k);if(k<1)requestAnimationFrame(f)}requestAnimationFrame(f)}
function hide(){cu.style.opacity=0;dt.style.opacity=0;tp.style.opacity=0}
function show(n){cur=n;var d=D[n],p=pts(d.p);ln.setAttribute("d",path(p));ar.setAttribute("d",path(p)+" L"+W+" "+H+" L0 "+H+" Z");
var L=ln.getTotalLength();ln.style.transition="none";ln.style.strokeDasharray=L;ln.style.strokeDashoffset=L;ln.getBoundingClientRect();ln.style.transition="stroke-dashoffset .9s cubic-bezier(.16,1,.3,1)";ln.style.strokeDashoffset=0;
count(document.getElementById("k0"),sum(d.p));count(document.getElementById("k1"),sum(d.t));count(document.getElementById("k2"),sum(d.a));
var h=Math.floor(n/2),recent=sum(d.a.slice(h)),prev=sum(d.a.slice(0,h))||1;document.getElementById("k2d").textContent=(recent>=prev?"+":"−")+Math.round(Math.abs(recent-prev)/prev*100)+"%";
ax.innerHTML="";var lab=n===7?["Mon","Tue","Wed","Thu","Fri","Sat","Sun"]:[n+"d ago",Math.round(n*.75)+"d",Math.round(n/2)+"d",Math.round(n/4)+"d","today"];lab.forEach(function(s){var e=document.createElement("span");e.textContent=s;ax.appendChild(e)});
document.querySelectorAll(".tabs button").forEach(function(b){b.classList.toggle("on",+b.dataset.r===n)});hide()}
svg.addEventListener("mousemove",function(e){var r=svg.getBoundingClientRect(),d=D[cur],n=d.p.length,i=Math.round((e.clientX-r.left)/r.width*(n-1));i=Math.max(0,Math.min(n-1,i));var p=pts(d.p)[i],px=p[0]/W*100,py=p[1]/H*100;
cu.setAttribute("x1",p[0]);cu.setAttribute("x2",p[0]);cu.style.opacity=1;dt.style.left=px+"%";dt.style.top=py+"%";dt.style.opacity=1;
tp.textContent=d.p[i]+" pages · "+d.t[i]+" tasks · "+d.a[i]+" agent turns";tp.style.left=px+"%";tp.style.top=py+"%";tp.style.transform="translate("+(px<18?"-8%":px>82?"-92%":"-50%")+","+(py<30?"40%":"-125%")+")";tp.style.opacity=1});
svg.addEventListener("mouseleave",hide);
document.querySelectorAll(".tabs button").forEach(function(b){b.onclick=function(){show(+b.dataset.r)}});
show(7);
</script>
</div>`;

/**
 * "What an agent builds from one sentence": a sprint burndown whose
 * projection reacts to a scope slider. Follows the same embed rules the
 * agent skill teaches (theme variables, no libraries, no blank lines)
 * and keeps the slider position via cotenk.save().
 */
const BURNDOWN_EMBED = `<div class="bd">
<style>
.bd{padding:4px 2px}
.bd .hd{display:flex;align-items:center;justify-content:space-between;gap:12px;font-size:12px;color:var(--ck-ink-2);margin-bottom:8px;flex-wrap:wrap}
.bd .hd b{color:var(--ck-ink);font-variant-numeric:tabular-nums}
.bd label{display:flex;align-items:center;gap:8px;color:var(--ck-ink-3)}
.bd input[type=range]{width:160px;accent-color:var(--ck-accent)}
.bd svg{display:block;width:100%;height:140px}
.bd .ideal{fill:none;stroke:var(--ck-ink-3);stroke-width:1.5;stroke-dasharray:4 4;vector-effect:non-scaling-stroke}
.bd .act{fill:none;stroke:var(--ck-accent);stroke-width:2.5;stroke-linejoin:round;vector-effect:non-scaling-stroke}
.bd .proj{fill:none;stroke:var(--ck-accent);stroke-width:1.5;stroke-dasharray:2 5;opacity:.7;vector-effect:non-scaling-stroke}
.bd .lbl{display:flex;justify-content:space-between;font-size:10.5px;color:var(--ck-ink-3);margin-top:4px}
.bd .st{margin-top:8px;font-size:12px;color:var(--ck-ink-2)}
.bd .st.late{color:var(--ck-danger)}
</style>
<div class="hd"><span>Sprint 14 · <b id="sc">42</b> points in scope · 20 done by day 7</span><label>Scope<input id="rg" type="range" min="30" max="70" value="42"></label></div>
<svg viewBox="0 0 600 140" preserveAspectRatio="none"><path class="ideal" id="id"></path><path class="act" id="ac"></path><path class="proj" id="pj"></path></svg>
<div class="lbl"><span>Day 1</span><span>Day 5</span><span>Day 10 · sprint ends</span></div>
<div class="st" id="st"></div>
<script>
var done=[0,3,7,9,14,18,20],DAYS=10,W=600,H=140,P=6,last=done.length-1;
function y(v,max){return P+(1-v/max)*(H-2*P)}
function x(d){return d/(DAYS-1)*W}
function render(scope){document.getElementById("sc").textContent=scope;
document.getElementById("id").setAttribute("d","M0 "+y(scope,scope)+" L"+W+" "+y(0,scope));
document.getElementById("ac").setAttribute("d","M"+done.map(function(v,i){return x(i)+" "+y(Math.max(0,scope-v),scope)}).join(" L"));
var rate=done[last]/last,left=scope-done[last],endDay=last+left/rate,pe=Math.min(endDay,DAYS-1);
document.getElementById("pj").setAttribute("d","M"+x(last)+" "+y(left,scope)+" L"+x(pe)+" "+y(Math.max(0,left-rate*(pe-last)),scope));
var st=document.getElementById("st"),late=endDay>DAYS-1,cut=Math.ceil(left-rate*(DAYS-1-last));st.className="st"+(late?" late":"");
st.textContent=late?"At "+rate.toFixed(1)+" pts/day this lands "+Math.ceil(endDay-(DAYS-1))+" day(s) late. Cut "+cut+" pts or move the slider.":"On track — "+left+" pts left, done around day "+Math.ceil(endDay+1)+"."}
var rg=document.getElementById("rg"),s0=(cotenk.state&&cotenk.state.scope)||42;rg.value=s0;rg.oninput=function(){render(+rg.value)};rg.onchange=function(){cotenk.save({scope:+rg.value})};render(s0);
</script>
</div>`;

export const seedDocs: Doc[] = [
  {
    id: WELCOME_ID,
    folderId: null,
    title: "Welcome to CoTenk",
    pinned: true,
    updatedAt: Date.now() - 1000 * 60 * 12,
    content: `Think together. Work together. CoTenk is an open workspace where people and AI agents share the same pages, tasks and context. This page is not a tour — it is the product. Everything below is editable, including the chart.

${PULSE_EMBED}

## Try it in 60 seconds

- [ ] Click the chart above, change a number in its code, click away @you due:${inDays(0)}
- [ ] Type / on an empty line — table, callout, chart, progress bars @you
- [ ] Click **Ask agent** at the top of this page and pick "Extract action items" @devin
- [ ] Press Ctrl K — search every page or ask the agent from anywhere @you due:${inDays(3)}

## Every block is markdown — including that chart

Click any block to see its source, click away to see it rendered. The chart is a few dozen lines of plain HTML inside this file: no plugin, no proprietary block format, nothing to install. That is why agents work so well here — they write files, and a file is all a page is.

> 💡 The theme reaches into embeds as CSS variables (var(--ck-accent), var(--ck-panel), …). Switch light and dark in the rail — the chart follows.

## What an agent turns one sentence into

Ask *"Build me a sprint burndown I can adjust when scope changes"* and a block like this lands in your page, written directly into the file:

${BURNDOWN_EMBED}

Agents follow the same rules as this page: plain markdown, self-contained HTML, theme variables. Claude Code or Devin CLI run locally on your machine, inside your workspace folder — you watch the changes land here and can undo them with Ctrl Z. Move the slider: the widget remembers where you left it.

[Connect an agent](cotenk:connect-agent)

## Tasks live where the work is

Any \`- [ ]\` on any page is a task. Add @name for an owner and due:YYYY-MM-DD for a date. They roll up in Tasks, grouped by page or by date — and any task can be handed to an agent, who checks it off in the page itself.

- [ ] Rename this page and make it your project's front door @you due:${inDays(1)}
- [ ] Draft release notes from this week's commits @claude
- [ ] Read how pages map to files in [[Sync Architecture]] @team due:${inDays(5)}

## Bring your notes

Drop a Notion export (.zip), an Obsidian vault or a handful of .md files anywhere on this window — they become pages in seconds, links and databases included. Then ask an agent to summarize your weekly notes.

[Import notes](cotenk:import)

## Yours to keep

This workspace lives on your device — no account, no cloud. In the desktop app every page is a plain .md file in your workspace folder, so you can back it up, put it in git or open it in any editor. Edit anything, delete this page, make it yours.

> A workspace is not an agent. It is the place where agents and people meet.
`,
  },
  {
    id: "d-architecture",
    folderId: "f-engineering",
    title: "Sync Architecture",
    pinned: true,
    updatedAt: Date.now() - 1000 * 60 * 60 * 3,
    content: `How CoTenk keeps the app and the workspace folder in agreement without a conflict UI.

## Source of truth

Everything stays on this device. The workspace folder is the working copy: every page is a markdown file with a small frontmatter block (cotenk-id, title, folder, pinned). Agents edit those files directly.

## Sync loop

1. Agent or user writes a file
2. Watcher emits a debounced change event
3. The app reconciles folder and pages in both directions
4. Identical states produce zero writes, so the loop settles at once

## Conflict policy

Single writer per document. The newer side wins (file time vs. page time). Files without a cotenk-id are adopted as new pages, never deleted.

## Open questions

How do embedded widgets get sandboxed, and which parts of a document are readable by which agent. Decisions so far are in [[Weekly Sync]]; the bigger picture is in [[Roadmap Notes]].
`,
  },
  {
    id: "d-roadmap",
    folderId: "f-product",
    title: "Roadmap Notes",
    pinned: false,
    updatedAt: Date.now() - 1000 * 60 * 60 * 26,
    content: `## Phase one

Markdown workspace with folders, documents and local state. No account — pages live on the device and in a plain folder of .md files.

## Phase two

ACP integration. Devin CLI first because it supports ACP out of the box. Prompts stay local, nothing is persisted.

## Phase three

Embeds inside pages. Interactive diagrams and small widgets generated by agents, rendered in a sandboxed frame. HTML and self-contained code only, no heavy install chains. See [[Sync Architecture]] for how agents reach the files.

## Later

Other agents, optionally models wired through a user supplied API key.
`,
  },
  {
    id: "d-meeting",
    folderId: "f-product",
    title: "Weekly Sync",
    pinned: false,
    updatedAt: Date.now() - 1000 * 60 * 60 * 50,
    content: `## Decisions

- Documents stay plain markdown, no proprietary block format
- Sidebar keeps a pinned section above the folder tree
- Contents panel opens per document, not globally

## Follow ups

- [ ] Prototype the block editor without persistence @you due:${inDays(-1)}
- [ ] Document the page frontmatter format @devin
- [ ] Sketch the embed sandbox contract for the [[Roadmap Notes]] @team due:${inDays(5)}
`,
  },
];
