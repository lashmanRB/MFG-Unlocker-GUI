import { cn } from "../lib/cn";

export type WorkspaceTab = "overview" | "settings" | "diagnostics";

interface TabOption {
  value: WorkspaceTab;
  label: string;
}

const tabs: TabOption[] = [
  { value: "overview", label: "Overview" },
  { value: "settings", label: "Settings" },
  { value: "diagnostics", label: "Diagnostics" },
];

interface TabBarProps {
  active: WorkspaceTab;
  onChange: (tab: WorkspaceTab) => void;
}

export function TabBar({ active, onChange }: TabBarProps) {
  return (
    <div className="flex h-9 shrink-0 items-stretch gap-4 border-b border-line px-4">
      {tabs.map((tab) => {
        const selected = tab.value === active;
        return (
          <button
            key={tab.value}
            type="button"
            aria-current={selected ? "page" : undefined}
            onClick={() => onChange(tab.value)}
            className={cn(
              "relative -mb-px text-[12.5px] font-medium transition-colors duration-150 ease-out",
              selected ? "text-ink" : "text-ink-dim hover:text-ink-muted",
            )}
          >
            {tab.label}
            {selected && (
              <span className="absolute inset-x-0 -bottom-px h-[2px] rounded-full bg-accent" />
            )}
          </button>
        );
      })}
    </div>
  );
}
