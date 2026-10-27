import { useEffect, useState } from "react";
import { Check, Minus, RotateCcw, Save } from "lucide-react";
import { api } from "../lib/api";
import { attempt } from "../lib/attempt";
import { cn } from "../lib/cn";
import { sameSettings } from "../lib/game";
import { isVkCode } from "../lib/keycodes";
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
import type { FlipMeteringChoice } from "../lib/options";
import type { GameSettings } from "../lib/types";
import { Button } from "../components/Button";
import { Callout } from "../components/Callout";
import {
  NumberInput,
  RadioGroup,
  Select,
  TextInput,
  ToggleField,
} from "../components/Controls";
import { Field } from "../components/Field";
import { KeyCapture } from "../components/KeyCapture";
import { Section } from "../components/Section";
import { Segmented } from "../components/Segmented";
import { Skeleton } from "../components/Skeleton";
import { useSettings } from "../hooks/useSettings";
import { useToast } from "../hooks/useToast";

const fieldGrid = "grid gap-x-5 gap-y-4 @2xl:grid-cols-2";

function FileFlag({ label, present }: { label: string; present: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1",
        present ? "text-ink-muted" : "text-ink-dim",
      )}
    >
      {present ? (
        <Check size={11} className="shrink-0 text-accent/80" />
      ) : (
        <Minus size={11} className="shrink-0" />
      )}
      {label} {present ? "found" : "missing"}
    </span>
  );
}

