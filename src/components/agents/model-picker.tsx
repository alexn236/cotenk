import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import {
  Atom,
  CaretDown,
  Check,
  Image as ImageIcon,
  MagnifyingGlass,
} from "@phosphor-icons/react";
import {
  EFFORT_LABEL,
  FUSION_ID,
  groupModels,
  modelCost,
  parseFusion,
  parseModelValue,
  resolveFusion,
  resolveVariant,
  type Effort,
  type FusionInfo,
  type FusionParts,
  type ModelFamily,
  type ModelOption,
  type ModelVariant,
} from "@/lib/agent-models";
import { formatPrice, PRICING_TIER, type ModelPrice } from "@/lib/agent-pricing";

const RECENT_KEY = "cotenk-recent-models";

function readRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const arr = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(arr)
      ? arr.filter((v): v is string => typeof v === "string").slice(0, 3)
      : [];
  } catch {
    return [];
  }
}

/** Same family never appears twice — a new pick replaces the older one
 *  even when only the reasoning effort differs. */
function pushRecent(value: string) {
  try {
    const fam = parseModelValue(value).family;
    const next = [
      value,
      ...readRecent().filter(
        (v) => v !== value && parseModelValue(v).family !== fam,
      ),
    ];
    localStorage.setItem(RECENT_KEY, JSON.stringify(next.slice(0, 3)));
  } catch {
    /* private mode */
  }
}

/** Vendor-ish tint for the family tile — stable hash of the id. */
function tileHue(id: string): number {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}

/** Knob state of the detail pane. `lead`/`sidekick` only matter for Fusion. */
type Knobs = {
  effort: Effort | null;
  fast: boolean;
  ctx1m: boolean;
  lead: string;
  sidekick: string;
};

/** Knobs for a family, seeded from a concrete value when it belongs to it. */
function knobsFor(f: ModelFamily, seed: string): Knobs {
  if (f.fusion) {
    const want: FusionParts = parseFusion(seed) ?? f.fusion.variants[0];
    // Show the combination that actually exists, not the one asked for.
    const { lead, effort, fast, sidekick } = resolveFusion(f.fusion, want);
    return { lead, effort, fast, sidekick, ctx1m: false };
  }
  const p = parseModelValue(seed);
  if (p.family === f.id) {
    return { effort: p.effort, fast: p.fast, ctx1m: p.ctx1m, lead: "", sidekick: "" };
  }
  return {
    effort: f.efforts.find((e) => e === "medium") ?? f.efforts[0] ?? null,
    fast: false,
    ctx1m: false,
    lead: "",
    sidekick: "",
  };
}

/** The real option a family + knobs combination maps to. */
function resolve(f: ModelFamily, k: Knobs): ModelVariant {
  if (f.fusion) {
    const v = resolveFusion(f.fusion, k);
    return f.variants.find((x) => x.value === v.value) ?? f.variants[0];
  }
  return resolveVariant(f, k.effort, k.fast, k.ctx1m);
}

/**
 * Two-pane model menu: family list with search on the left, per-model
 * settings (reasoning effort, fast mode, context, Fusion lead/sidekick)
 * and published pricing on the right — modelled after the Devin Desktop
 * picker.
 */
