import { FolderOpen, Copy } from "lucide-react";
import { api } from "../lib/api";
import { attempt } from "../lib/attempt";
import { cn } from "../lib/cn";
import { copyText } from "../lib/clipboard";
import { formatBytes, middleTruncate, relativeTime } from "../lib/format";
import type { GameEntry } from "../lib/types";
import { Button } from "../components/Button";
import { Callout } from "../components/Callout";
import { Section } from "../components/Section";
import { Skeleton } from "../components/Skeleton";
import { useLogs } from "../hooks/useLogs";
import { useStatus } from "../hooks/useStatus";
import { useToast } from "../hooks/useToast";

interface HeartbeatTone {
  label: string;
  className: string;
  pulse: boolean;
}

function heartbeatTone(ageSeconds: number): HeartbeatTone {
  if (ageSeconds < 5) {
    return {
      label: "live",
      className: "border-accent/30 bg-accent/10 text-accent",
      pulse: true,
    };
  }
  if (ageSeconds < 30) {
    return {
      label: "stale",
      className: "border-warn/30 bg-warn/10 text-warn",
      pulse: false,
    };
  }
  return {
    label: "not running",
    className: "border-line bg-hover text-ink-dim",
    pulse: false,
  };
}

interface StatProps {
  label: string;
  value: string;
  hint?: string;
  warn?: boolean;
  title?: string;
}

function Stat({ label, value, hint, warn = false, title }: StatProps) {
  return (
    <div className="min-w-0">
      <div className="label text-ink-dim">{label}</div>
      <div
        className={cn("mono mt-0.5 truncate text-[13px] leading-5 text-ink", warn && "text-warn")}
        title={title ?? value}
      >
        {value}
      </div>
      {hint !== undefined && <div className="text-[10.5px] text-ink-dim">{hint}</div>}
    </div>
  );
}

interface RuntimeItemProps {
  label: string;
  value: string;
  warn?: boolean;
}

function RuntimeItem({ label, value, warn = false }: RuntimeItemProps) {
  return (
    <div className="min-w-[108px]">
      <div className="text-[10px] tracking-[0.04em] text-ink-dim uppercase">{label}</div>
      <div className={cn("mono mt-0.5 text-[11.5px] text-ink-muted", warn && "text-warn")}>
        {value}
      </div>
    </div>
  );
}

function graphicsApiName(value: number): string {
  if (value === 0) return "unknown";
  if (value === 1) return "DirectX 12";
  if (value === 2) return "Vulkan";
  return `code ${value}`;
}

function gpuFamilyName(value: number): string {
  switch (value) {
    case 1:
      return "Ada";
    case 2:
      return "Ampere";
    case 3:
      return "conflict";
    case 4:
      return "Turing";
    case 5:
      return "Blackwell";
    default:
      return "unknown";
  }
}

function nvidiaTierName(value: number): string {
  switch (value) {
    case 0:
      return "unknown";
    case 2:
      return "FG, no MFG override";
    case 4:
      return "MFG 4x published";
    case 6:
      return "MFG 6x published";
    default:
      return `tier ${value}`;
  }
}

