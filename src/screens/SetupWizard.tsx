import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { attempt } from "../lib/attempt";
import {
  dlssRrPresetChoices,
  dlssSrPresetChoices,
  dlssgPresetChoices,
  flipMeteringChoice,
  flipMeteringChoices,
  flipMeteringValue,
  languageChoices,
  modeChoices,
  multiplierChoices,
  vsyncChoices,
} from "../lib/options";
import type { GameEntry, GameSettings } from "../lib/types";
import { Button } from "../components/Button";
import { Callout } from "../components/Callout";
import {
  NumberInput,
  RadioGroup,
  Select,
  TextInput,
  ToggleField,
} from "../components/Controls";
import { Dialog } from "../components/Dialog";
import { Field } from "../components/Field";
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
  | "intro"
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
  question: string;
  explain: string;
  recommended: string;
  when?: (draft: GameSettings) => boolean;
  apply?: (draft: GameSettings) => Partial<GameSettings>;
}

const steps: StepDef[] = [
  {
    id: "intro",
    question: "One setting at a time",
    explain:
      "The next screens ask about each setting, say what it does and show what most people want. Nothing is written to the game until the last screen. You can also skip the questions and take the recommended values in one go.",
    recommended: "Follow game for the mode, everything else at its default",
  },
  {
    id: "mode",
    question: "How should the multiplier be chosen?",
    explain:
      "This is the only setting that really changes how the game feels. The mod can keep the game's own choice, hold one multiplier, or shift between multipliers to chase a frame rate.",
    recommended: "Follow game",
    apply: () => ({
      mode: "follow",
      multiplier: 2,
      dynamicLockToRefreshRate: true,
    }),
  },
  {
    id: "multiplier",
    question: "How many generated frames per real frame?",
    explain:
      "2x is what the game does on its own. 4x means three generated frames per real one. Higher multiplies more and asks more of the card, and anything above what the game and NVIDIA allow can stutter or blink.",
    recommended: "2x",
    when: (draft) => draft.mode === "fixed",
    apply: () => ({ multiplier: 2 }),
  },
  {
    id: "target",
    question: "What frame rate should it aim for?",
    explain:
      "Dynamic mode shifts between multipliers to hold this target. Locking to the refresh rate of the display is the simple option; a custom value is for when you cap the game below it.",
    recommended: "Lock to the display refresh rate",
    when: (draft) => draft.mode === "dynamic",
    apply: () => ({
      dynamicLockToRefreshRate: true,
      dynamicCustomTargetFrameRate: 120,
    }),
  },
  {
    id: "preset",
    question: "Which Frame Generation preset?",
    explain:
      "The presets are NVIDIA's frame synthesis models. The game and the NVIDIA app already pick one, so staying on their choice is the safe move. Only change it when troubleshooting: B is the one that helps when frame generation freezes the picture, and C needs a recent DLSS-G.",
    recommended: "Game / driver",
    apply: () => ({ dlssgPreset: 0 }),
  },
  {
    id: "pacing",
    question: "How should frame pacing be handled?",
    explain:
      "V-Sync and a Reflex cap decide how the generated frames meet the display. When frame generation makes the picture blink, V-Sync off is the first thing to try. The Reflex cap is for keeping the game's own limiter in charge.",
    recommended: "V-Sync: Game / driver, Reflex limit 0",
    apply: () => ({ vsyncMode: 0, reflexFrameLimitFps: 0 }),
  },
  {
    id: "image",
    question: "DLSS image models",
    explain:
      "These pick the Super Resolution and Ray Reconstruction models. They change picture quality rather than performance. Leave both on the game's choice unless you know you want a specific model.",
    recommended: "Game / driver for both",
    apply: () => ({ dlssSrPreset: 0, dlssRrPreset: 0 }),
  },
  {
    id: "menu",
    question: "The in-game menu",
    explain:
      "The mod has its own menu inside the game, opened with the key below, where all of this can also be changed while playing. The language below only changes that menu.",
    recommended: "Auto language, no key set, no pinned FPS",
    apply: () => ({
      language: "auto",
      toggleKey: "",
      pinnedFps: false,
      layoutScale: "",
    }),
  },
  {
    id: "compat",
    question: "Compatibility switches",
    explain:
      "These exist for specific problems and both only do anything on RTX 30 cards. Leave them alone unless you are on an RTX 30 or a game refuses to show its Frame Generation option.",
    recommended: "Inherit, and the GPU name override off",
    apply: () => ({ rtx30FlipMetering: null, gpuNameOverride: false }),
  },
  {
    id: "debug",
    question: "Diagnostics",
    explain:
      "Extra logging in the mod's own log files, meant for bug reports. They cost a little performance and are best left off while playing.",
    recommended: "Both off",
    apply: () => ({ intervalLogging: false, generatedOnlyDebug: false }),
  },
  {
    id: "summary",
    question: "Does this look right?",
    explain:
      "This is what will be written to the mod's settings files beside the game executable. You can change any of it later in the Settings tab or in the mod's own menu.",
    recommended: "",
  },
];

