import { useEffect, useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  Bug,
  Check,
  ClipboardCheck,
  Contrast,
  Cpu,
  Crosshair,
  Gauge,
  Keyboard,
  Layers,
  Wrench,
} from "lucide-react";
import { api } from "../lib/api";
import { attempt } from "../lib/attempt";
import { cn } from "../lib/cn";
import {
  dlssRrPresetChoices,
  dlssSrPresetChoices,
  dlssgPresetChoices,
  flipMeteringChoice,
  flipMeteringChoices,
  flipMeteringValue,
  languageChoices,
  modeChoices,
  vsyncChoices,
} from "../lib/options";
import type { Choice } from "../lib/options";
import type { GameEntry, GameSettings } from "../lib/types";
import { Button } from "../components/Button";
import { Callout } from "../components/Callout";
import {
  NumberInput,
  Select,
  TextInput,
  ToggleField,
} from "../components/Controls";
import { Dialog } from "../components/Dialog";
import { KeyCapture } from "../components/KeyCapture";
import { Segmented } from "../components/Segmented";
import { Skeleton } from "../components/Skeleton";
import { useToast } from "../hooks/useToast";

interface SetupWizardProps {
  game: GameEntry;
  onClose: () => void;
  onSaved: () => void;
}

type StepId =
  | "mode"
  | "multiplier"
  | "target"
  | "preset"
  | "pacing"
  | "image"
  | "menu"
  | "compat"
  | "debug"
  | "summary";

interface StepDef {
  id: StepId;
  short: string;
  icon: LucideIcon;
  question: string;
  intro: string;
  when?: (draft: GameSettings) => boolean;
  apply?: (draft: GameSettings) => Partial<GameSettings>;
}

const steps: StepDef[] = [
  {
    id: "mode",
    short: "Mode",
    icon: Gauge,
    question: "How should the multiplier be chosen?",
    intro: "The one setting that really changes how the game feels.",
    apply: () => ({
      mode: "follow",
      multiplier: 2,
      dynamicLockToRefreshRate: true,
    }),
  },
  {
    id: "multiplier",
    short: "Multiplier",
    icon: Layers,
    question: "How many generated frames per real frame?",
    intro: "2x is the game's own rate. Higher multiplies more and asks more of the card.",
    when: (draft) => draft.mode === "fixed",
    apply: () => ({ multiplier: 2 }),
  },
  {
    id: "target",
    short: "Target",
    icon: Crosshair,
    question: "What frame rate should it aim for?",
    intro: "Dynamic mode shifts between multipliers to hold this number.",
    when: (draft) => draft.mode === "dynamic",
    apply: () => ({
      dynamicLockToRefreshRate: true,
      dynamicCustomTargetFrameRate: 120,
    }),
  },
  {
    id: "preset",
    short: "Preset",
    icon: Cpu,
    question: "Which Frame Generation preset?",
    intro: "NVIDIA's frame synthesis models. The game's own choice is usually right.",
    apply: () => ({ dlssgPreset: 0 }),
  },
  {
    id: "pacing",
    short: "Pacing",
    icon: Activity,
    question: "How should frame pacing be handled?",
    intro: "Where the generated frames meet the display.",
    apply: () => ({ vsyncMode: 0, reflexFrameLimitFps: 0 }),
  },
  {
    id: "image",
    short: "Image models",
    icon: Contrast,
    question: "Which DLSS image models?",
    intro: "These change picture quality rather than performance.",
    apply: () => ({ dlssSrPreset: 0, dlssRrPreset: 0 }),
  },
  {
    id: "menu",
    short: "In-game menu",
    icon: Keyboard,
    question: "What should the in-game menu do?",
    intro: "Backspace opens the mod's own menu while the game runs.",
    apply: () => ({
      language: "auto",
      toggleKey: "",
      pinnedFps: false,
      layoutScale: "",
    }),
  },
  {
    id: "compat",
    short: "Compatibility",
    icon: Wrench,
    question: "Any compatibility switches?",
    intro: "Both only do anything on RTX 30 cards. Leave them unless you are on one.",
    apply: () => ({ rtx30FlipMetering: null, gpuNameOverride: false }),
  },
  {
    id: "debug",
    short: "Diagnostics",
    icon: Bug,
    question: "Extra diagnostics logging?",
    intro: "Written to the mod's log for bug reports. Off is right while playing.",
    apply: () => ({ intervalLogging: false, generatedOnlyDebug: false }),
  },
  {
    id: "summary",
    short: "Review",
    icon: ClipboardCheck,
    question: "Review before writing",
    intro: "These values go to the mod's files beside the game executable.",
  },
];

