import { useEffect, useState } from "react";
import { Check, CircleDot, Info, Minus, RefreshCw } from "lucide-react";
import { api } from "../lib/api";
import { attempt } from "../lib/attempt";
import { formatBytes, relativeTime } from "../lib/format";
import { cn } from "../lib/cn";
import type { InstallControls } from "../lib/install";
import type { GameEntry, ReleaseInfo } from "../lib/types";
import { Button } from "../components/Button";
import { InstallCard } from "../components/InstallCard";
import { Section } from "../components/Section";
import { useToast } from "../hooks/useToast";

interface OverviewTabProps {
  game: GameEntry;
  release: ReleaseInfo | null;
  nvidiaFetchedAt: number | null;
  install: InstallControls;
  onGameUpdated: (entry: GameEntry) => void;
  onRefreshNvidia: () => Promise<void>;
}

interface Probe {
  label: string;
  found: boolean;
}

function nvidiaTierValue(tier: number): string {
  if (tier === 6) return "6X MFG";
  if (tier === 4) return "4X MFG";
  if (tier === 2) return "Frame Generation listed, no MFG override";
  return "not listed";
}

export function OverviewTab({
  game,
  release,
  nvidiaFetchedAt,
  install,
  onGameUpdated,
  onRefreshNvidia,
}: OverviewTabProps) {
  const toast = useToast();
  const [selectedExe, setSelectedExe] = useState<string | null>(
    game.exePath ?? game.exeCandidates[0]?.path ?? null,
  );
  const [applying, setApplying] = useState(false);
  const [refreshingList, setRefreshingList] = useState(false);

  useEffect(() => {
    setSelectedExe(game.exePath ?? game.exeCandidates[0]?.path ?? null);
  }, [game.id, game.exePath, game.exeCandidates]);

  const probes: Probe[] = [
    { label: "DLSS-G files", found: game.compat.hasFrameGen },
    { label: "Streamline", found: game.compat.hasStreamline },
    { label: "Super Resolution", found: game.compat.hasSuperRes },
    { label: "OptiScaler", found: game.compat.hasOptiScaler },
    { label: "Vulkan", found: game.compat.hasVulkan },
  ];

  const tier = game.compat.nvidiaTier;
  const matchedName =
    game.compat.nvidiaName !== null && game.compat.nvidiaName !== game.name
      ? game.compat.nvidiaName
      : null;

  const applyExe = async () => {
    if (selectedExe === null) return;
    setApplying(true);
    const response = await attempt(() => api.setGameExe(game.id, selectedExe));
    setApplying(false);
    if (!response.ok) {
      toast("error", `Could not set that executable: ${response.message}`);
      return;
    }
    onGameUpdated(response.value);
    toast("ok", "Game executable set");
  };

  const refreshList = async () => {
    setRefreshingList(true);
    await onRefreshNvidia();
    setRefreshingList(false);
  };

  return (
    <div className="grid gap-3 p-4 @3xl:grid-cols-[minmax(0,1fr)_328px]">
      <div className="flex min-w-0 flex-col gap-3">
        <Section
          title="Frame generation"
          aside={
            <span className="flex items-center gap-2 text-[10.5px] text-ink-dim">
              <span className="max-[760px]:hidden">checked beside the executable</span>
              <span className="h-3 w-px bg-line max-[760px]:hidden" />
              <span title={nvidiaFetchedAt === null ? "no cached NVIDIA list" : "age of the cached NVIDIA list"}>
                {nvidiaFetchedAt === null
                  ? "NVIDIA list unavailable"
                  : `NVIDIA list ${relativeTime(nvidiaFetchedAt)}`}
              </span>
              <button
                type="button"
                title="Fetch NVIDIA's list now"
                aria-label="Fetch NVIDIA's list now"
                disabled={refreshingList}
                onClick={refreshList}
                className="rounded-[3px] p-0.5 text-ink-dim transition-colors duration-150 ease-out hover:bg-hover hover:text-ink disabled:opacity-40"
              >
                <RefreshCw size={11} className={refreshingList ? "animate-spin" : undefined} />
              </button>
            </span>
          }
        >
          <ul className="divide-y divide-line/60">
            {probes.map((probe) => (
              <li key={probe.label} className="flex items-center gap-2 py-1.5 first:pt-0 last:pb-0">
                {probe.found ? (
                  <Check size={12} className="shrink-0 text-accent" />
                ) : (
                  <Minus size={12} className="shrink-0 text-ink-dim" />
                )}
                <span className="text-[12px] text-ink">{probe.label}</span>
                <span className="ml-auto text-right text-[10.5px] text-ink-dim">
                  {probe.found ? "found beside the executable" : "not found"}
                </span>
              </li>
            ))}
            <li
              className="flex items-center gap-2 py-1.5 last:pb-0"
              title={matchedName === null ? undefined : `matched: ${matchedName}`}
            >
              {tier === 6 || tier === 4 ? (
                <Check size={12} className="shrink-0 text-accent" />
              ) : tier === 2 ? (
                <CircleDot size={12} className="shrink-0 text-ink-muted" />
              ) : (
                <Minus size={12} className="shrink-0 text-ink-dim" />
              )}
              <span className="shrink-0 text-[12px] text-ink">NVIDIA</span>
              {matchedName !== null && (
                <span className="min-w-0 truncate text-[10px] text-ink-dim max-[760px]:hidden">
                  matched: {matchedName}
                </span>
              )}
              <span
                className={cn(
                  "ml-auto shrink-0 text-right text-[10.5px]",
                  tier === 0 ? "text-ink-dim" : "text-ink-muted",
                )}
              >
                {nvidiaTierValue(tier)}
              </span>
            </li>
          </ul>

          {game.compat.notes.length > 0 && (
            <div className="mt-2.5 border-t border-line pt-2.5">
              <ul className="space-y-1">
                {game.compat.notes.map((note) => (
                  <li key={note} className="flex gap-1.5 text-[11.5px] leading-snug text-ink-muted">
                    <Info size={12} className="mt-0.5 shrink-0 text-ink-dim" />
                    <span className="min-w-0">{note}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Section>

        <Section
          title="Executable"
          aside={
            <span className="text-[10.5px] text-ink-dim">
              {game.exeCandidates.length} found
            </span>
          }
        >
          {game.exeCandidates.length === 0 ? (
            <p className="text-[11.5px] leading-snug text-ink-dim">
              No executable in this folder. Add the folder that holds the game exe, or set the exe
              again after the game is installed.
            </p>
          ) : (
            <>
              <div role="radiogroup" aria-label="Game executable" className="flex flex-col">
                {game.exeCandidates.map((candidate) => {
                  const active = candidate.path === selectedExe;
                  const current = candidate.path === game.exePath;
                  return (
                    <button
                      key={candidate.path}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => setSelectedExe(candidate.path)}
                      className={cn(
                        "flex items-start gap-2.5 rounded-[3px] px-1.5 py-1.5 text-left transition-colors duration-150 ease-out",
                        active ? "bg-hover" : "hover:bg-hover/50",
                      )}
                    >
                      <span
                        className={cn(
                          "mt-[3px] flex size-[11px] shrink-0 items-center justify-center rounded-full border transition-colors duration-150 ease-out",
                          active ? "border-accent" : "border-line-strong",
                        )}
                      >
                        {active && <span className="size-[5px] rounded-full bg-accent" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                          <span className="mono truncate text-[12px] text-ink">{candidate.name}</span>
                          <span className="mono shrink-0 text-[10.5px] text-ink-dim">
                            {formatBytes(candidate.sizeBytes)}
                          </span>
                          {current && (
                            <span className="rounded-[2px] border border-accent/30 px-1 text-[9px] leading-[13px] tracking-[0.04em] text-accent uppercase">
                              current
                            </span>
                          )}
                        </span>
                        <span
                          className="mono mt-0.5 block truncate text-[10.5px] text-ink-dim"
                          title={candidate.path}
                        >
                          {candidate.path}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="mt-2.5 flex flex-wrap items-center gap-2 border-t border-line pt-2.5">
                <Button
                  size="sm"
                  onClick={applyExe}
                  loading={applying}
                  disabled={selectedExe === null || selectedExe === game.exePath}
                >
                  Use this exe
                </Button>
                <span className="text-[10.5px] text-ink-dim">
                  Sets the folder the mod installs into.
                </span>
              </div>
            </>
          )}
        </Section>
      </div>

      <div className="min-w-0">
        <InstallCard game={game} release={release} controls={install} />
      </div>
    </div>
  );
}
