import { CheckCircle } from "@phosphor-icons/react";
import { useWorkspace, type ThemePref } from "@/lib/store";

/* mini theme swatches: real palette hexes, intentionally not tokens */
const DARK = { canvas: "#131211", panel: "#1c1a18", accent: "#e2a05c" };
const LIGHT = { canvas: "#f4f2ea", panel: "#ffffff", accent: "#a8641c" };

type Palette = typeof DARK;

const OPTIONS: {
  value: ThemePref;
  label: string;
  sub: string;
  palettes: Palette[];
}[] = [
  { value: "dark", label: "Dark", sub: "Warm charcoal", palettes: [DARK] },
  { value: "light", label: "Light", sub: "Warm bone", palettes: [LIGHT] },
  {
    value: "system",
    label: "System",
    sub: "Follows your computer",
    palettes: [DARK, LIGHT],
  },
];

function Swatch({ p }: { p: Palette }) {
  return (
    <div
      className="flex min-w-0 flex-1 flex-col gap-1.5 p-2.5"
      style={{ backgroundColor: p.canvas }}
    >
      <div className="h-2 w-1/2 rounded-full" style={{ backgroundColor: p.panel }} />
      <div className="h-2 w-2/3 rounded-full" style={{ backgroundColor: p.panel }} />
      <div
        className="mt-auto h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: p.accent }}
      />
    </div>
  );
}

/** Dark / Light / System cards; a pick applies right away. */
export function ThemePicker() {
  const themePref = useWorkspace((s) => s.themePref);
  const setTheme = useWorkspace((s) => s.setTheme);

  return (
    <div
      className="grid grid-cols-1 gap-3 sm:grid-cols-3"
      role="radiogroup"
      aria-label="Theme"
    >
      {OPTIONS.map(({ value, label, sub, palettes }) => {
        const active = themePref === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setTheme(value)}
            className={`relative cursor-pointer rounded-[10px] border p-3 text-left transition-colors duration-150 ${
              active
                ? "border-accent bg-accent-dim"
                : "border-line bg-panel hover:bg-panel-2"
            }`}
          >
            {active && (
              <CheckCircle
                size={15}
                weight="fill"
                className="absolute right-3 top-3 text-accent"
              />
            )}
            <div className="flex h-16 overflow-hidden rounded-[8px] border border-line">
              {palettes.map((p) => (
                <Swatch key={p.canvas} p={p} />
              ))}
            </div>
            <div className="mt-2.5 text-[12.5px] text-ink-2">{label}</div>
            <div className="text-[11px] text-ink-3">{sub}</div>
          </button>
        );
      })}
    </div>
  );
}