const modeOptions = [
  { value: "follow", label: "Follow game", desc: "The game keeps its own choice, exactly as without the mod." },
  { value: "fixed", label: "Fixed", desc: "One multiplier at all times, whatever the game asks for." },
  { value: "dynamic", label: "Dynamic", desc: "Shifts between multipliers to hold a target frame rate." },
] as const;

const multiplierOptions = [
  { value: 2, label: "2x", desc: "the game's own rate" },
  { value: 3, label: "3x", desc: "light boost" },
  { value: 4, label: "4x", desc: "steady extra frames" },
  { value: 5, label: "5x", desc: "heavy" },
  { value: 6, label: "6x", desc: "most the card can do" },
] as const;

const presetOptions = [
  { value: 0, label: "Game / driver", desc: "Whatever the game and the NVIDIA app already use." },
  { value: 1, label: "A", desc: "The standard model, same as most games default to." },
  {
    value: 2,
    label: "B",
    desc: "Improves how interface elements look, and it helps when frame generation freezes the picture.",
  },
  { value: 3, label: "C", desc: "The lighter performance model. Needs DLSS-G 310.9.16 or newer." },
] as const;

const vsyncOptions = [
  { value: 0, label: "Game / driver", desc: "The game and the NVIDIA control panel decide." },
  {
    value: 1,
    label: "Off",
    desc: "Presents frames without V-Sync. First thing to try when the picture blinks.",
  },
  { value: 2, label: "On", desc: "Forces V-Sync on, overriding the game." },
] as const;

function labelOf<T extends string | number>(choices: Choice<T>[], value: T): string {
  return choices.find((choice) => choice.value === value)?.label ?? String(value);
}

function summaryGroups(draft: GameSettings): { title: string; rows: [string, string][] }[] {
  const frameGen: [string, string][] = [["Mode", labelOf(modeChoices, draft.mode)]];
  if (draft.mode === "fixed") frameGen.push(["Multiplier", `${draft.multiplier}x`]);
  if (draft.mode === "dynamic") {
    frameGen.push([
      "Target",
      draft.dynamicLockToRefreshRate ? "display refresh rate" : `${draft.dynamicCustomTargetFrameRate} FPS`,
    ]);
  }
  return [
    { title: "Frame generation", rows: frameGen },
    {
      title: "Presentation",
      rows: [
        ["Preset", labelOf(dlssgPresetChoices, draft.dlssgPreset)],
        ["V-Sync", labelOf(vsyncChoices, draft.vsyncMode)],
        [
          "Reflex limit",
          draft.reflexFrameLimitFps === 0 ? "left to the game" : `${draft.reflexFrameLimitFps} FPS`,
        ],
      ],
    },
    {
      title: "Image models",
      rows: [
        ["Super Resolution", labelOf(dlssSrPresetChoices, draft.dlssSrPreset)],
        ["Ray Reconstruction", labelOf(dlssRrPresetChoices, draft.dlssRrPreset)],
      ],
    },
    {
      title: "In-game menu",
      rows: [
        ["Language", labelOf(languageChoices, draft.language)],
        ["Menu key", draft.toggleKey === "" ? "default (Backspace)" : "custom key"],
        ["Pinned FPS", draft.pinnedFps ? "on" : "off"],
        ["Layout scale", draft.layoutScale === "" ? "default" : draft.layoutScale],
      ],
    },
    {
      title: "Compatibility",
      rows: [
        ["RTX 30 flip metering", labelOf(flipMeteringChoices, flipMeteringChoice(draft.rtx30FlipMetering))],
        ["GPU name override", draft.gpuNameOverride ? "on" : "off"],
      ],
    },
    {
      title: "Diagnostics",
      rows: [
        ["Interval logging", draft.intervalLogging ? "on" : "off"],
        ["Generated-only debug", draft.generatedOnlyDebug ? "on" : "off"],
      ],
    },
  ];
}