export function DiagnosticsTab({ game, active }: { game: GameEntry; active: boolean }) {
  const toast = useToast();
  const { status, loading, error } = useStatus(game.id, active);
  const logs = useLogs(game.id, active);

  const tone = status === null ? null : heartbeatTone(status.ageSeconds);

  const copyLog = async () => {
    if (logs.text.length === 0) return;
    const copied = await copyText(logs.text);
    if (copied) toast("ok", "Log copied to the clipboard");
    else toast("error", "Clipboard access was refused");
  };

  const openLogFolder = async () => {
    const response = await attempt(() => api.openPath(game.workDir));
    if (!response.ok) {
      toast("error", `Could not open the folder: ${response.message}`);
    }
  };

  return (
    <div className="flex flex-col gap-3 p-4">
      <Section
        title="Live status"
        aside={
          status === null ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-hover px-2 py-0.5 text-[10.5px] text-ink-dim">
              <span className="size-1.5 rounded-full bg-current" />
              not running
            </span>
          ) : (
            tone !== null && (
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10.5px]",
                  tone.className,
                )}
              >
                <span
                  className={cn("size-1.5 rounded-full bg-current", tone.pulse && "animate-pulse")}
                />
                {tone.label}
                <span className="mono text-[10px] opacity-70">{status.ageSeconds}s</span>
              </span>
            )
          )
        }
      >
        {status !== null ? (
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 @2xl:grid-cols-4">
            <Stat
              label="Applied multiplier"
              value={`${status.appliedMultiplier}x`}
              hint={
                status.appliedMultiplier === status.desiredMultiplier
                  ? "matches the request"
                  : `desired ${status.desiredMultiplier}x`
              }
              warn={status.appliedMultiplier !== status.desiredMultiplier}
            />
            <Stat label="Dynamic" value={status.dynamicMode ? "on" : "off"} />
            <Stat label="Safe maximum" value={`${status.safeMaximumMultiplier}x`} />
            <Stat label="Protocol" value={String(status.protocolVersion)} />
            <Stat label="Real FPS" value={status.realFps.toFixed(1)} />
            <Stat label="Generated FPS" value={status.dlssFps.toFixed(1)} />
            <Stat label="Patch route" value={status.patchRoute} />
            <Stat
              label="NVIDIA profile"
              value={status.nvidiaProfileName}
              title={status.nvidiaProfileName}
            />
          </div>
        ) : loading ? (
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 @2xl:grid-cols-4">
            {[0, 1, 2, 3, 4, 5, 6, 7].map((cell) => (
              <div key={cell} className="space-y-1.5">
                <Skeleton className="h-2 w-16" />
                <Skeleton className="h-3.5 w-12" />
              </div>
            ))}
          </div>
        ) : (
          <p className="max-w-[520px] text-[11.5px] leading-snug text-ink-dim">
            No heartbeat in this folder. Launch the game with the mod installed and it shows up
            here within a couple of seconds.
          </p>
        )}

        {error !== null && (
          <Callout tone="danger" className="mt-2.5">
            Could not read the status file: {error}
          </Callout>
        )}

        <p className="mt-3 border-t border-line pt-2 text-[10.5px] text-ink-dim">
          Refreshes every 2 seconds while this tab is open.
          {status !== null && <span className="mono"> pid {status.pid}</span>}
        </p>
      </Section>

      {status !== null && (
        <Section
          title="Runtime"
          aside={<span className="text-[10.5px] text-ink-dim">from the last heartbeat</span>}
        >
          <div className="flex flex-wrap gap-x-6 gap-y-2.5">
            <RuntimeItem
              label="Hook bridge"
              value={status.bridgeReady ? "loaded" : "not loaded"}
              warn={!status.bridgeReady}
            />
            <RuntimeItem
              label="Game frame gen"
              value={status.gameFrameGenerationOn ? "on" : "off"}
            />
            <RuntimeItem
              label="Mod applied"
              value={status.appliedFrameGenerationOn ? "on" : "off"}
              warn={status.gameFrameGenerationOn && !status.appliedFrameGenerationOn}
            />
            <RuntimeItem label="Graphics API" value={graphicsApiName(status.graphicsApi)} />
            <RuntimeItem
              label="GPU family"
              value={gpuFamilyName(status.gpuFamily)}
              warn={status.gpuFamily === 3}
            />
            <RuntimeItem label="NVIDIA tier" value={nvidiaTierName(status.nvidiaTier)} />
            <RuntimeItem
              label="setOptions"
              value={
                status.lastSetOptionsResult === 0 ? "accepted" : `code ${status.lastSetOptionsResult}`
              }
              warn={status.lastSetOptionsResult !== 0}
            />
          </div>
        </Section>
      )}

      <Section
        title="Logs"
        aside={
          <div className="flex items-center gap-0.5">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void copyLog()}
              disabled={logs.text.length === 0}
              icon={<Copy size={11} />}
            >
              Copy
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void openLogFolder()}
              icon={<FolderOpen size={11} />}
            >
              Open folder
            </Button>
          </div>
        }
      >
        {logs.filesLoading ? (
          <div className="space-y-1.5">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        ) : logs.filesError !== null ? (
          <Callout tone="danger">Could not list the logs: {logs.filesError}</Callout>
        ) : logs.files.length === 0 ? (
          <p className="text-[11.5px] leading-snug text-ink-dim">
            No log files in the mod folder yet. They appear after the game has run with the mod
            loaded.
          </p>
        ) : (
          <div className="flex flex-col gap-3 @2xl:flex-row">
            <ul className="shrink-0 overflow-hidden rounded-[5px] border border-line @2xl:w-[252px]">
              {logs.files.map((file) => {
                const selected = file.path === logs.selected;
                return (
                  <li key={file.path} className="border-b border-line last:border-b-0">
                    <button
                      type="button"
                      onClick={() => void logs.openLog(file.path)}
                      aria-current={selected ? "true" : undefined}
                      className={cn(
                        "w-full px-2.5 py-1.5 text-left transition-colors duration-150 ease-out",
                        selected ? "bg-hover" : "hover:bg-hover/50",
                      )}
                    >
                      <span
                        className={cn(
                          "mono block truncate text-[11px]",
                          selected ? "text-ink" : "text-ink-muted",
                        )}
                        title={file.name}
                      >
                        {file.name}
                      </span>
                      <span className="mt-0.5 flex items-baseline justify-between gap-2 text-[10px] text-ink-dim">
                        <span className="mono">{formatBytes(file.sizeBytes)}</span>
                        <span>{relativeTime(file.modified)}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>

            <div className="min-w-0 flex-1">
              {logs.textLoading ? (
                <Skeleton className="h-[180px] w-full" />
              ) : logs.textError !== null ? (
                <Callout tone="danger">Could not read that log: {logs.textError}</Callout>
              ) : (
                <>
                  <pre className="mono max-h-[320px] min-h-[150px] overflow-auto rounded-[5px] border border-line bg-base p-2.5 text-[11px] leading-[1.55] whitespace-pre-wrap text-ink-muted select-text">
                    {logs.text}
                  </pre>
                  <p className="mono mt-1 truncate text-[10px] text-ink-dim" title={logs.selected ?? ""}>
                    {logs.selected === null ? "" : middleTruncate(logs.selected, 90)}
                  </p>
                </>
              )}
            </div>
          </div>
        )}
      </Section>
    </div>
  );
}
