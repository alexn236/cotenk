import type { ReactNode } from "react";
import type { Icon } from "@phosphor-icons/react";

/* Shared primitives for the settings sections. */

export function SectionTitle({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="mb-4">
      <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
      {sub && <p className="mt-1 text-[12.5px] text-ink-3">{sub}</p>}
    </div>
  );
}

export function Card({ children }: { children: ReactNode }) {
  return (
    <div className="divide-y divide-line-soft rounded-[10px] border border-line-soft bg-panel">
      {children}
    </div>
  );
}

export function Row({
  icon: RowIcon,
  label,
  desc,
  children,
}: {
  icon?: Icon;
  label: ReactNode;
  desc?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3">
      <div className="flex min-w-0 items-center gap-3">
        {RowIcon && <RowIcon size={16} className="shrink-0 text-ink-3" />}
        <div className="min-w-0">
          <div className="text-[13px] text-ink">{label}</div>
          {desc && <div className="mt-0.5 text-[12px] text-ink-3">{desc}</div>}
        </div>
      </div>
      {/* controls keep their size; the text column wraps instead */}
      {children && <div className="flex shrink-0 items-center">{children}</div>}
    </div>
  );
}

export function Badge({ children }: { children: ReactNode }) {
  return (
    <span className="shrink-0 rounded-full border border-line bg-panel-2 px-2 py-0.5 text-[11px] text-ink-3">
      {children}
    </span>
  );
}

export function SmallButton({
  children,
  onClick,
  accent,
}: {
  children: ReactNode;
  onClick: () => void;
  accent?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 rounded-[7px] px-2.5 py-1 text-[12px] font-medium transition-colors ${
        accent
          ? "bg-accent text-on-accent hover:opacity-90"
          : "border border-line bg-panel-2 text-ink-2 hover:bg-line"
      }`}
    >
      {children}
    </button>
  );
}

export function Switch({
  on,
  onChange,
  label,
}: {
  on: boolean;
  onChange: (on: boolean) => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={`relative h-5 w-9 shrink-0 rounded-full transition-colors duration-150 ${
        on ? "bg-accent" : "bg-line"
      }`}
    >
      <span
        className={`absolute top-0.5 h-4 w-4 rounded-full bg-panel shadow transition-[left] duration-150 ${
          on ? "left-[18px]" : "left-0.5"
        }`}
      />
    </button>
  );
}