function ChoiceCard({
  selected,
  recommended,
  title,
  desc,
  compact,
  onSelect,
}: {
  selected: boolean;
  recommended: boolean;
  title: string;
  desc: string;
  compact: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        "flex flex-col gap-1 rounded-[5px] border px-3 text-left transition-colors duration-150 ease-out",
        compact ? "items-center py-2 text-center" : "py-2.5",
        selected
          ? "border-accent/60 bg-accent/[0.07]"
          : "border-line bg-raised hover:border-line-strong hover:bg-hover/50",
      )}
    >
      <span className={cn("flex w-full items-center gap-1.5", compact && "justify-center")}>
        <span className="text-[12px] font-medium text-ink">{title}</span>
        {selected ? (
          <Check size={11} className="shrink-0 text-accent" />
        ) : recommended ? (
          <span className="mono shrink-0 rounded-[3px] border border-line px-1 text-[8px] tracking-[0.05em] text-ink-dim uppercase">
            rec
          </span>
        ) : null}
      </span>
      <span
        className={cn(
          "text-[10.5px] leading-snug text-ink-muted",
          compact && "text-[9.5px]",
        )}
      >
        {desc}
      </span>
    </button>
  );
}

function SettingRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-3.5 py-2.5">
      <div className="min-w-0">
        <div className="text-[12px] text-ink">{label}</div>
        {hint !== undefined && <div className="mt-0.5 text-[10.5px] leading-snug text-ink-muted">{hint}</div>}
      </div>
      <div className="w-[220px] shrink-0">{children}</div>
    </div>
  );
}

