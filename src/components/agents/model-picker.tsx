import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Check, Image as ImageIcon, MagnifyingGlass } from "@phosphor-icons/react";
import {
  EFFORT_LABEL,
  groupModels,
  parseModelValue,
  resolveVariant,
  type Effort,
  type ModelFamily,
  type ModelOption,
  type ParsedValue,
} from "@/lib/agent-models";

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

/**
 * Two-pane model menu: family list with search on the left, per-model
 * settings (reasoning effort, fast mode, context) on the right —
 * modelled after the Devin Desktop picker.
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

  const initial = useMemo(
    () => (active ? parseModelValue(active) : null),
    [active],
  );
  const [query, setQuery] = useState("");
  const [famId, setFamId] = useState<string | null>(initial?.family ?? null);
  const [effort, setEffort] = useState<Effort | null>(initial?.effort ?? null);
  const [fast, setFast] = useState(initial?.fast ?? false);
  const [ctx1m, setCtx1m] = useState(initial?.ctx1m ?? false);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  const q = query.trim().toLowerCase();
  const visible = q
    ? families.filter(
        (f) =>
          f.label.toLowerCase().includes(q) || f.id.toLowerCase().includes(q),
      )
    : families;

  const fam = families.find((f) => f.id === famId) ?? null;
  const activeFamId = initial?.family ?? null;

  const recent = useMemo(
    () =>
      readRecent()
        .map((v) => ({
          value: v,
          fam: families.find((f) => f.id === parseModelValue(v).family),
          parsed: parseModelValue(v),
        }))
        .filter((r) => r.fam),
    [families],
  );

  const choose = (value: string) => {
    pushRecent(value);
    onPick(value);
    onClose();
  };

  /** Apply a config change for the open family. */
  const apply = (e: Effort | null, f: boolean, c: boolean) => {
    if (!fam) return;
    setEffort(e);
    setFast(f);
    setCtx1m(c);
    choose(resolveVariant(fam, e, f, c).value);
  };

  /**
   * Click on a family selects it: with the knobs already previewed on
   * hover, otherwise with its defaults. (Previously a click only
   * previewed, so models without effort options could not be chosen.)
   */
  const pickFamily = (f: ModelFamily) => {
    if (fam?.id === f.id) {
      choose(resolveVariant(f, effort, fast, ctx1m).value);
      return;
    }
    const cur = parseModelValue(active);
    const e =
      f.id === cur.family
        ? cur.effort
        : (f.efforts.find((x) => x === "medium") ?? f.efforts[0] ?? null);
    choose(resolveVariant(f, e, false, false).value);
  };

  const selectFamily = (f: ModelFamily, seed?: ParsedValue) => {
    if (fam?.id === f.id) return; // already previewing — don't reset knobs
    setFamId(f.id);
    if (seed) {
      setEffort(seed.effort);
      setFast(seed.fast);
      setCtx1m(seed.ctx1m);
      return;
    }
    const cur = parseModelValue(active);
    if (f.id === cur.family) {
      setEffort(cur.effort);
      setFast(cur.fast);
      setCtx1m(cur.ctx1m);
    } else {
      setEffort(
        f.efforts.find((e) => e === "medium") ?? f.efforts[0] ?? null,
      );
      setFast(false);
      setCtx1m(false);
    }
  };

  const resolved = fam ? resolveVariant(fam, effort, fast, ctx1m) : null;

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
      className={`absolute right-0 z-40 flex ${header ? "h-[400px]" : "h-[360px]"} w-[480px] max-w-[calc(100vw-24px)] flex-col overflow-hidden ${
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
      <div className="flex w-[240px] shrink-0 flex-col border-r border-line-soft">
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
                  detail={r.parsed.effort ? EFFORT_LABEL[r.parsed.effort] : ""}
                  selected={r.value === active}
                  open={fam?.id === r.fam!.id}
                  onClick={() => choose(r.value)}
                  onHover={() => selectFamily(r.fam!, r.parsed)}
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
              detail={
                f.variants.length > 1 ? `${f.variants.length}` : ""
              }
              selected={
                activeFamId === f.id &&
                !!resolved &&
                fam?.id === f.id &&
                resolved.value === active
              }
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
        {!fam ? (
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
                <p className="mt-0.5 font-mono text-[10.5px] text-ink-3">
                  {resolved?.name ?? ""}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {ctx1m && (
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
                      onClick={() => apply(e, fast, ctx1m)}
                      className={`h-6 rounded-[6px] border px-2 text-[11px] transition-colors duration-100 ${
                        effort === e
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
                on={fast}
                onToggle={() => apply(effort, !fast, ctx1m)}
              />
            )}
            {fam.hasCtx1m && (
              <ToggleRow
                label="1M context"
                desc="Extended context window"
                on={ctx1m}
                onToggle={() => apply(effort, fast, !ctx1m)}
              />
            )}

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
      <span
        className="grid h-5 w-5 shrink-0 place-items-center rounded-[5px] text-[10px] font-semibold"
        style={{
          backgroundColor: `hsl(${hue} 30% 30% / 0.25)`,
          color: `hsl(${hue} 60% 70%)`,
        }}
      >
        {fam.label[0]?.toUpperCase()}
      </span>
      <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink">
        {fam.label}
      </span>
      {detail && (
        <span className="shrink-0 font-mono text-[9.5px] text-ink-3">
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
    </button>
  );
}
