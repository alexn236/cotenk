import { motion } from "motion/react";
import {
  CheckSquare,
  Files,
  GearSix,
  House,
  Lightning,
  MagnifyingGlass,
  Moon,
  Storefront,
  Sun,
  type Icon,
} from "@phosphor-icons/react";
import { useWorkspace } from "@/lib/store";
import { useAgent } from "@/lib/agent-store";
import type { RailSection } from "@/lib/types";

type NavItem = {
  id: RailSection;
  label: string;
  Icon: Icon;
};

const NAV_ITEMS: NavItem[] = [
  { id: "home", label: "Home", Icon: House },
  { id: "docs", label: "Documents", Icon: Files },
  { id: "tasks", label: "Tasks", Icon: CheckSquare },
  { id: "agents", label: "Agents", Icon: Lightning },
  { id: "market", label: "Templates", Icon: Storefront },
];

const TOOLTIP =
  "pointer-events-none absolute left-full top-1/2 z-50 ml-2 -translate-y-1/2 translate-x-1 whitespace-nowrap rounded-[6px] border border-line bg-elev px-2 py-1 text-[11px] text-ink-2 opacity-0 transition-[opacity,translate] duration-150 group-hover:translate-x-0 group-hover:opacity-100";

export function IconRail() {
  const railSection = useWorkspace((s) => s.railSection);
  const setRailSection = useWorkspace((s) => s.setRailSection);
  const theme = useWorkspace((s) => s.theme);
  const toggleTheme = useWorkspace((s) => s.toggleTheme);
  const setPaletteOpen = useWorkspace((s) => s.setPaletteOpen);
  const agentBusy = useAgent(
    (s) => s.status === "running" || s.status === "starting",
  );

  return (
    <aside className="flex h-dvh w-[52px] shrink-0 flex-col items-center border-r border-line-soft bg-canvas py-3">
      {/* workspace mark */}
      <div className="mb-3 flex h-7 w-7 items-center justify-center rounded-[8px] bg-accent-dim">
        <span className="text-sm font-semibold leading-none text-accent">C</span>
      </div>

      <nav className="flex flex-col items-center gap-1">
        {NAV_ITEMS.map(({ id, label, Icon: NavIcon }) => {
          const active = railSection === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setRailSection(id)}
              aria-label={label}
              className={`group relative flex h-8 w-8 items-center justify-center rounded-[6px] transition-colors duration-150 ${
                active ? "text-ink" : "text-ink-3 hover:bg-hover hover:text-ink-2"
              }`}
            >
              {active && (
                <motion.span
                  layoutId="rail-active"
                  transition={{ type: "spring", stiffness: 400, damping: 32 }}
                  className="absolute inset-0 rounded-[6px] bg-elev"
                />
              )}
              <NavIcon size={18} className="relative" />
              {id === "agents" && agentBusy && (
                <span className="absolute right-1 top-1 h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
              )}
              <span className={TOOLTIP}>{label}</span>
            </button>
          );
        })}
      </nav>

      <div className="mt-auto flex flex-col items-center gap-1">
        <button
          type="button"
          onClick={() => setPaletteOpen(true)}
          aria-label="Search (Ctrl+K)"
          className="group relative flex h-8 w-8 items-center justify-center rounded-[6px] text-ink-3 transition-colors duration-150 hover:bg-hover hover:text-ink-2"
        >
          <MagnifyingGlass size={18} />
          <span className={TOOLTIP}>Search · Ctrl K</span>
        </button>
        <button
          type="button"
          onClick={() => setRailSection("settings")}
          aria-label="Settings"
          className={`group relative flex h-8 w-8 items-center justify-center rounded-[6px] transition-colors duration-150 ${
            railSection === "settings"
              ? "bg-elev text-ink"
              : "text-ink-3 hover:bg-hover hover:text-ink-2"
          }`}
        >
          <GearSix size={18} />
          <span className={TOOLTIP}>Settings</span>
        </button>
        <div className="my-2 h-px w-6 bg-line" />
        <button
          type="button"
          onClick={toggleTheme}
          aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
          className="group relative flex h-8 w-8 items-center justify-center rounded-[6px] text-ink-3 transition-colors duration-150 hover:bg-hover hover:text-ink-2"
        >
          {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
          <span className={TOOLTIP}>
            {theme === "dark" ? "Light theme" : "Dark theme"}
          </span>
        </button>
      </div>
    </aside>
  );
}
