import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  CheckSquare,
  Files,
  GearSix,
  House,
  Lightning,
  MagnifyingGlass,
  Moon,
  SignOut,
  Storefront,
  Sun,
  UserCircle,
  type Icon,
} from "@phosphor-icons/react";
import { useWorkspace } from "@/lib/store";
import { useAuth } from "@/lib/auth-store";
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
  { id: "market", label: "Marketplace", Icon: Storefront },
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
        <AccountMenu />
      </div>
    </aside>
  );
}

const MENU_ITEM =
  "flex h-8 w-full items-center gap-2 rounded-[6px] px-2 text-left text-[12.5px] text-ink-2 transition-colors duration-150 hover:bg-hover hover:text-ink";

/** Avatar at the bottom of the rail: who's signed in, settings, sign out. */
function AccountMenu() {
  const email = useAuth((s) => s.user?.email ?? "");
  const displayName = useAuth((s) => s.displayName);
  const signOut = useAuth((s) => s.signOut);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const initial = ((displayName || email)[0] ?? "?").toUpperCase();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative mt-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Account"
        aria-haspopup="menu"
        aria-expanded={open}
        className={`flex h-7 w-7 items-center justify-center rounded-full border bg-elev transition-colors ${
          open ? "border-accent-line" : "border-line hover:border-accent-line"
        }`}
      >
        <span className="text-[11px] leading-none text-ink-2">{initial}</span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            initial={{ opacity: 0, x: -4 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -4 }}
            transition={{ duration: 0.12 }}
            className="absolute bottom-0 left-full z-50 ml-3 w-60 rounded-[10px] border border-line bg-elev p-1 shadow-[0_12px_32px_-8px_var(--shadow)]"
          >
            <div className="flex items-center gap-2.5 px-2 py-2">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line bg-panel-2">
                <span className="text-[12px] font-medium leading-none text-ink-2">
                  {initial}
                </span>
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[12.5px] text-ink">
                  {displayName || email.split("@")[0]}
                </span>
                <span className="block truncate text-[11.5px] text-ink-3">
                  {email}
                </span>
              </span>
            </div>
            <div className="mx-1 my-1 h-px bg-line-soft" />
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                const ws = useWorkspace.getState();
                ws.setSettingsSection("account");
                ws.setRailSection("settings");
              }}
              className={MENU_ITEM}
            >
              <UserCircle size={15} />
              Account settings
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                void signOut();
              }}
              className={MENU_ITEM}
            >
              <SignOut size={15} />
              Sign out
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