function labelOf<T extends string | number>(
  choices: { value: T; label: string }[],
  value: T,
): string {
  return choices.find((choice) => choice.value === value)?.label ?? String(value);
}

function summaryRows(game: GameEntry, draft: GameSettings): { label: string; value: string }[] {
  const rows: { label: string; value: string }[] = [];
  rows.push({ label: "Mode", value: labelOf(modeChoices, draft.mode) });
  if (draft.mode === "fixed") {
    rows.push({ label: "Multiplier", value: `${draft.multiplier}x` });
  }
  if (draft.mode === "dynamic") {
    rows.push({
      label: "Dynamic target",
      value: draft.dynamicLockToRefreshRate
        ? "locked to the display refresh rate"
        : `${draft.dynamicCustomTargetFrameRate} FPS`,
    });
  }
  rows.push({ label: "Frame Generation preset", value: labelOf(dlssgPresetChoices, draft.dlssgPreset) });
  rows.push({ label: "V-Sync", value: labelOf(vsyncChoices, draft.vsyncMode) });
  rows.push({
    label: "Reflex limit",
    value: draft.reflexFrameLimitFps === 0 ? "left to the game" : `${draft.reflexFrameLimitFps} FPS`,
  });
  rows.push({
    label: "Super Resolution / Ray Reconstruction",
    value: `${labelOf(dlssSrPresetChoices, draft.dlssSrPreset)} / ${labelOf(dlssRrPresetChoices, draft.dlssRrPreset)}`,
  });
  rows.push({
    label: "Menu",
    value: `${labelOf(languageChoices, draft.language)}, ${draft.toggleKey === "" ? "default key" : "custom key"}${draft.pinnedFps ? ", pinned FPS on" : ""}`,
  });
  rows.push({
    label: "Compatibility",
    value: `flip metering ${labelOf(flipMeteringChoices, flipMeteringChoice(draft.rtx30FlipMetering))}, GPU name override ${draft.gpuNameOverride ? "on" : "off"}`,
  });
  rows.push({
    label: "Diagnostics",
    value: draft.intervalLogging || draft.generatedOnlyDebug ? "logging on" : "off",
  });
  if (!draft.hasControlFile) {
    rows.push({ label: "Note", value: `${game.name} has no settings file yet, one will be created` });
  }
  return rows;
}

