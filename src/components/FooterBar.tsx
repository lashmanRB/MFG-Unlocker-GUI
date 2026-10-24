import { Cpu } from "lucide-react";
import type { GpuInfo, ReleaseInfo } from "../lib/types";

const repoUrl = "https://github.com/dashdogy/MFG-Unlocker";
const releasesUrl = "https://github.com/dashdogy/MFG-Unlocker/releases";

interface FooterBarProps {
  gpu: GpuInfo | null;
  release: ReleaseInfo | null;
}

const familyLabels: Record<GpuInfo["family"], string> = {
  ada: "Ada",
  ampere: "Ampere",
  turing: "Turing",
  blackwell: "Blackwell",
  other: "other",
  unknown: "unknown",
};

export function FooterBar({ gpu, release }: FooterBarProps) {
  const linkClass =
    "rounded-[2px] underline decoration-transparent underline-offset-2 transition-colors duration-150 ease-out hover:text-ink hover:decoration-line-strong";

  return (
    <footer className="flex h-8 shrink-0 items-center gap-2 border-t border-line px-4 text-[11px] text-ink-dim">
      <Cpu size={11} className="shrink-0" />
      <span className="truncate text-ink-muted">
        {gpu === null ? "Detecting GPU" : gpu.name}
      </span>
      {gpu !== null && (
        <>
          <span className="h-3 w-px shrink-0 bg-line" />
          <span className="shrink-0">{familyLabels[gpu.family]}</span>
        </>
      )}
      {gpu !== null && gpu.maxMultiplier > 1 && (
        <>
          <span className="h-3 w-px shrink-0 bg-line" />
          <span className="mono shrink-0">max {gpu.maxMultiplier}x</span>
        </>
      )}
      <span className="h-3 w-px shrink-0 bg-line" />
      <span className="shrink-0">cached {release?.cachedVersion ?? "none"}</span>

      <div className="ml-auto flex items-center gap-3">
        <button
          type="button"
          className={linkClass}
          onClick={() => window.open(release?.pageUrl ?? releasesUrl, "_blank")}
        >
          Releases
        </button>
        <button type="button" className={linkClass} onClick={() => window.open(repoUrl, "_blank")}>
          Source
        </button>
      </div>
    </footer>
  );
}