export function ModelPicker({
  models,
  active,
  onPick,
  onClose,
  placement = "up",
  header,
  note,
}: {
  /** Open above (composer at the bottom) or below the anchor. */
  placement?: "up" | "down";
  models: ModelOption[];
  /** Currently applied option value ("" = default). */
  active: string;
  onPick: (value: string) => void;
  onClose: () => void;
  /** Row above both panes (e.g. the agent switch). */
  header?: ReactNode;
  /** Small print under the model settings (billing hint). */
  note?: string;
}) {
  const reduceMotion = useReducedMotion();
  const families = useMemo(() => groupModels(models), [models]);
  const activeFamId = active ? parseModelValue(active).family : null;

  const [query, setQuery] = useState("");
  const [famId, setFamId] = useState<string | null>(activeFamId);
  const [knobs, setKnobs] = useState<Knobs | null>(() => {
    const f = families.find((x) => x.id === activeFamId);
    return f ? knobsFor(f, active) : null;
  });
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  const q = query.trim().toLowerCase();
  const visible = q
    ? families.filter(
        (f) =>
          f.label.toLowerCase().includes(q) ||
          f.id.toLowerCase().includes(q) ||
          // "fusion gpt" or "fusion glm" finds Fusion by its parts.
          (f.fusion &&
            [...f.fusion.leads, ...f.fusion.sidekicks].some((x) =>
              x.label.toLowerCase().includes(q),
            )),
      )
    : families;

  const fam = families.find((f) => f.id === famId) ?? null;

  const recent = useMemo(
    () =>
      readRecent()
        .map((v) => ({
          value: v,
          fam: families.find((f) => f.id === parseModelValue(v).family),
        }))
        .filter((r) => r.fam),
    [families],
  );

  const choose = (value: string, close = true) => {
    pushRecent(value);
    onPick(value);
    if (close) onClose();
  };

  /**
   * Apply a knob change for the open family. Fusion has four knobs, so
   * it applies live and stays open; single-knob families close.
   */
  const apply = (patch: Partial<Knobs>) => {
    if (!fam || !knobs) return;
    const next = { ...knobs, ...patch };
    const v = resolve(fam, next);
    // Keep the knobs honest when a combination doesn't exist.
    const fused = fam.fusion ? parseFusion(v.value) : null;
    setKnobs(fused ? { ...fused, ctx1m: false } : next);
    choose(v.value, !fam.fusion);
  };

  /** Click on a family selects it with the knobs shown (or its defaults). */
  const pickFamily = (f: ModelFamily) => {
    const k = fam?.id === f.id && knobs ? knobs : knobsFor(f, active);
    choose(resolve(f, k).value);
  };

  const selectFamily = (f: ModelFamily, seed?: string) => {
    if (fam?.id === f.id && !seed) return; // don't reset previewed knobs
    setFamId(f.id);
    setKnobs(knobsFor(f, seed ?? active));
  };

  const resolved = fam && knobs ? resolve(fam, knobs) : null;

  return (
    <motion.div
      role="dialog"
      aria-label="Model picker"
      initial={reduceMotion ? false : { opacity: 0, scale: 0.97, y: 4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: reduceMotion ? 1 : 0.97, y: 4 }}
      transition={
        reduceMotion
          ? { duration: 0.1 }
          : { type: "spring", duration: 0.22, bounce: 0 }
      }
      className={`absolute right-0 z-40 flex ${header ? "h-[440px]" : "h-[400px]"} w-[520px] max-w-[calc(100vw-24px)] flex-col overflow-hidden ${
        placement === "up"
          ? "bottom-full mb-1.5 origin-bottom"
          : "top-full mt-1.5 origin-top"
      } rounded-[12px] border border-line bg-panel shadow-[0_16px_48px_var(--color-shadow)]`}
    >
      {header && (
        <div className="shrink-0 border-b border-line-soft p-2">{header}</div>
      )}
      <div className="flex min-h-0 flex-1">
        {/* left: search + family list */}
        <div className="flex w-[220px] shrink-0 flex-col border-r border-line-soft">
          <div className="flex items-center gap-1.5 border-b border-line-soft px-2.5 py-2">
            <MagnifyingGlass size={12} className="shrink-0 text-ink-3" />
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && visible[0]) selectFamily(visible[0]);
                if (e.key === "Escape") onClose();
              }}
              placeholder="Search all models"
              aria-label="Search models"
              spellCheck={false}
              className="w-full bg-transparent text-[12.5px] text-ink outline-none placeholder:text-ink-3"
            />
          </div>
          <div className="flex-1 overflow-y-auto p-1">
            {!q && recent.length > 0 && (
              <>
                <p className="px-2 pb-0.5 pt-1.5 text-[10px] font-medium uppercase tracking-[0.08em] text-ink-3">
                  Recently used
                </p>
                {recent.map((r) => (
                  <FamilyRow
                    key={`r-${r.value}`}
                    fam={r.fam!}
                    detail={recentDetail(r.fam!, r.value)}
                    selected={r.value === active}
                    open={fam?.id === r.fam!.id}
                    onClick={() => choose(r.value)}
                    onHover={() => selectFamily(r.fam!, r.value)}
                  />
                ))}
              </>
            )}
            {!q && (
              <p className="px-2 pb-0.5 pt-1.5 text-[10px] font-medium uppercase tracking-[0.08em] text-ink-3">
                Models
              </p>
            )}
            {visible.map((f) => (
              <FamilyRow
                key={f.id}
                fam={f}
                detail=""
                selected={activeFamId === f.id}
                open={fam?.id === f.id}
                onClick={() => pickFamily(f)}
                onHover={() => selectFamily(f)}
              />
            ))}
            {visible.length === 0 && (
              <p className="px-3 py-3 text-[11.5px] text-ink-3">
                No models match &quot;{query}&quot;.
              </p>
            )}
          </div>
        </div>

        {/* right: detail + settings */}
        <div className="flex min-w-0 flex-1 flex-col overflow-y-auto p-3">
          {!fam || !knobs || !resolved ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
              <p className="text-[12px] text-ink-3">
                Select a model to configure it.
              </p>
              {!active && (
                <p className="font-mono text-[10.5px] text-ink-3">
                  currently: account default
                </p>
              )}
            </div>
          ) : (
            <>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-medium text-ink">
                    {fam.label}
                  </p>
                  <p className="mt-0.5 text-[11px] leading-snug text-ink-3">
                    {fam.fusion
                      ? "Pairs a frontier lead model with a cost-efficient sidekick for execution."
                      : resolved.name}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {knobs.ctx1m && (
                    <span className="rounded-full border border-line px-1.5 py-0.5 font-mono text-[9.5px] text-ink-3">
                      1M ctx
                    </span>
                  )}
                  {fam.supportsImages && (
                    <span
                      title="Supports image input"
                      className="grid h-5 w-5 place-items-center rounded-[5px] border border-line text-ink-3"
                    >
                      <ImageIcon size={11} />
                    </span>
                  )}
                </div>
              </div>

              {fam.fusion ? (
                <FusionKnobs
                  info={fam.fusion}
                  knobs={knobs}
                  hasFast={fam.hasFast}
                  onChange={apply}
                />
              ) : (
                <>
                  {fam.efforts.length > 0 && (
                    <div className="mt-3">
                      <p className="mb-1 text-[10.5px] font-medium uppercase tracking-[0.08em] text-ink-3">
                        Reasoning effort
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {fam.efforts.map((e) => (
                          <button
                            key={e}
                            type="button"
                            onClick={() => apply({ effort: e })}
                            className={`h-6 rounded-[6px] border px-2 text-[11px] transition-colors duration-100 ${
                              knobs.effort === e
                                ? "border-accent-line bg-accent-dim text-accent"
                                : "border-line text-ink-2 hover:bg-hover"
                            }`}
                          >
                            {EFFORT_LABEL[e]}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {fam.hasFast && (
                    <ToggleRow
                      label="Fast mode"
                      desc="Throughput-optimized variant"
                      on={knobs.fast}
                      onToggle={() => apply({ fast: !knobs.fast })}
                    />
                  )}
                  {fam.hasCtx1m && (
                    <ToggleRow
                      label="1M context"
                      desc="Extended context window"
                      on={knobs.ctx1m}
                      onToggle={() => apply({ ctx1m: !knobs.ctx1m })}
                    />
                  )}
                </>
              )}

              <CostPanel
                value={resolved.value}
                label={fam.label}
                current={active}
                fusion={!!fam.fusion}
              />

              {note && (
                <p className="mt-3 font-mono text-[9.5px] text-ink-3">{note}</p>
              )}
            </>
          )}
        </div>
      </div>
    </motion.div>
  );
}

/** Small right-aligned hint in the "Recently used" rows. */
function recentDetail(f: ModelFamily, value: string): string {
  if (f.fusion) {
    const p = parseFusion(value);
    return f.fusion.leads.find((l) => l.id === p?.lead)?.label ?? "";
  }
  const e = parseModelValue(value).effort;
  return e ? EFFORT_LABEL[e] : "";
}

/* ---------- fusion ---------- */

function FusionKnobs({
  info,
  knobs,
  hasFast,
  onChange,
}: {
  info: FusionInfo;
  knobs: Knobs;
  hasFast: boolean;
  onChange: (patch: Partial<Knobs>) => void;
}) {
  // Efforts and sidekicks the chosen lead actually offers.
  const forLead = info.variants.filter((v) => v.lead === knobs.lead);
  const efforts = [
    ...new Set(forLead.map((v) => v.effort).filter((e): e is Effort => !!e)),
  ];
  const sidekicks = info.sidekicks.filter((s) =>
    forLead.some((v) => v.sidekick === s.id),
  );
  const leadHasFast = forLead.some((v) => v.fast);

  return (
    <div className="mt-3 flex flex-col">
      <SelectRow
        label="Lead"
        value={knobs.lead}
        options={info.leads.map((l) => ({ value: l.id, label: l.label }))}
        onChange={(lead) => onChange({ lead })}
      />
      <SelectRow
        label="Effort"
        value={knobs.effort ?? ""}
        options={efforts.map((e) => ({ value: e, label: EFFORT_LABEL[e] }))}
        onChange={(e) => onChange({ effort: e as Effort })}
      />
      <SelectRow
        label="Sidekick"
        value={knobs.sidekick}
        options={sidekicks.map((s) => ({ value: s.id, label: s.label }))}
        onChange={(sidekick) => onChange({ sidekick })}
      />
      {hasFast && leadHasFast && (
        <button
          type="button"
          role="switch"
          aria-checked={knobs.fast}
          onClick={() => onChange({ fast: !knobs.fast })}
          title="Faster lead model, higher price"
          className="flex items-center justify-between gap-3 py-1.5 text-left"
        >
          <span className="text-[12px] text-ink">Fast mode</span>
          <Switch on={knobs.fast} />
        </button>
      )}
    </div>
  );
}

function SelectRow({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 border-b border-line-soft py-1.5 last:border-b-0">
      <span className="text-[12px] text-ink">{label}</span>
      <span className="relative flex min-w-0 items-center">
        <select
          value={value}
          onChange={(e) => onChange(e.currentTarget.value)}
          className="max-w-[170px] cursor-pointer appearance-none truncate rounded-[6px] bg-transparent py-0.5 pl-2 pr-5 text-right text-[12px] text-ink-2 outline-none transition-colors hover:bg-hover focus-visible:bg-hover"
        >
          {options.map((o) => (
            <option key={o.value} value={o.value} className="bg-panel text-ink">
              {o.label}
            </option>
          ))}
        </select>
        <CaretDown
          size={10}
          className="pointer-events-none absolute right-1 text-ink-3"
        />
      </span>
    </label>
  );
}

/* ---------- cost ---------- */

/**
 * Published price of the previewed option, placed on a cheap → pricey
 * bar next to the model currently in use.
 */
function CostPanel({
  value,
  label,
  current,
  fusion,
}: {
  value: string;
  label: string;
  current: string;
  fusion: boolean;
}) {
  const cost = modelCost(value);
  if (!cost.main) return null;
  const now = current && current !== value ? modelCost(current) : null;

  return (
    <div className="mt-3 border-t border-line-soft pt-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[12px] text-ink">Cost</span>
        <span className="text-[10.5px] text-ink-3">
          Higher effort uses more tokens
        </span>
      </div>
      {cost.position !== null && (
        <div className="relative mb-6 mt-5 h-1.5 rounded-full bg-[linear-gradient(90deg,#22a06b,#8bbf3c,#e2b33c,#e2803c,#c95b8c,#8b6cf0)]">
          <CostMark at={cost.position} label={label} top />
          {now?.position != null && (
            <CostMark at={now.position} label="Current" />
          )}
        </div>
      )}
      <PriceGrid price={cost.main} />
      {fusion && cost.sidekick && (
        <>
          <p className="mt-2 text-[10px] font-medium uppercase tracking-[0.08em] text-ink-3">
            Sidekick
          </p>
          <PriceGrid price={cost.sidekick} />
        </>
      )}
      <p className="mt-1.5 font-mono text-[9.5px] text-ink-3">
        per 1M tokens · {PRICING_TIER === "pro" ? "self-serve" : "enterprise"} pricing
      </p>
    </div>
  );
}

function CostMark({
  at,
  label,
  top,
}: {
  at: number;
  label: string;
  top?: boolean;
}) {
  return (
    <span
      className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
      style={{ left: `${Math.round(at * 100)}%` }}
    >
      <span className="block h-2.5 w-2.5 rounded-full border-2 border-panel bg-ink" />
      <span
        className={`absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-[9.5px] ${
          top ? "bottom-full mb-1 text-ink-2" : "top-full mt-1 text-ink-3"
        }`}
      >
        {label}
      </span>
    </span>
  );
}

function PriceGrid({ price }: { price: ModelPrice }) {
  const cells: [string, number][] = [
    ["Input", price.input],
    ["Cached input", price.cached],
    ["Output", price.output],
  ];
  return (
    <div className="mt-1.5 grid grid-cols-3 gap-1">
      {cells.map(([k, v]) => (
        <div key={k} className="rounded-[6px] bg-panel-2 px-2 py-1">
          <div className="truncate text-[9.5px] text-ink-3">{k}</div>
          <div className="font-mono text-[11px] text-ink">{formatPrice(v)}</div>
        </div>
      ))}
    </div>
  );
}

/* ---------- rows ---------- */

function FamilyRow({
  fam,
  detail,
  selected,
  open,
  onClick,
  onHover,
}: {
  fam: ModelFamily;
  detail: string;
  selected: boolean;
  open: boolean;
  onClick: () => void;
  onHover?: () => void;
}) {
  const hue = tileHue(fam.id);
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={onHover}
      className={`flex w-full items-center gap-2 rounded-[7px] px-2 py-1.5 text-left transition-colors duration-100 ${
        open ? "bg-hover" : "hover:bg-hover"
      }`}
    >
      {fam.id === FUSION_ID ? (
        <span className="grid h-5 w-5 shrink-0 place-items-center rounded-[5px] bg-accent-dim text-accent">
          <Atom size={12} weight="bold" />
        </span>
      ) : (
        <span
          className="grid h-5 w-5 shrink-0 place-items-center rounded-[5px] text-[10px] font-semibold"
          // Mid lightness reads on both the dark and the light theme.
          style={{
            backgroundColor: `hsl(${hue} 45% 50% / 0.16)`,
            color: `hsl(${hue} 50% 50%)`,
          }}
        >
          {fam.label[0]?.toUpperCase()}
        </span>
      )}
      <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink">
        {fam.label}
      </span>
      {detail && (
        <span className="shrink-0 truncate font-mono text-[9.5px] text-ink-3">
          {detail}
        </span>
      )}
      {selected && <Check size={12} className="shrink-0 text-accent" />}
    </button>
  );
}

function ToggleRow({
  label,
  desc,
  on,
  onToggle,
}: {
  label: string;
  desc: string;
  on: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onToggle}
      className="mt-2.5 flex w-full items-center justify-between gap-2 rounded-[7px] border border-line-soft px-2 py-1.5 text-left transition-colors duration-100 hover:bg-hover"
    >
      <span className="min-w-0">
        <span className="block text-[12px] text-ink">{label}</span>
        <span className="block truncate text-[10.5px] text-ink-3">
          {desc}
        </span>
      </span>
      <Switch on={on} />
    </button>
  );
}

function Switch({ on }: { on: boolean }) {
  return (
    <span
      className={`relative h-4 w-7 shrink-0 rounded-full transition-colors duration-150 ${
        on ? "bg-accent" : "bg-line"
      }`}
    >
      <motion.span
        animate={{ x: on ? 13 : 1 }}
        transition={{ type: "spring", stiffness: 500, damping: 32 }}
        className="absolute top-0.5 h-3 w-3 rounded-full bg-panel"
      />
    </span>
  );
}
