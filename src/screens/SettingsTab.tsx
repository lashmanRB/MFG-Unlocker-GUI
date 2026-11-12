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
  latencyPacingChoices,
  modeChoices,
  multiplierChoices,
  optiScalerUiChoices,
  vsyncChoices,
  xemfgRoundingChoices,
} from "../lib/options";
import type { FlipMeteringChoice } from "../lib/options";
import type { GameEntry, GameSettings } from "../lib/types";
import { Button } from "../components/Button";
import { Callout } from "../components/Callout";
import { Dlss5Tab } from "../components/Dlss5Tab";
import { KeybindsTab } from "../components/KeybindsTab";
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
  game,
  gpuFamily,
  onDirtyChange,
  onGuidedSetup,
}: {
  game: GameEntry;
  gpuFamily: string | null;
  onDirtyChange: (dirty: boolean) => void;
  onGuidedSetup: () => void;
}) {
  const toast = useToast();
  const { data, loading, error, reload } = useSettings(game.id);
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
  // Off (1x) only exists on the RTX 30 and 20 routes.
  const multiplierOptions =
    gpuFamily === "ampere" || gpuFamily === "turing"
      ? [{ value: 1, label: "Off (1x)" }, ...multiplierChoices]
      : multiplierChoices;

  const save = async () => {
    setSaving(true);
    setSaveError(null);
    const response = await attempt(() => api.writeSettings(game.id, form));
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
                    options={multiplierOptions}
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
              <ToggleField
                label="Pinned latency"
                hint="A latency row under the FPS readout, with its own pin. DX12 and Vulkan only."
                checked={form.pinnedLatency}
                onChange={(checked) => update("pinnedLatency", checked)}
              />
              <ToggleField
                label="Latency monitor"
                hint="Off hides the latency readout entirely."
                checked={form.latencyMonitor}
                onChange={(checked) => update("latencyMonitor", checked)}
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
              <Field
                label="OptiScaler menu"
                htmlFor="settings-optiscaler-ui"
                hint="Who owns the in-game menu when OptiScaler is installed. Mod default hides this menu once OptiScaler offers its plugin tab."
              >
                <Select
                  id="settings-optiscaler-ui"
                  value={form.optiScalerUi ?? ""}
                  onChange={(value) => update("optiScalerUi", value === "" ? null : value)}
                >
                  {optiScalerUiChoices.map((choice) => (
                    <option key={choice.value} value={choice.value}>
                      {choice.label}
                    </option>
                  ))}
                </Select>
              </Field>
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
                hint="Per-frame timing lines in the mod's log. RTX 40 and 50 keep it on regardless."
                checked={form.intervalLogging}
                onChange={(checked) => update("intervalLogging", checked)}
              />
              <ToggleField
                label="Generated-only debug"
                checked={form.generatedOnlyDebug}
                onChange={(checked) => update("generatedOnlyDebug", checked)}
              />
              <ToggleField
                label="Write log file"
                hint="The mod's runtime log. Applies at the next game start."
                checked={form.writeLogFile}
                onChange={(checked) => update("writeLogFile", checked)}
              />
              <ToggleField
                label="Latency probe"
                hint="Records latency events to a csv beside the log, up to 512 MB."
                checked={form.latencyProbe}
                onChange={(checked) => update("latencyProbe", checked)}
              />
            </div>
          </Section>

          <Section
            title="XeMFG"
            aside={<span className="text-[10.5px] text-ink-dim">experimental</span>}
          >
            <div className={fieldGrid}>
              <ToggleField
                label="XeMFG standalone"
                hint="Runs XeSS frame generation without OptiScaler. Needs Intel's runtime in RTXMFG-XeSS beside the mod."
                checked={form.xemfgStandalone}
                onChange={(checked) => update("xemfgStandalone", checked)}
              />
              <Field label="Up to" htmlFor="settings-xemfg-frames">
                <Select
                  id="settings-xemfg-frames"
                  value={form.xemfgFrames}
                  onChange={(value) => update("xemfgFrames", Number(value))}
                >
                  {[2, 3, 4, 5, 6].map((count) => (
                    <option key={count} value={count}>
                      {count}x
                    </option>
                  ))}
                </Select>
              </Field>
              <ToggleField
                label="Dynamic"
                hint="Chases the dynamic target instead of a fixed count."
                checked={form.xemfgDynamic}
                onChange={(checked) => update("xemfgDynamic", checked)}
              />
              <Field
                label="Dynamic target FPS"
                htmlFor="settings-xemfg-target"
                hint="0 follows the refresh rate. Also the FPS limit when used as a cap."
              >
                <NumberInput
                  id="settings-xemfg-target"
                  value={form.xemfgTargetFps}
                  onChange={(value) => update("xemfgTargetFps", value)}
                  min={0}
                  max={1000}
                />
              </Field>
              <Field label="Rounding" htmlFor="settings-xemfg-rounding" hint="How the dynamic count rounds toward the target.">
                <Select
                  id="settings-xemfg-rounding"
                  value={form.xemfgRounding}
                  onChange={(value) => update("xemfgRounding", Number(value))}
                >
                  {xemfgRoundingChoices.map((choice) => (
                    <option key={choice.value} value={choice.value}>
                      {choice.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Flip queue" htmlFor="settings-xemfg-flipqueue" hint="Paces each batch evenly. Off returns to the older pacing.">
                <Select
                  id="settings-xemfg-flipqueue"
                  value={form.xemfgFlipQueue}
                  onChange={(value) => update("xemfgFlipQueue", Number(value))}
                >
                  {latencyPacingChoices.map((choice) => (
                    <option key={choice.value} value={choice.value}>
                      {choice.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <ToggleField
                label="Allow 1x"
                hint="Lets dynamic turn frame generation off."
                checked={form.xemfgAllow1x}
                onChange={(checked) => update("xemfgAllow1x", checked)}
              />
              <ToggleField
                label="Use target as cap"
                hint="Holds the frame rate at the target with the FPS limit."
                checked={form.xemfgTargetAsCap}
                onChange={(checked) => update("xemfgTargetAsCap", checked)}
              />
              <Field label="Latency pacing" htmlFor="settings-latency-pacing" hint="Auto uses the driver's flip metering where it is offered.">
                <Select
                  id="settings-latency-pacing"
                  value={form.latencyPacing}
                  onChange={(value) => update("latencyPacing", Number(value))}
                >
                  {latencyPacingChoices.map((choice) => (
                    <option key={choice.value} value={choice.value}>
                      {choice.label}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          </Section>

          <KeybindsTab
            keybinds={form.keybinds}
            showNote={form.showNote}
            onKeybinds={(next) => update("keybinds", next)}
            onShowNote={(next) => update("showNote", next)}
          />

          <Dlss5Tab
            game={game}
            settings={form}
            onChange={(patch) =>
              setForm((current) => (current === null ? current : { ...current, ...patch }))
            }
          />
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
