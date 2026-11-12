import { useEffect, useState } from "react";
import { Copy, Import, Save, Share2, Trash2 } from "lucide-react";
import { api } from "../lib/api";
import { attempt } from "../lib/attempt";
import { copyText } from "../lib/clipboard";
import { dlss5ModelChoices, dlss5StageChoices } from "../lib/options";
import type { Dlss5Preset, GameEntry, GameSettings } from "../lib/types";
import { Button } from "./Button";
import { Callout } from "./Callout";
import { NumberInput, Select, TextInput, ToggleField } from "./Controls";
import { Field } from "./Field";
import { Section } from "./Section";
import { Skeleton } from "./Skeleton";
import { useToast } from "../hooks/useToast";

const fieldGrid = "grid gap-x-5 gap-y-4 @2xl:grid-cols-2";

export function Dlss5Tab({
  game,
  settings,
  onChange,
}: {
  game: GameEntry;
  settings: GameSettings;
  onChange: (patch: Partial<GameSettings>) => void;
}) {
  const toast = useToast();
  const [presets, setPresets] = useState<Dlss5Preset[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [importText, setImportText] = useState("");
  const [savingPreset, setSavingPreset] = useState(false);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setListLoading(true);
    setListError(null);
    setNewName("");
    setImportText("");
    void attempt(() => api.dlss5Presets(game.id)).then((response) => {
      if (!alive) return;
      if (response.ok) {
        setPresets(response.value);
      } else {
        setPresets([]);
        setListError(response.message);
      }
      setListLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [game.id]);

  const reloadPresets = async () => {
    const response = await attempt(() => api.dlss5Presets(game.id));
    if (response.ok) {
      setPresets(response.value);
      setListError(null);
    } else {
      setListError(response.message);
    }
  };

  const copyCode = async (preset: Dlss5Preset) => {
    const copied = await copyText(preset.code);
    if (copied) toast("ok", "Code copied to the clipboard");
    else toast("error", "Clipboard access was refused");
  };

  const savePreset = async () => {
    const name = newName.trim();
    if (name.length === 0) return;
    setSavingPreset(true);
    const response = await attempt(() => api.dlss5SavePreset(game.id, name));
    setSavingPreset(false);
    if (!response.ok) {
      toast("error", `Could not save the preset: ${response.message}`);
      return;
    }
    setNewName("");
    toast("ok", `Preset "${name}" saved`);
    await reloadPresets();
  };

  const importPreset = async () => {
    const text = importText.trim();
    if (text.length === 0) return;
    setImporting(true);
    const response = await attempt(() => api.dlss5Import(game.id, text));
    setImporting(false);
    if (!response.ok) {
      toast("error", `Could not import that code: ${response.message}`);
      return;
    }
    setImportText("");
    toast("ok", `Imported "${response.value.name}"`);
    await reloadPresets();
  };

  const deletePreset = async (name: string) => {
    setDeleting(name);
    const response = await attempt(() => api.dlss5DeletePreset(game.id, name));
    setDeleting(null);
    if (!response.ok) {
      toast("error", `Could not delete the preset: ${response.message}`);
      return;
    }
    toast("ok", "Preset deleted");
    await reloadPresets();
  };

  const exportLook = async () => {
    setExporting(true);
    const response = await attempt(() => api.dlss5ExportCode(game.id));
    setExporting(false);
    if (!response.ok) {
      toast("error", `Could not export the current look: ${response.message}`);
      return;
    }
    const copied = await copyText(response.value);
    if (copied) toast("ok", "Current look copied to the clipboard");
    else toast("error", "Clipboard access was refused");
  };

  if (!game.compat.hasDlss5) {
    return (
      <div className="max-w-[520px]">
        <Callout tone="info">
          DLSS 5 needs the nvngx_dlssnr.dll provider beside the game executable. Once it is there,
          the mod's own menu shows this tab.
        </Callout>
      </div>
    );
  }

  const off = !settings.dlss5;

  return (
    <div className="flex flex-col gap-3">
      <Section title="DLSS 5">
        <div className="flex flex-col gap-4">
          <ToggleField
            label="Enable DLSS 5"
            hint="Adds the DLSS 5 look on top of the game's image."
            checked={settings.dlss5}
            onChange={(checked) => onChange({ dlss5: checked })}
          />
          <div className={fieldGrid}>
            <Field
              label="Hook stage"
              htmlFor="dlss5-stage"
              hint="Where the pass hooks into the frame. Auto lets the mod decide."
            >
              <Select
                id="dlss5-stage"
                value={settings.dlss5HookStage}
                onChange={(value) => onChange({ dlss5HookStage: Number(value) })}
                disabled={off}
              >
                {dlss5StageChoices.map((choice) => (
                  <option key={choice.value} value={choice.value}>
                    {choice.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Model" htmlFor="dlss5-model" hint="The network model the look runs on.">
              <Select
                id="dlss5-model"
                value={settings.dlss5Model}
                onChange={(value) => onChange({ dlss5Model: Number(value) })}
                disabled={off}
              >
                {dlss5ModelChoices.map((choice) => (
                  <option key={choice.value} value={choice.value}>
                    {choice.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label="Overall intensity"
              htmlFor="dlss5-overall"
              hint="Strength of the whole effect. 0 leaves the image untouched."
            >
              <NumberInput
                id="dlss5-overall"
                value={settings.dlss5OverallIntensity}
                onChange={(value) => onChange({ dlss5OverallIntensity: value })}
                min={0}
                max={1}
                step={0.05}
                disabled={off}
              />
            </Field>
            <Field
              label="Structure intensity"
              htmlFor="dlss5-structure"
              hint="How strongly edges and fine detail are reworked."
            >
              <NumberInput
                id="dlss5-structure"
                value={settings.dlss5StructureIntensity}
                onChange={(value) => onChange({ dlss5StructureIntensity: value })}
                min={0}
                max={2}
                step={0.05}
                disabled={off}
              />
            </Field>
            <Field
              label="Tone intensity"
              htmlFor="dlss5-tone"
              hint="How strongly colour and contrast are reworked."
            >
              <NumberInput
                id="dlss5-tone"
                value={settings.dlss5ToneIntensity}
                onChange={(value) => onChange({ dlss5ToneIntensity: value })}
                min={0}
                max={2}
                step={0.05}
                disabled={off}
              />
            </Field>
            <Field
              label="Character intensity"
              htmlFor="dlss5-character"
              hint="How strongly faces and skin are reworked. -1 follows Structure."
            >
              <NumberInput
                id="dlss5-character"
                value={settings.dlss5CharacterIntensity}
                onChange={(value) => onChange({ dlss5CharacterIntensity: value })}
                min={-1}
                max={2}
                step={0.05}
                disabled={off}
              />
            </Field>
            <Field
              label="Resolution scale"
              htmlFor="dlss5-scale"
              hint="Percent of the frame the network runs at. Lower is cheaper on the GPU."
            >
              <NumberInput
                id="dlss5-scale"
                value={settings.dlss5ResolutionScale}
                onChange={(value) => onChange({ dlss5ResolutionScale: value })}
                min={0}
                max={200}
                disabled={off || settings.dlss5ResolutionScaleAuto}
              />
            </Field>
            <ToggleField
              label="Auto scale"
              hint="Lets the mod pick the scale from the current load."
              checked={settings.dlss5ResolutionScaleAuto}
              onChange={(checked) => onChange({ dlss5ResolutionScaleAuto: checked })}
              disabled={off}
            />
            <ToggleField
              label="Half rate"
              hint="Runs the network every other evaluation to save GPU time."
              checked={settings.dlss5Boost}
              onChange={(checked) => onChange({ dlss5Boost: checked })}
              disabled={off}
            />
            <Field
              label="Pass count"
              htmlFor="dlss5-passes"
              hint="Networks chained one after another. More passes cost more."
            >
              <NumberInput
                id="dlss5-passes"
                value={settings.dlss5PassCount}
                onChange={(value) => onChange({ dlss5PassCount: value })}
                min={1}
                max={10}
                disabled={off}
              />
            </Field>
          </div>
        </div>
      </Section>

      <Section
        title="DLSS 5 presets"
        aside={
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void exportLook()}
            loading={exporting}
            icon={<Share2 size={11} />}
          >
            Export current look
          </Button>
        }
      >
        <div className="flex flex-col gap-3">
          {listLoading ? (
            <div className="space-y-1.5">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
            </div>
          ) : listError !== null ? (
            <Callout tone="danger">Could not list the presets: {listError}</Callout>
          ) : presets.length === 0 ? (
            <p className="text-[11.5px] leading-snug text-ink-dim">
              No presets saved for this game yet. Save the current look below or import a share
              code.
            </p>
          ) : (
            <ul className="overflow-hidden rounded-[5px] border border-line">
              {presets.map((preset) => (
                <li
                  key={preset.name}
                  className="flex items-center justify-between gap-2 border-b border-line px-2.5 py-1.5 last:border-b-0"
                >
                  <span
                    className="mono min-w-0 truncate text-[11.5px] text-ink-muted"
                    title={preset.name}
                  >
                    {preset.name}
                  </span>
                  <span className="flex shrink-0 items-center gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void copyCode(preset)}
                      disabled={deleting === preset.name}
                      icon={<Copy size={11} />}
                    >
                      Copy code
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => void deletePreset(preset.name)}
                      loading={deleting === preset.name}
                      icon={<Trash2 size={11} />}
                    >
                      Delete
                    </Button>
                  </span>
                </li>
              ))}
            </ul>
          )}

          <div className="flex items-end gap-2">
            <Field label="New preset" htmlFor="dlss5-new-preset" className="min-w-0 flex-1">
              <TextInput
                id="dlss5-new-preset"
                value={newName}
                onChange={setNewName}
                placeholder="Name for the current look"
              />
            </Field>
            <Button
              onClick={() => void savePreset()}
              loading={savingPreset}
              disabled={newName.trim().length === 0}
              icon={<Save size={12} />}
            >
              Save
            </Button>
          </div>

          <Field
            label="Import a share code"
            htmlFor="dlss5-import"
            hint="Paste a share code, or a chat message with one in it."
          >
            <textarea
              id="dlss5-import"
              value={importText}
              onChange={(event) => setImportText(event.target.value)}
              placeholder="Paste the code here"
              spellCheck={false}
              rows={3}
              className="mono w-full resize-y rounded-[5px] border border-line bg-elevated px-2 py-1.5 text-[11.5px] leading-relaxed text-ink placeholder:text-ink-dim transition-colors duration-150 ease-out hover:border-line-strong"
            />
          </Field>
          <div className="flex justify-end">
            <Button
              onClick={() => void importPreset()}
              loading={importing}
              disabled={importText.trim().length === 0}
              icon={<Import size={12} />}
            >
              Import
            </Button>
          </div>
        </div>
      </Section>

      <p className="text-[11px] leading-snug text-ink-dim">
        The advanced pass, blend and halo keys stay in the mod's own menu. This tab carries the
        main look and the share codes.
      </p>
    </div>
  );
}
