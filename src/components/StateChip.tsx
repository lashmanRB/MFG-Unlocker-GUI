import { cn } from "../lib/cn";
import type { CompatState } from "../lib/types";

const stateClasses: Record<CompatState, string> = {
  supported: "bg-accent/10 text-accent",
  likely: "bg-warn/10 text-warn",
  unknown: "bg-hover text-ink-muted",
  "no-frame-gen": "bg-danger/10 text-danger/80",
};

const stateLabels: Record<CompatState, string> = {
  supported: "supported",
  likely: "likely",
  unknown: "unknown",
  "no-frame-gen": "no frame gen",
};

export function StateChip({ state, className }: { state: CompatState; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-[3px] px-1.5 py-px text-[10px] font-medium tracking-[0.06em] uppercase",
        stateClasses[state],
        className,
      )}
    >
      <span className="size-1 rounded-full bg-current" />
      {stateLabels[state]}
    </span>
  );
}
