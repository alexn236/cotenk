import { motion } from "motion/react";
import {
  Archive,
  Info,
  Lightning,
  PuzzlePiece,
  SunDim,
  type Icon,
} from "@phosphor-icons/react";
import { useWorkspace, type SettingsSection } from "@/lib/store";

type NavItem = {
  id: SettingsSection;
  label: string;
  Icon: Icon;
};

const NAV_ITEMS: NavItem[] = [
  { id: "appearance", label: "Appearance", Icon: SunDim },
  { id: "agents", label: "Agents", Icon: Lightning },
  { id: "extensions", label: "Agent customisation", Icon: PuzzlePiece },
  { id: "data", label: "Data & backup", Icon: Archive },
  { id: "about", label: "About", Icon: Info },
];

export function SettingsNav() {
  const section = useWorkspace((s) => s.settingsSection);
  const setSection = useWorkspace((s) => s.setSettingsSection);

  return (
    <div>
      <div className="px-2 pb-1 pt-1 text-[10.5px] font-medium uppercase tracking-[0.08em] text-ink-3">
        Settings
      </div>
      <div>
        {NAV_ITEMS.map(({ id, label, Icon: ItemIcon }) => {
          const active = section === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setSection(id)}
              aria-current={active ? "page" : undefined}
              className={`relative flex h-7 w-full items-center gap-2 rounded-[6px] px-2 text-[13px] transition-colors duration-150 ${
                active ? "bg-elev text-ink" : "text-ink-2 hover:bg-hover"
              }`}
            >
              {active && (
                <motion.span
                  layoutId="settingsnav-active"
                  transition={{ type: "spring", stiffness: 400, damping: 32 }}
                  className="absolute inset-y-0 left-0 my-auto h-3.5 w-[2px] rounded-full bg-accent"
                />
              )}
              <ItemIcon size={15} className="shrink-0 text-ink-3" />
              <span className="truncate">{label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
