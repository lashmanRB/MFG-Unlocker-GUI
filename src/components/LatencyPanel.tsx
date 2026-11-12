import { cn } from "../lib/cn";
import type { StatusSummary } from "../lib/types";
import { Callout } from "./Callout";
import { Section } from "./Section";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="label text-ink-dim">{label}</div>
      <div className="mono mt-0.5 truncate text-[13px] leading-5 text-ink" title={value}>
        {value}
      </div>
    </div>
  );
}

function stateName(state: number): string {
  switch (state) {
    case 0:
      return "off";
    case 1:
      return "measuring";
    case 2:
      return "live";
    case 3:
      return "no markers";
    case 4:
      return "no outputs";
    case 5:
      return "no flip times";
    default:
      return `code ${state}`;
  }
}

function stateChipClass(state: number): string {
  if (state === 2) return "border-accent/30 bg-accent/10 text-accent";
  if (state === 0) return "border-line bg-hover text-ink-dim";
  return "border-warn/30 bg-warn/10 text-warn";
}

function stateNote(state: number): string {
  switch (state) {
    case 0:
      return "The latency monitor is off, so nothing is being timed.";
    case 1:
      return "The monitor is measuring; numbers settle once markers arrive.";
    case 3:
      return "No frame markers have arrived yet, so there is nothing to time.";
    case 4:
      return "No display outputs were found, so latency cannot be measured.";
    case 5:
      return "Flip times are missing, so the monitor cannot work out latency.";
    default:
      return `Unknown latency state (code ${state}).`;
  }
}

export function LatencyPanel({ status }: { status: StatusSummary }) {
  if (!status.latencyAvailable) return null;

  const state = status.latencyState;
  // the probe only runs at launch, so the snapshot can be minutes old
  const age =
    status.latencyAgeMs < 1000
      ? `${Math.round(status.latencyAgeMs)} ms`
      : `${(status.latencyAgeMs / 1000).toFixed(1)} s`;

  return (
    <Section
      title="Latency"
      aside={
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10.5px]",
            stateChipClass(state),
          )}
        >
          <span
            className={cn("size-1.5 rounded-full bg-current", state === 2 && "animate-pulse")}
          />
          {stateName(state)}
        </span>
      }
    >
      <div className="grid grid-cols-2 gap-x-4 gap-y-3 @2xl:grid-cols-3">
        <Stat label="Mean" value={`${(status.latencyMeanUs / 1000).toFixed(1)} ms`} />
        <Stat label="P99" value={`${(status.latencyP99Us / 1000).toFixed(1)} ms`} />
        <Stat label="Real" value={`${(status.latencyRealUs / 1000).toFixed(1)} ms`} />
        <Stat label="Game" value={`${(status.latencyGameUs / 1000).toFixed(1)} ms`} />
        <Stat label="Frame gen" value={`${(status.latencyFgUs / 1000).toFixed(1)} ms`} />
        <Stat label="Display" value={`${(status.latencyDisplayUs / 1000).toFixed(1)} ms`} />
      </div>

      {state !== 2 && (
        <Callout tone={state === 0 || state === 1 ? "info" : "warn"} className="mt-2.5">
          {stateNote(state)}
        </Callout>
      )}

      <p className="mt-3 border-t border-line pt-2 text-[10.5px] text-ink-dim">
        Snapshot age <span className="mono">{age}</span>. The probe reads once per launch.
      </p>
    </Section>
  );
}