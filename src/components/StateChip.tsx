import { cn } from "../lib/cn";
import type { CompatState } from "../lib/types";

const stateClasses: Record<CompatState, string> = {
  supported: "bg-accent/10 text-accent",
  likely: "bg-warn/10 text-warn",
  unknown: "bg-hover text-ink-muted",
  "no-frame-gen": "bg-danger/10 text-danger/80",
};

const stateLabels: Record<CompatState, string> = {
  supported: "hooks found",
  likely: "likely",
  unknown: "unknown",
  "no-frame-gen": "no FG hooks",
};

// what the scan found on disk, not what the game's menu offers
const stateTitles: Record<CompatState, string> = {
  supported:
    "Frame generation and Streamline files found beside the executable. Whether the game offers Frame Generation in its own menu is a separate question.",
  likely:
    "Frame generation files without a Streamline interposer, or NVIDIA lists this title so the files may come from the NVIDIA app.",
  unknown:
    "No DLSS files found beside the executable. The game may still receive Frame Generation through an NVIDIA app override.",
  "no-frame-gen":
    "DLSS Super Resolution or Streamline files found, but no frame generation files.",
};

export function StateChip({ state, className }: { state: CompatState; className?: string }) {
  return (
    <span
      title={stateTitles[state]}
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
