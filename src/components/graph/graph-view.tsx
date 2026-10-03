import { useEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import {
  ArrowsClockwise,
  FolderSimple,
  Graph,
  Lightning,
  User,
} from "@phosphor-icons/react";
import { useWorkspace } from "@/lib/store";
import { agentForHandle } from "@/lib/agents";
import { extractTasks } from "@/lib/tasks";
import { outgoingTitles, titleKey } from "@/lib/wikilinks";

/**
 * Graph of the workspace: pages, the folders they sit in, and the people
 * and agents their open tasks are assigned to. [[Links]] and subpages
 * connect pages. Laid out live by a small force simulation on a canvas —
 * drag nodes, pan, zoom, hover to light up a neighborhood, click a page
 * to open it.
 */

type Kind = "page" | "folder" | "person" | "agent";

type GNode = {
  id: string;
  kind: Kind;
  label: string;
  docId?: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  /** Pinned while dragged. */
  fixed: boolean;
};

type GEdge = { a: number; b: number; kind: "link" | "parent" | "folder" | "task" };

type Colors = {
  canvas: string;
  ink: string;
  ink2: string;
  ink3: string;
  line: string;
  accent: string;
  accent2: string;
  panel: string;
};

function readColors(): Colors {
  const cs = getComputedStyle(document.documentElement);
  const v = (n: string) => cs.getPropertyValue(n).trim();
  return {
    canvas: v("--canvas"),
    ink: v("--ink"),
    ink2: v("--ink-2"),
    ink3: v("--ink-3"),
    line: v("--line"),
    accent: v("--accent"),
    accent2: v("--accent-2"),
    panel: v("--panel"),
  };
}

function buildGraph(
  docs: ReturnType<typeof useWorkspace.getState>["docs"],
  folders: ReturnType<typeof useWorkspace.getState>["folders"],
  show: { folders: boolean; people: boolean },
) {
  const nodes: GNode[] = [];
  const index = new Map<string, number>();
  const add = (n: Omit<GNode, "x" | "y" | "vx" | "vy" | "fixed">) => {
    index.set(n.id, nodes.length);
    // Everything starts near the middle and bursts outwards.
    const a = Math.random() * Math.PI * 2;
    const d = Math.random() * 30;
    nodes.push({ ...n, x: Math.cos(a) * d, y: Math.sin(a) * d, vx: 0, vy: 0, fixed: false });
  };
  const edges: GEdge[] = [];
  const link = (from: string, to: string, kind: GEdge["kind"]) => {
    const a = index.get(from);
    const b = index.get(to);
    if (a === undefined || b === undefined || a === b) return;
    edges.push({ a, b, kind });
  };

  const byTitle = new Map(docs.map((d) => [titleKey(d.title || "Untitled"), d.id]));
  for (const d of docs) {
    add({ id: `p:${d.id}`, kind: "page", label: d.title.trim() || "Untitled", docId: d.id, r: 5 });
  }
  if (show.folders) {
    for (const f of folders) {
      if (docs.some((d) => d.folderId === f.id)) {
        add({ id: `f:${f.id}`, kind: "folder", label: f.name, r: 7 });
      }
    }
  }
  for (const d of docs) {
    if (d.parentId) link(`p:${d.parentId}`, `p:${d.id}`, "parent");
    else if (show.folders && d.folderId) link(`f:${d.folderId}`, `p:${d.id}`, "folder");
    if (d.content.includes("[[")) {
      for (const t of outgoingTitles(d.content)) {
        const target = byTitle.get(titleKey(t));
        if (target) link(`p:${d.id}`, `p:${target}`, "link");
      }
    }
  }
  if (show.people) {
    for (const t of extractTasks(docs)) {
      if (t.done) continue;
      for (const raw of t.assignees) {
        const name = raw.toLowerCase();
        const id = `h:${name}`;
        if (!index.has(id)) {
          add({
            id,
            kind: agentForHandle(name) ? "agent" : "person",
            label: `@${name}`,
            r: 6,
          });
        }
        link(id, `p:${t.docId}`, "task");
      }
    }
  }
  // Busier nodes are bigger.
  const degree = new Array(nodes.length).fill(0);
  for (const e of edges) {
    degree[e.a]++;
    degree[e.b]++;
  }
  nodes.forEach((n, i) => {
    n.r += Math.sqrt(degree[i]) * 1.6;
  });
  const neighbors = nodes.map(() => new Set<number>());
  for (const e of edges) {
    neighbors[e.a].add(e.b);
    neighbors[e.b].add(e.a);
  }
  return { nodes, edges, neighbors };
}

export function GraphView() {
  const docs = useWorkspace((s) => s.docs);
  const folders = useWorkspace((s) => s.folders);
  const theme = useWorkspace((s) => s.theme);
  const setActiveDoc = useWorkspace((s) => s.setActiveDoc);
  const reduceMotion = useReducedMotion();
  const [show, setShow] = useState({ folders: true, people: true });
  const [seed, setSeed] = useState(0);
  const [hoverLabel, setHoverLabel] = useState<GNode | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // Nothing is edited here, so pages only change under the graph when an
  // agent or the folder mirror writes — then it lays out again.
  const graph = useMemo(
    () => buildGraph(docs, folders, show),
    // `seed` re-runs the layout from scratch ("Lay out again").
    [docs, folders, show, seed],
  );

  const counts = useMemo(() => {
    const c = { page: 0, folder: 0, person: 0, agent: 0 };
    graph.nodes.forEach((n) => c[n.kind]++);
    return { ...c, links: graph.edges.length };
  }, [graph]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { nodes, edges, neighbors } = graph;
    let colors = readColors();
    let w = 0;
    let h = 0;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const view = { x: 0, y: 0, k: 1 };
    let alpha = 1;
    let hover = -1;
    let drag: { node: number; moved: boolean } | null = null;
    let pan: { x: number; y: number; vx: number; vy: number } | null = null;
    let raf = 0;
    let started = performance.now();
    /** Follows the layout until the person pans or zooms themselves. */
    let autoFit = true;
    const fewNodes = nodes.length <= 40;

    const resize = () => {
      const r = wrap.getBoundingClientRect();
      w = r.width;
      h = r.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      wake();
    };

    const toWorld = (sx: number, sy: number) => ({
      x: (sx - w / 2 - view.x) / view.k,
      y: (sy - h / 2 - view.y) / view.k,
    });

    const pick = (sx: number, sy: number) => {
      const p = toWorld(sx, sy);
      let best = -1;
      let bestD = Infinity;
      nodes.forEach((n, i) => {
        const d = Math.hypot(n.x - p.x, n.y - p.y);
        if (d < n.r + 6 / view.k && d < bestD) {
          best = i;
          bestD = d;
        }
      });
      return best;
    };

    const step = () => {
      const n = nodes.length;
      // Repulsion (n² — fine for a personal workspace).
      for (let i = 0; i < n; i++) {
        const a = nodes[i];
        for (let j = i + 1; j < n; j++) {
          const b = nodes[j];
          let dx = b.x - a.x;
          let dy = b.y - a.y;
          let d2 = dx * dx + dy * dy;
          if (d2 < 0.01) {
            dx = Math.random() - 0.5;
            dy = Math.random() - 0.5;
            d2 = 0.25;
          }
          const f = (2600 * alpha) / d2;
          const d = Math.sqrt(d2);
          const fx = (dx / d) * f;
          const fy = (dy / d) * f;
          a.vx -= fx;
          a.vy -= fy;
          b.vx += fx;
          b.vy += fy;
        }
      }
      // Springs.
      for (const e of edges) {
        const a = nodes[e.a];
        const b = nodes[e.b];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        const rest = e.kind === "folder" ? 90 : e.kind === "task" ? 120 : 110;
        const f = (d - rest) * 0.04 * alpha;
        const fx = (dx / d) * f;
        const fy = (dy / d) * f;
        a.vx += fx;
        a.vy += fy;
        b.vx -= fx;
        b.vy -= fy;
      }
      for (const node of nodes) {
        // Gentle pull to the middle keeps islands on screen.
        node.vx -= node.x * 0.012 * alpha;
        node.vy -= node.y * 0.012 * alpha;
        if (node.fixed) {
          node.vx = 0;
          node.vy = 0;
          continue;
        }
        node.vx *= 0.82;
        node.vy *= 0.82;
        node.x += node.vx;
        node.y += node.vy;
      }
      alpha = Math.max(0, alpha * 0.985 - 0.0005);
    };

    /** Eases the view towards the layout's bounding box. */
    const fit = (instant = false) => {
      if (!autoFit || nodes.length === 0 || w === 0) return false;
      let x0 = Infinity;
      let y0 = Infinity;
      let x1 = -Infinity;
      let y1 = -Infinity;
      for (const n of nodes) {
        x0 = Math.min(x0, n.x - n.r);
        y0 = Math.min(y0, n.y - n.r);
        x1 = Math.max(x1, n.x + n.r);
        y1 = Math.max(y1, n.y + n.r + 18);
      }
      const k = Math.min(1.8, (w - 200) / Math.max(1, x1 - x0), (h - 140) / Math.max(1, y1 - y0));
      const tx = -((x0 + x1) / 2) * k;
      const ty = -((y0 + y1) / 2) * k;
      const t = instant ? 1 : 0.07;
      view.k += (k - view.k) * t;
      view.x += (tx - view.x) * t;
      view.y += (ty - view.y) * t;
      return Math.abs(k - view.k) > 0.002 || Math.abs(tx - view.x) > 0.5;
    };

    const draw = (t: number) => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.translate(w / 2 + view.x, h / 2 + view.y);
      ctx.scale(view.k, view.k);
      const lit = hover >= 0 ? neighbors[hover] : null;
      const isLit = (i: number) => !lit || i === hover || lit.has(i);
      // Intro: edges draw in after the burst.
      const intro = reduceMotion ? 1 : Math.min(1, (t - started) / 900);

      for (const e of edges) {
        const a = nodes[e.a];
        const b = nodes[e.b];
        const on = !lit || e.a === hover || e.b === hover;
        ctx.globalAlpha = (on ? (lit ? 0.9 : 0.45) : 0.08) * intro;
        ctx.strokeStyle = on && lit ? colors.accent : e.kind === "link" ? colors.ink3 : colors.line;
        ctx.lineWidth = (e.kind === "link" ? 1.4 : 1) / view.k;
        if (e.kind === "task") ctx.setLineDash([3 / view.k, 3 / view.k]);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(a.x + (b.x - a.x) * intro, a.y + (b.y - a.y) * intro);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      nodes.forEach((n, i) => {
        const on = isLit(i);
        ctx.globalAlpha = on ? 1 : 0.18;
        const fill =
          n.kind === "page"
            ? i === hover
              ? colors.accent
              : colors.ink2
            : n.kind === "agent"
              ? colors.accent
              : n.kind === "person"
                ? colors.accent2
                : colors.panel;
        if (n.kind === "agent" || (i === hover && n.kind === "page")) {
          // Soft halo — agents glow, a hovered page too.
          const pulse = reduceMotion ? 0 : (Math.sin(t / 420 + i) + 1) / 2;
          ctx.globalAlpha = (on ? 0.22 : 0.05) + pulse * 0.08;
          ctx.fillStyle = colors.accent;
          ctx.beginPath();
          ctx.arc(n.x, n.y, n.r + 5 + pulse * 3, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = on ? 1 : 0.18;
        }
        ctx.fillStyle = fill;
        ctx.beginPath();
        if (n.kind === "folder") {
          const s = n.r;
          ctx.roundRect(n.x - s, n.y - s, s * 2, s * 2, 3);
          ctx.fill();
          ctx.lineWidth = 1.5 / view.k;
          ctx.strokeStyle = colors.ink3;
          ctx.stroke();
        } else {
          ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
          ctx.fill();
          if (n.kind === "person") {
            ctx.lineWidth = 1.5 / view.k;
            ctx.strokeStyle = colors.canvas;
            ctx.stroke();
          }
        }
        // Labels: hovered neighborhood, hubs, or everything when zoomed in.
        const showLabel =
          i === hover ||
          (lit && on) ||
          (!lit && (fewNodes || n.kind !== "page" || n.r > 9 || view.k > 1.3));
        if (showLabel) {
          ctx.globalAlpha = on ? (i === hover ? 1 : 0.85) : 0.2;
          ctx.fillStyle = i === hover ? colors.ink : colors.ink2;
          ctx.font = `${i === hover ? 600 : 500} ${11.5 / Math.max(0.8, view.k)}px ${getComputedStyle(document.body).fontFamily}`;
          ctx.textAlign = "center";
          ctx.textBaseline = "top";
          const label = n.label.length > 28 ? `${n.label.slice(0, 27)}…` : n.label;
          ctx.fillText(label, n.x, n.y + n.r + 4 / view.k);
        }
      });
      ctx.globalAlpha = 1;
    };

    const loop = (t: number) => {
      if (alpha > 0.002) step();
      const fitting = fit();
      draw(t);
      // Keep animating while settling, during the intro and for halos.
      const agentHalo = !reduceMotion && nodes.some((n) => n.kind === "agent");
      if (alpha > 0.002 || fitting || t - started < 1000 || agentHalo || hover >= 0) {
        raf = requestAnimationFrame(loop);
      } else {
        raf = 0;
      }
    };
    const wake = (heat = 0) => {
      alpha = Math.max(alpha, heat);
      if (!raf) raf = requestAnimationFrame(loop);
    };

    if (reduceMotion) {
      // Settle off-screen, then show the finished layout.
      for (let i = 0; i < 400 && alpha > 0.002; i++) step();
      started = -Infinity;
      w = wrap.getBoundingClientRect().width;
      h = wrap.getBoundingClientRect().height;
      fit(true);
    }

    const local = (e: PointerEvent | WheelEvent) => {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };

    const onDown = (e: PointerEvent) => {
      const p = local(e);
      const i = pick(p.x, p.y);
      canvas.setPointerCapture(e.pointerId);
      if (i >= 0) {
        drag = { node: i, moved: false };
        nodes[i].fixed = true;
        wake(0.3);
      } else {
        pan = { x: p.x, y: p.y, vx: view.x, vy: view.y };
        autoFit = false;
      }
    };
    const onMove = (e: PointerEvent) => {
      const p = local(e);
      if (drag) {
        const wpt = toWorld(p.x, p.y);
        const n = nodes[drag.node];
        if (Math.hypot(wpt.x - n.x, wpt.y - n.y) > 1) drag.moved = true;
        n.x = wpt.x;
        n.y = wpt.y;
        wake(0.3);
        return;
      }
      if (pan) {
        view.x = pan.vx + (p.x - pan.x);
        view.y = pan.vy + (p.y - pan.y);
        wake();
        return;
      }
      const i = pick(p.x, p.y);
      if (i !== hover) {
        hover = i;
        canvas.style.cursor = i >= 0 ? (nodes[i].docId ? "pointer" : "grab") : "default";
        setHoverLabel(i >= 0 ? nodes[i] : null);
        wake();
      }
    };
    const onUp = (e: PointerEvent) => {
      if (drag) {
        const n = nodes[drag.node];
        n.fixed = false;
        if (!drag.moved && n.docId) setActiveDoc(n.docId);
      }
      drag = null;
      pan = null;
      canvas.releasePointerCapture(e.pointerId);
    };
    const onLeave = () => {
      if (hover >= 0) {
        hover = -1;
        setHoverLabel(null);
        wake();
      }
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      autoFit = false;
      const p = local(e);
      const before = toWorld(p.x, p.y);
      view.k = Math.min(3, Math.max(0.3, view.k * Math.exp(-e.deltaY * 0.0015)));
      view.x = p.x - w / 2 - before.x * view.k;
      view.y = p.y - h / 2 - before.y * view.k;
      wake();
    };

    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    resize();
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointerleave", onLeave);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    const themeTimer = setTimeout(() => {
      colors = readColors();
      wake();
    }, 260);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(themeTimer);
      ro.disconnect();
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointerleave", onLeave);
      canvas.removeEventListener("wheel", onWheel);
    };
  }, [graph, theme, reduceMotion, setActiveDoc]);

  const chip = (on: boolean) =>
    `flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[12px] transition-colors duration-150 ${
      on
        ? "border-accent-line bg-accent-dim text-ink"
        : "border-line bg-panel text-ink-3 hover:text-ink-2"
    }`;

  return (
    <div className="relative flex h-dvh min-w-0 flex-1 flex-col bg-canvas">
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-line-soft px-4">
        <Graph size={15} className="text-ink-3" />
        <span className="text-[13px] font-semibold text-ink">Graph</span>
        <span className="font-mono text-[11.5px] text-ink-3">
          {counts.page} pages · {counts.links} connections
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            aria-pressed={show.folders}
            onClick={() => setShow((s) => ({ ...s, folders: !s.folders }))}
            className={chip(show.folders)}
          >
            <FolderSimple size={13} />
            Folders
          </button>
          <button
            type="button"
            aria-pressed={show.people}
            onClick={() => setShow((s) => ({ ...s, people: !s.people }))}
            className={chip(show.people)}
          >
            <Lightning size={13} />
            People & agents
          </button>
          <button
            type="button"
            onClick={() => setSeed((n) => n + 1)}
            aria-label="Lay out again"
            title="Lay out again"
            className="grid h-7 w-7 place-items-center rounded-[7px] text-ink-3 transition-colors duration-150 hover:bg-hover hover:text-ink-2"
          >
            <ArrowsClockwise size={15} />
          </button>
        </div>
      </header>
      <div ref={wrapRef} className="relative min-h-0 flex-1 overflow-hidden">
        <canvas
          ref={canvasRef}
          className="absolute inset-0 touch-none"
          role="img"
          aria-label={`Graph of ${counts.page} pages and ${counts.links} connections`}
        />
        <Legend counts={counts} />
        {hoverLabel && (
          <motion.div
            key={hoverLabel.id}
            initial={reduceMotion ? false : { opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full border border-line bg-elev px-3 py-1.5 text-[12px] text-ink-2 shadow-[0_8px_24px_var(--color-shadow)]"
          >
            {hoverLabel.docId
              ? `${hoverLabel.label} — click to open, drag to move`
              : hoverLabel.label}
          </motion.div>
        )}
        {counts.page === 0 && (
          <p className="absolute inset-0 grid place-items-center text-[13px] text-ink-3">
            No pages yet.
          </p>
        )}
      </div>
    </div>
  );
}

function Legend({
  counts,
}: {
  counts: { page: number; folder: number; person: number; agent: number };
}) {
  const row = "flex items-center gap-2";
  return (
    <div className="pointer-events-none absolute left-4 top-4 flex flex-col gap-1.5 rounded-[10px] border border-line-soft bg-panel/80 px-3 py-2.5 text-[11.5px] text-ink-3 backdrop-blur">
      <span className={row}>
        <span className="h-2.5 w-2.5 rounded-full bg-ink-2" />
        Pages <span className="font-mono">{counts.page}</span>
      </span>
      {counts.folder > 0 && (
        <span className={row}>
          <span className="h-2.5 w-2.5 rounded-[3px] border border-ink-3 bg-panel" />
          Folders <span className="font-mono">{counts.folder}</span>
        </span>
      )}
      {counts.agent > 0 && (
        <span className={row}>
          <Lightning size={11} weight="fill" className="text-accent" />
          Agents <span className="font-mono">{counts.agent}</span>
        </span>
      )}
      {counts.person > 0 && (
        <span className={row}>
          <User size={11} weight="fill" className="text-accent-2" />
          People <span className="font-mono">{counts.person}</span>
        </span>
      )}
      <span className="mt-1 text-[10.5px]">
        solid = [[link]] · dashed = open task
      </span>
    </div>
  );
}