export function SetupWizard({ game, onClose, onSaved }: SetupWizardProps) {
  const toast = useToast();
  const [draft, setDraft] = useState<GameSettings | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [currentId, setCurrentId] = useState<StepId>("mode");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    void attempt(() => api.readSettings(game.id)).then((response) => {
      if (!alive) return;
      if (response.ok) setDraft(response.value);
      else setLoadError(response.message);
    });
    return () => {
      alive = false;
    };
  }, [game.id]);

  const visible = useMemo(
    () => (draft === null ? steps : steps.filter((step) => step.when === undefined || step.when(draft))),
    [draft],
  );
  const index = Math.max(0, visible.findIndex((step) => step.id === currentId));
  const step = visible[index];
  const last = index === visible.length - 1;

  function update<K extends keyof GameSettings>(key: K, value: GameSettings[K]) {
    setDraft((current) => (current === null ? current : { ...current, [key]: value }));
  }

  function resetToRecommended() {
    setDraft((current) => {
      if (current === null) return current;
      let next = { ...current };
      for (const candidate of steps) {
        if (candidate.apply !== undefined) next = { ...next, ...candidate.apply(next) };
      }
      return next;
    });
    toast("ok", "Everything is back to the recommended values");
  }

  const save = async () => {
    if (draft === null) return;
    setSaving(true);
    const response = await attempt(() => api.writeSettings(game.id, draft));
    setSaving(false);
    if (!response.ok) {
      toast("error", `Settings were not saved: ${response.message}`);
      return;
    }
    onSaved();
    onClose();
    if (response.value.warnings.length > 0) {
      toast("warn", response.value.warnings[0]);
    } else {
      toast("ok", `Settings saved for ${game.name}`);
    }
  };

  return (
    <Dialog
      title={`Guided setup: ${game.name}`}
      size="lg"
      flush
      onClose={onClose}
      actions={
        <>
          <Button size="sm" variant="ghost" onClick={resetToRecommended}>
            Reset to recommended
          </Button>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setCurrentId(visible[index - 1].id)}
              disabled={index === 0}
            >
              Back
            </Button>
            {last ? (
              <Button size="sm" loading={saving} onClick={save}>
                Save settings
              </Button>
            ) : (
              <Button size="sm" onClick={() => setCurrentId(visible[index + 1].id)}>
                Next
              </Button>
            )}
          </div>
        </>
      }
    >
      {draft === null ? (
        <div className="p-5">
          {loadError !== null ? (
            <Callout tone="danger">{loadError}</Callout>
          ) : (
            <Skeleton className="h-64 w-full" />
          )}
        </div>
      ) : (
        <div className="flex min-h-[340px]">
          <nav
            aria-label="Setup steps"
            className="flex w-[190px] shrink-0 flex-col gap-0.5 border-r border-line bg-base px-2.5 py-3"
          >
            {visible.map((candidate, position) => {
              const active = candidate.id === step.id;
              const done = position < index;
              const Icon = candidate.icon;
              return (
                <button
                  key={candidate.id}
                  type="button"
                  onClick={() => setCurrentId(candidate.id)}
                  aria-current={active ? "step" : undefined}
                  className={cn(
                    "flex items-center gap-2 rounded-[4px] px-2.5 py-1.5 text-left transition-colors duration-150 ease-out",
                    active
                      ? "bg-elevated text-ink"
                      : done
                        ? "text-ink-muted hover:bg-hover/60 hover:text-ink"
                        : "text-ink-muted hover:text-ink",
                  )}
                >
                  <Icon size={13} className={cn("shrink-0", active && "text-accent")} />
                  <span className="truncate text-[11.5px]">{candidate.short}</span>
                  {done && <Check size={10} className="ml-auto shrink-0 text-ink-dim" />}
                </button>
              );
            })}
          </nav>

          <div key={step.id} className="step-in min-w-0 flex-1 overflow-y-auto px-6 py-5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="mono text-[9.5px] tracking-[0.08em] text-ink-muted uppercase">
                {step.short}
              </span>
              <span className="mono text-[9.5px] tracking-[0.08em] text-ink-muted">
                {index + 1} / {visible.length}
              </span>
            </div>

            <h3 className="mt-2 text-[17px] leading-snug font-semibold tracking-[-0.01em] text-ink">
              {step.question}
            </h3>
            <p className="mt-1.5 max-w-[52ch] text-[12px] leading-relaxed text-ink-muted">{step.intro}</p>

            {step.id === "mode" && (
              <div role="radiogroup" aria-label="Mode" className="mt-4 grid grid-cols-3 gap-2">
                {modeOptions.map((choice) => (
                  <ChoiceCard
                    key={choice.value}
                    selected={draft.mode === choice.value}
                    recommended={choice.value === "follow"}
                    title={choice.label}
                    desc={choice.desc}
                    compact={false}
                    onSelect={() => update("mode", choice.value)}
                  />
                ))}
              </div>
            )}

            {step.id === "multiplier" && (
              <div className="mt-4">
                <div role="radiogroup" aria-label="Multiplier" className="grid grid-cols-5 gap-2">
                  {multiplierOptions.map((choice) => (
                    <ChoiceCard
                      key={choice.value}
                      selected={draft.multiplier === choice.value}
                      recommended={choice.value === 2}
                      title={choice.label}
                      desc={choice.desc}
                      compact
                      onSelect={() => update("multiplier", choice.value)}
                    />
                  ))}
                </div>
                <p className="mt-2.5 text-[10.5px] text-ink-muted">
                  {game.compat.nvidiaTier === 6
                    ? "NVIDIA publishes a 6x ceiling for this title."
                    : game.compat.nvidiaTier === 4
                      ? "NVIDIA publishes a 4x ceiling for this title."
                      : "NVIDIA publishes no ceiling for this title, so the mod and the card decide."}
                </p>
              </div>
            )}

            {step.id === "target" && (
              <div className="mt-4 divide-y divide-line/60 rounded-[5px] border border-line bg-raised">
                <SettingRow label="Lock to the display refresh rate" hint="Aim at whatever the display runs at.">
                  <div className="flex justify-end">
                    <ToggleField
                      label=""
                      checked={draft.dynamicLockToRefreshRate}
                      onChange={(checked) => update("dynamicLockToRefreshRate", checked)}
                    />
                  </div>
                </SettingRow>
                <SettingRow label="Custom target FPS" hint="Used when the lock is off. 30 to 1000.">
                  <NumberInput
                    value={draft.dynamicCustomTargetFrameRate}
                    onChange={(value) => update("dynamicCustomTargetFrameRate", value)}
                    min={30}
                    max={1000}
                    disabled={draft.dynamicLockToRefreshRate}
                  />
                </SettingRow>
              </div>
            )}

            {step.id === "preset" && (
              <div role="radiogroup" aria-label="Frame Generation preset" className="mt-4 grid grid-cols-2 gap-2">
                {presetOptions.map((choice) => (
                  <ChoiceCard
                    key={choice.value}
                    selected={draft.dlssgPreset === choice.value}
                    recommended={choice.value === 0}
                    title={choice.label}
                    desc={choice.desc}
                    compact={false}
                    onSelect={() => update("dlssgPreset", choice.value)}
                  />
                ))}
              </div>
            )}

            {step.id === "pacing" && (
              <div className="mt-4">
                <div role="radiogroup" aria-label="V-Sync" className="grid grid-cols-3 gap-2">
                  {vsyncOptions.map((choice) => (
                    <ChoiceCard
                      key={choice.value}
                      selected={draft.vsyncMode === choice.value}
                      recommended={choice.value === 0}
                      title={choice.label}
                      desc={choice.desc}
                      compact={false}
                      onSelect={() => update("vsyncMode", choice.value)}
                    />
                  ))}
                </div>
                <div className="mt-3 divide-y divide-line/60 rounded-[5px] border border-line bg-raised">
                  <SettingRow
                    label="Reflex FPS limit"
                    hint={draft.mode === "dynamic" ? "Not used in dynamic mode." : "0 leaves the game's own limiter alone."}
                  >
                    <NumberInput
                      value={draft.reflexFrameLimitFps}
                      onChange={(value) => update("reflexFrameLimitFps", value)}
                      min={0}
                      max={1000}
                      disabled={draft.mode === "dynamic"}
                    />
                  </SettingRow>
                </div>
              </div>
            )}

            {step.id === "image" && (
              <div className="mt-4 flex flex-col gap-4">
                <div>
                  <div className="label">Super Resolution</div>
                  <div
                    role="radiogroup"
                    aria-label="Super Resolution preset"
                    className="mt-1.5 grid grid-cols-5 gap-2"
                  >
                    {dlssSrPresetChoices.map((choice) => (
                      <ChoiceCard
                        key={choice.value}
                        selected={draft.dlssSrPreset === choice.value}
                        recommended={choice.value === 0}
                        title={choice.label}
                        desc={choice.value === 0 ? "the game's own model" : "transformer model"}
                        compact
                        onSelect={() => update("dlssSrPreset", choice.value)}
                      />
                    ))}
                  </div>
                </div>
                <div>
                  <div className="label">Ray Reconstruction</div>
                  <div
                    role="radiogroup"
                    aria-label="Ray Reconstruction preset"
                    className="mt-1.5 grid grid-cols-3 gap-2"
                  >
                    {dlssRrPresetChoices.map((choice) => (
                      <ChoiceCard
                        key={choice.value}
                        selected={draft.dlssRrPreset === choice.value}
                        recommended={choice.value === 0}
                        title={choice.label}
                        desc={choice.value === 6 ? "needs NVIDIA driver 580 or newer" : "the game's own model"}
                        compact
                        onSelect={() => update("dlssRrPreset", choice.value)}
                      />
                    ))}
                  </div>
                </div>
                <p className="text-[10.5px] text-ink-muted">Both apply live, in DirectX 12 games only.</p>
              </div>
            )}

            {step.id === "menu" && (
              <div className="mt-4 divide-y divide-line/60 rounded-[5px] border border-line bg-raised">
                <SettingRow label="Menu language" hint="Only changes the mod's own menu.">
                  <Select value={draft.language} onChange={(value) => update("language", value)}>
                    {languageChoices.map((choice) => (
                      <option key={choice.value} value={choice.value}>
                        {choice.label}
                      </option>
                    ))}
                  </Select>
                </SettingRow>
                <SettingRow label="Menu key" hint="Empty keeps the mod's default, Backspace.">
                  <div className="flex justify-end">
                    <KeyCapture value={draft.toggleKey} onChange={(key) => update("toggleKey", key)} />
                  </div>
                </SettingRow>
                <SettingRow label="Pinned FPS" hint="A small real and generated FPS readout in game.">
                  <div className="flex justify-end">
                    <ToggleField
                      label=""
                      checked={draft.pinnedFps}
                      onChange={(checked) => update("pinnedFps", checked)}
                    />
                  </div>
                </SettingRow>
                <SettingRow label="Menu layout scale" hint="Empty means the default size.">
                  <TextInput value={draft.layoutScale} onChange={(value) => update("layoutScale", value)} />
                </SettingRow>
              </div>
            )}

            {step.id === "compat" && (
              <div className="mt-4 divide-y divide-line/60 rounded-[5px] border border-line bg-raised">
                <SettingRow
                  label="RTX 30 flip metering"
                  hint="Inherit keeps the mod's own default, the newer pacing."
                >
                  <Segmented
                    value={flipMeteringChoice(draft.rtx30FlipMetering)}
                    options={flipMeteringChoices}
                    onChange={(choice) => update("rtx30FlipMetering", flipMeteringValue(choice))}
                    size="sm"
                    label="RTX 30 flip metering"
                  />
                </SettingRow>
                <SettingRow
                  label="GPU name override"
                  hint="Tells the game the card is an RTX 4090 so its Frame Generation option appears. RTX 30 only."
                >
                  <div className="flex justify-end">
                    <ToggleField
                      label=""
                      checked={draft.gpuNameOverride}
                      onChange={(checked) => update("gpuNameOverride", checked)}
                    />
                  </div>
                </SettingRow>
              </div>
            )}

            {step.id === "debug" && (
              <div className="mt-4 divide-y divide-line/60 rounded-[5px] border border-line bg-raised">
                <SettingRow label="Interval logging" hint="Per-frame timing lines in the mod's log.">
                  <div className="flex justify-end">
                    <ToggleField
                      label=""
                      checked={draft.intervalLogging}
                      onChange={(checked) => update("intervalLogging", checked)}
                    />
                  </div>
                </SettingRow>
                <SettingRow label="Generated-only debug" hint="A mod debugging switch for bug reports.">
                  <div className="flex justify-end">
                    <ToggleField
                      label=""
                      checked={draft.generatedOnlyDebug}
                      onChange={(checked) => update("generatedOnlyDebug", checked)}
                    />
                  </div>
                </SettingRow>
              </div>
            )}

            {step.id === "summary" && (
              <div className="mt-4 flex flex-col gap-3">
                {summaryGroups(draft).map((group) => (
                  <div key={group.title}>
                    <div className="label">{group.title}</div>
                    <div className="mt-1 divide-y divide-line/40">
                      {group.rows.map(([label, value]) => (
                        <div key={label} className="flex items-baseline justify-between gap-4 py-1.5">
                          <span className="text-[11.5px] text-ink-muted">{label}</span>
                          <span className="text-[11.5px] text-ink">{value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
                <p className="text-[10.5px] text-ink-muted">
                  Written to RTXMFG-Universal.json and RTX40MFG-UI.ini beside the game executable.
                  You can change any of it later in the Settings tab or the mod's menu.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </Dialog>
  );
}