export function SettingsTab({
  gameId,
  onDirtyChange,
  onGuidedSetup,
}: {
  gameId: string;
  onDirtyChange: (dirty: boolean) => void;
  onGuidedSetup: () => void;
}) {
  const toast = useToast();
  const { data, loading, error, reload } = useSettings(gameId);
  const [form, setForm] = useState<GameSettings | null>(null);
  const [saved, setSaved] = useState<GameSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  useEffect(() => {
    setForm(data);
    setSaved(data);
    setWarnings([]);
    setSaveError(null);
  }, [data]);

  const dirty = form !== null && saved !== null && !sameSettings(form, saved);

  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);

  function update<K extends keyof GameSettings>(key: K, value: GameSettings[K]) {
    setForm((current) => (current === null ? current : { ...current, [key]: value }));
  }

  if (loading && form === null) {
    return (
      <div className="flex flex-col gap-3 p-4">
        <Skeleton className="h-3 w-64" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (error !== null && form === null) {
    return (
      <div className="max-w-[520px] p-4">
        <Callout tone="danger">
          <p>Could not read the settings for this game: {error}</p>
          <Button size="sm" className="mt-2" onClick={reload}>
            Try again
          </Button>
        </Callout>
      </div>
    );
  }

  if (form === null) return null;

  const showBar = dirty || warnings.length > 0 || saveError !== null;

  const multiplierHint =
    form.mode === "fixed"
      ? "Generated frames per real frame."
      : form.mode === "follow"
        ? "Follow mode reads the game's own multiplier, so this stays unused."
        : "Dynamic mode picks the multiplier itself, so this stays unused.";
  const customTargetHint = form.dynamicLockToRefreshRate
    ? "The refresh rate is used while the lock is on."
    : "30 to 1000.";
  const reflexHint =
    form.mode === "dynamic"
      ? "Not used in dynamic mode: the dynamic target owns the frame rate."
      : "0 leaves the game's own limiter alone.";

  const save = async () => {
    setSaving(true);
    setSaveError(null);
    const response = await attempt(() => api.writeSettings(gameId, form));
    setSaving(false);
    if (!response.ok) {
      setSaveError(response.message);
      toast("error", `Settings were not saved: ${response.message}`);
      return;
    }
    if (!response.value.ok) {
      setSaveError("The mod refused these settings, so nothing was written.");
      toast("error", "The mod refused these settings");
      return;
    }
    setSaved(form);
    setWarnings(response.value.warnings);
    if (response.value.warnings.length > 0) {
      toast("warn", "Saved, with warnings to check");
    } else {
      toast("ok", "Settings applied");
    }
  };

  const revert = () => {
    setForm(saved);
    setWarnings([]);
    setSaveError(null);
  };

  const dismiss = () => {
    setWarnings([]);
    setSaveError(null);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-[900px] flex-col gap-3 px-4 py-3.5">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]">
            <FileFlag label="control file" present={form.hasControlFile} />
            <FileFlag label="ini file" present={form.hasIniFile} />
            <span className="text-ink-dim">read from the mod folder</span>
            <Button size="sm" variant="ghost" className="ml-auto" onClick={onGuidedSetup}>
              Guided setup
            </Button>
          </div>

          <Section title="Frame generation">
            <div className="flex flex-col gap-4">
              <div className={fieldGrid}>
                <Field
                  label="Mode"
                  hint="Follow leaves the choice to the game, fixed holds one multiplier, dynamic chases a target frame rate."
                >
                  <Segmented
                    value={form.mode}
                    options={modeChoices}
                    onChange={(mode) => update("mode", mode)}
                    label="Frame generation mode"
                  />
                </Field>
                <Field label="Multiplier" hint={multiplierHint}>
                  <Segmented
                    value={form.multiplier}
                    options={multiplierChoices}
                    onChange={(multiplier) => update("multiplier", multiplier)}
                    disabled={form.mode !== "fixed"}
                    label="Multiplier"
                  />
                </Field>
              </div>

              <div className="rounded-[5px] border border-line bg-base/40 px-3 py-2.5">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <span className="label text-ink-muted">Dynamic target</span>
                  {form.mode !== "dynamic" && (
                    <span className="text-[10.5px] text-ink-dim">only used in dynamic mode</span>
                  )}
                </div>
                <div className={fieldGrid}>
                  <ToggleField
                    label="Lock to refresh rate"
                    hint="Aim at the current display refresh rate."
                    checked={form.dynamicLockToRefreshRate}
                    onChange={(checked) => update("dynamicLockToRefreshRate", checked)}
                    disabled={form.mode !== "dynamic"}
                  />
                  <Field
                    label="Custom target FPS"
                    htmlFor="settings-custom-fps"
                    hint={customTargetHint}
                  >
                    <NumberInput
                      id="settings-custom-fps"
                      value={form.dynamicCustomTargetFrameRate}
                      onChange={(value) => update("dynamicCustomTargetFrameRate", value)}
                      min={30}
                      max={1000}
                      disabled={form.mode !== "dynamic" || form.dynamicLockToRefreshRate}
                    />
                  </Field>
                </div>
              </div>

              <div className={fieldGrid}>
                <Field label="DLSS-G preset" hint="Preset C needs DLSS-G 310.9.16 or newer.">
                  <RadioGroup
                    value={form.dlssgPreset}
                    options={dlssgPresetChoices}
                    onChange={(value) => update("dlssgPreset", value)}
                    label="DLSS-G preset"
                  />
                </Field>
                <Field label="V-Sync" htmlFor="settings-vsync">
                  <Select
                    id="settings-vsync"
                    value={form.vsyncMode}
                    onChange={(value) => update("vsyncMode", Number(value))}
                  >
                    {vsyncChoices.map((choice) => (
                      <option key={choice.value} value={choice.value}>
                        {choice.label}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>

              <Field
                label="Reflex FPS limit"
                htmlFor="settings-reflex"
                hint={reflexHint}
              >
                <NumberInput
                  id="settings-reflex"
                  value={form.reflexFrameLimitFps}
                  onChange={(value) => update("reflexFrameLimitFps", value)}
                  min={0}
                  max={1000}
                  disabled={form.mode === "dynamic"}
                />
              </Field>
            </div>
          </Section>

          <Section
            title="DLSS presets"
            aside={<span className="text-[10.5px] text-ink-dim">DX12 only</span>}
          >
            <div className={fieldGrid}>
              <Field
                label="Super Resolution"
                hint="K has the best image quality, J is the same model with a little less ghosting and more flicker, L and M are the newer models meant for Ultra Performance and Performance."
              >
                <RadioGroup
                  value={form.dlssSrPreset}
                  options={dlssSrPresetChoices}
                  onChange={(value) => update("dlssSrPreset", value)}
                  label="Super Resolution preset"
                />
              </Field>
              <Field
                label="Ray Reconstruction"
                hint="D is the first transformer model, E the newer one that games with a depth of field guide need, F is the second generation model and needs driver 580 or newer."
              >
                <RadioGroup
                  value={form.dlssRrPreset}
                  options={dlssRrPresetChoices}
                  onChange={(value) => update("dlssRrPreset", value)}
                  label="Ray Reconstruction preset"
                />
              </Field>
            </div>
            <p className="mt-3 text-[11px] leading-snug text-ink-dim">
              These apply live, but only in DX12 games.
            </p>
          </Section>

          <Section title="Menu">
            <div className={fieldGrid}>
              <Field label="Language" htmlFor="settings-language">
                <Select
                  id="settings-language"
                  value={form.language}
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
                label="Menu hotkey"
                hint={
                  form.toggleKey.trim().length > 0 && !isVkCode(form.toggleKey)
                    ? "This is not a virtual key code; click and press a key to replace it."
                    : "Click, then press one key. Empty keeps the mod's default (Backspace)."
                }
              >
                <KeyCapture
                  value={form.toggleKey}
                  onChange={(value) => update("toggleKey", value)}
                />
              </Field>
              <Field
                label="Layout scale"
                htmlFor="settings-layout"
                hint="Leave empty for the menu's default scale."
              >
                <TextInput
                  id="settings-layout"
                  value={form.layoutScale}
                  onChange={(value) => update("layoutScale", value)}
                  placeholder="default"
                  mono
                />
              </Field>
              <ToggleField
                label="Pinned FPS"
                hint="Keep the frame rate readout visible in the overlay."
                checked={form.pinnedFps}
                onChange={(checked) => update("pinnedFps", checked)}
              />
            </div>
          </Section>

          <Section title="Compatibility">
            <div className={fieldGrid}>
              <Field
                label="RTX 30 flip metering"
                hint="Inherit leaves the mod's own default in place."
              >
                <Segmented
                  value={flipMeteringChoice(form.rtx30FlipMetering)}
                  options={flipMeteringChoices}
                  onChange={(choice: FlipMeteringChoice) =>
                    update("rtx30FlipMetering", flipMeteringValue(choice))
                  }
                  label="RTX 30 flip metering"
                />
              </Field>
              <ToggleField
                label="GPU name override"
                hint="Changes the adapter name the game reads."
                checked={form.gpuNameOverride}
                onChange={(checked) => update("gpuNameOverride", checked)}
              />
            </div>
            {form.gpuNameOverride && (
              <Callout tone="warn" className="mt-3">
                The game will see an RTX 4090 instead of your actual GPU.
              </Callout>
            )}
          </Section>

          <Section title="Diagnostics">
            <div className={fieldGrid}>
              <ToggleField
                label="Interval logging"
                checked={form.intervalLogging}
                onChange={(checked) => update("intervalLogging", checked)}
              />
              <ToggleField
                label="Generated-only debug"
                checked={form.generatedOnlyDebug}
                onChange={(checked) => update("generatedOnlyDebug", checked)}
              />
            </div>
          </Section>
        </div>
      </div>

      {showBar && (
        <div className="shrink-0 border-t border-line bg-elevated px-4 py-2">
          {(saveError !== null || warnings.length > 0) && (
            <div className="mb-2 space-y-1">
              {saveError !== null && <Callout tone="danger">{saveError}</Callout>}
              {warnings.map((warning) => (
                <Callout key={warning} tone="warn">
                  {warning}
                </Callout>
              ))}
            </div>
          )}
          <div className="flex items-center justify-between gap-3">
            <span className="text-[11px] text-ink-dim">
              {dirty
                ? "Unsaved changes"
                : saveError !== null
                  ? "Save failed"
                  : "Applied with warnings"}
            </span>
            <div className="flex items-center gap-2">
              {dirty ? (
                <>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={revert}
                    disabled={saving}
                    icon={<RotateCcw size={12} />}
                  >
                    Revert
                  </Button>
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={save}
                    loading={saving}
                    icon={<Save size={12} />}
                  >
                    Save
                  </Button>
                </>
              ) : (
                <Button size="sm" variant="ghost" onClick={dismiss}>
                  Dismiss
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