export function SetupWizard({ game, onClose, onSaved }: SetupWizardProps) {
  const toast = useToast();
  const [draft, setDraft] = useState<GameSettings | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [currentId, setCurrentId] = useState<StepId>("intro");
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

  function applyRecommended() {
    setDraft((current) => {
      if (current === null) return current;
      let next = { ...current };
      for (const candidate of steps) {
        if (candidate.apply !== undefined) next = { ...next, ...candidate.apply(next) };
      }
      return next;
    });
    setCurrentId("summary");
  }

  function applyStepRecommendation() {
    if (draft === null || step.apply === undefined) return;
    setDraft({ ...draft, ...step.apply(draft) });
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
      onClose={onClose}
      actions={
        step.id === "intro" ? (
          <>
            <Button size="sm" variant="ghost" onClick={applyRecommended}>
              Use recommended settings
            </Button>
            <Button size="sm" onClick={() => setCurrentId("mode")}>
              Walk me through it
            </Button>
          </>
        ) : (
          <>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setCurrentId(visible[Math.max(0, index - 1)].id)}
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
          </>
        )
      }
    >
      {draft === null ? (
        <div className="p-4">
          {loadError !== null ? (
            <Callout tone="danger">{loadError}</Callout>
          ) : (
            <Skeleton className="h-24 w-full" />
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3 p-4">
          <div className="flex items-center justify-between gap-2">
            <span className="mono text-[10.5px] tracking-[0.06em] text-ink-dim uppercase">
              {step.id === "intro"
                ? "guided setup"
                : step.id === "summary"
                  ? "review"
                  : `step ${index} of ${visible.length - 2}`}
            </span>
            {step.apply !== undefined && (
              <Button size="sm" variant="ghost" onClick={applyStepRecommendation}>
                Use recommended
              </Button>
            )}
          </div>

          <div>
            <h3 className="text-[14px] font-semibold tracking-[-0.01em] text-ink">{step.question}</h3>
            <p className="mt-1 text-[11.5px] leading-relaxed text-ink-muted">{step.explain}</p>
          </div>

          {step.id === "intro" && (
            <Callout tone="info">
              The mod menu inside the game opens with Backspace and shows every one of these settings
              too, so nothing here is a one way door.
            </Callout>
          )}

          {step.id === "mode" && (
            <div className="flex flex-col gap-2">
              <Segmented
                value={draft.mode}
                options={modeChoices}
                onChange={(mode) => update("mode", mode)}
                label="Frame generation mode"
              />
              <p className="text-[11px] leading-snug text-ink-dim">
                {draft.mode === "follow"
                  ? "The game keeps deciding, exactly as it does without the mod. Safest."
                  : draft.mode === "fixed"
                    ? "One multiplier at all times, whatever the game asks for. Predictable."
                    : "Shifts between multipliers to hold the target frame rate. The gear changes can show as uneven pacing."}
              </p>
            </div>
          )}

          {step.id === "multiplier" && (
            <div className="flex flex-col gap-2">
              <Segmented
                value={draft.multiplier}
                options={multiplierChoices}
                onChange={(multiplier) => update("multiplier", multiplier)}
                label="Multiplier"
              />
              <p className="text-[11px] leading-snug text-ink-dim">
                {game.compat.nvidiaTier === 6
                  ? "NVIDIA publishes a 6x ceiling for this title."
                  : game.compat.nvidiaTier === 4
                    ? "NVIDIA publishes a 4x ceiling for this title."
                    : "NVIDIA publishes no ceiling for this title, so the mod and the card decide."}
              </p>
            </div>
          )}

          {step.id === "target" && (
            <div className="flex flex-col gap-3">
              <ToggleField
                label="Lock to the display refresh rate"
                hint="Aim at the refresh rate the display is running at."
                checked={draft.dynamicLockToRefreshRate}
                onChange={(checked) => update("dynamicLockToRefreshRate", checked)}
              />
              <Field label="Custom target FPS" htmlFor="wizard-custom-fps" hint="30 to 1000.">
                <NumberInput
                  id="wizard-custom-fps"
                  value={draft.dynamicCustomTargetFrameRate}
                  onChange={(value) => update("dynamicCustomTargetFrameRate", value)}
                  min={30}
                  max={1000}
                  disabled={draft.dynamicLockToRefreshRate}
                />
              </Field>
            </div>
          )}

          {step.id === "preset" && (
            <div className="flex flex-col gap-2">
              <RadioGroup
                value={draft.dlssgPreset}
                options={dlssgPresetChoices}
                onChange={(value) => update("dlssgPreset", value)}
                label="Frame Generation preset"
              />
              <p className="text-[11px] leading-snug text-ink-dim">
                {draft.dlssgPreset === 0
                  ? "Whatever the game and the NVIDIA app already use."
                  : draft.dlssgPreset === 1
                    ? "A: the standard model, same as most games default to."
                    : draft.dlssgPreset === 2
                      ? "B: also improves how interface elements look, and it is the one to try when frame generation freezes the picture."
                      : "C: the lighter performance model. Needs DLSS-G 310.9.16 or newer."}
              </p>
            </div>
          )}

          {step.id === "pacing" && (
            <div className="flex flex-col gap-3">
              <Field label="V-Sync" htmlFor="wizard-vsync">
                <Select
                  id="wizard-vsync"
                  value={draft.vsyncMode}
                  onChange={(value) => update("vsyncMode", Number(value))}
                >
                  {vsyncChoices.map((choice) => (
                    <option key={choice.value} value={choice.value}>
                      {choice.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <p className="text-[11px] leading-snug text-ink-dim">
                {draft.vsyncMode === 1
                  ? "Off presents the game's frames without V-Sync, for games that keep V-Sync on with frame generation. This is the switch to try first when the picture blinks."
                  : draft.vsyncMode === 2
                    ? "Forces V-Sync on, overriding the game."
                    : "The game and the NVIDIA control panel decide."}
              </p>
              <Field
                label="Reflex FPS limit"
                htmlFor="wizard-reflex"
                hint={draft.mode === "dynamic" ? "Not used in dynamic mode." : "0 leaves the game's own limiter alone."}
              >
                <NumberInput
                  id="wizard-reflex"
                  value={draft.reflexFrameLimitFps}
                  onChange={(value) => update("reflexFrameLimitFps", value)}
                  min={0}
                  max={1000}
                  disabled={draft.mode === "dynamic"}
                />
              </Field>
            </div>
          )}

          {step.id === "image" && (
            <div className="flex flex-col gap-3">
              <Field label="Super Resolution" hint="J to M are the newer transformer models.">
                <RadioGroup
                  value={draft.dlssSrPreset}
                  options={dlssSrPresetChoices}
                  onChange={(value) => update("dlssSrPreset", value)}
                  label="Super Resolution preset"
                />
              </Field>
              <Field label="Ray Reconstruction" hint="F needs NVIDIA driver 580 or newer.">
                <RadioGroup
                  value={draft.dlssRrPreset}
                  options={dlssRrPresetChoices}
                  onChange={(value) => update("dlssRrPreset", value)}
                  label="Ray Reconstruction preset"
                />
              </Field>
            </div>
          )}

          {step.id === "menu" && (
            <div className="flex flex-col gap-3">
              <Field label="Menu language" htmlFor="wizard-language">
                <Select
                  id="wizard-language"
                  value={draft.language}
                  onChange={(value) => update("language", value)}
                >
                  {languageChoices.map((choice) => (
                    <option key={choice.value} value={choice.value}>
                      {choice.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field
                label="Menu key"
                hint="Empty keeps the mod's default, Backspace. The key opens the mod's menu in game."
              >
                <KeyCapture value={draft.toggleKey} onChange={(key) => update("toggleKey", key)} />
              </Field>
              <ToggleField
                label="Pinned FPS"
                hint="A small real and generated FPS readout while the menu is closed."
                checked={draft.pinnedFps}
                onChange={(checked) => update("pinnedFps", checked)}
              />
              <Field label="Menu layout scale" htmlFor="wizard-scale" hint="Empty means the default size.">
                <TextInput
                  id="wizard-scale"
                  value={draft.layoutScale}
                  onChange={(value) => update("layoutScale", value)}
                />
              </Field>
            </div>
          )}

          {step.id === "compat" && (
            <div className="flex flex-col gap-3">
              <Field
                label="RTX 30 flip metering"
                hint="Only does anything on RTX 30 cards. Inherit keeps the mod's own default, which is the newer pacing."
              >
                <Segmented
                  value={flipMeteringChoice(draft.rtx30FlipMetering)}
                  options={flipMeteringChoices}
                  onChange={(choice) => update("rtx30FlipMetering", flipMeteringValue(choice))}
                  label="RTX 30 flip metering"
                />
              </Field>
              <ToggleField
                label="GPU name override"
                hint="RTX 30 only: the game is told the card is an RTX 4090, so its Frame Generation option appears. Off by default and it does nothing on other cards."
                checked={draft.gpuNameOverride}
                onChange={(checked) => update("gpuNameOverride", checked)}
              />
            </div>
          )}

          {step.id === "debug" && (
            <div className="flex flex-col gap-3">
              <ToggleField
                label="Interval logging"
                hint="Extra per-frame timing lines in the mod's log."
                checked={draft.intervalLogging}
                onChange={(checked) => update("intervalLogging", checked)}
              />
              <ToggleField
                label="Generated-only debug"
                hint="A mod debugging switch, meant for bug reports."
                checked={draft.generatedOnlyDebug}
                onChange={(checked) => update("generatedOnlyDebug", checked)}
              />
            </div>
          )}

          {step.id === "summary" && (
            <dl className="flex flex-col gap-1.5 rounded-[5px] border border-line bg-base/40 px-3 py-2.5">
              {summaryRows(game, draft).map((row) => (
                <div key={row.label} className="flex items-baseline justify-between gap-3">
                  <dt className="text-[11px] text-ink-dim">{row.label}</dt>
                  <dd className="text-right text-[11.5px] text-ink">{row.value}</dd>
                </div>
              ))}
            </dl>
          )}

          {step.recommended.length > 0 && step.id !== "summary" && (
            <p className="text-[10.5px] text-ink-dim">Recommended: {step.recommended}</p>
          )}
        </div>
      )}
    </Dialog>
  );
}
