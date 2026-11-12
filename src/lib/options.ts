import type { MfgMode } from "./types";

export interface Choice<T extends string | number> {
  value: T;
  label: string;
}

export const modeChoices: Choice<MfgMode>[] = [
  { value: "follow", label: "Follow game" },
  { value: "fixed", label: "Fixed" },
  { value: "dynamic", label: "Dynamic" },
];

export const multiplierChoices: Choice<number>[] = [2, 3, 4, 5, 6].map((value) => ({
  value,
  label: `${value}x`,
}));

export const dlssgPresetChoices: Choice<number>[] = [
  { value: 0, label: "Game / driver" },
  { value: 1, label: "A" },
  { value: 2, label: "B" },
  { value: 3, label: "C" },
];

export const dlssSrPresetChoices: Choice<number>[] = [
  { value: 0, label: "Game / driver" },
  { value: 10, label: "J" },
  { value: 11, label: "K" },
  { value: 12, label: "L" },
  { value: 13, label: "M" },
];

export const dlssRrPresetChoices: Choice<number>[] = [
  { value: 0, label: "Game / driver" },
  { value: 4, label: "D" },
  { value: 5, label: "E" },
  { value: 6, label: "F" },
];

export const languageChoices: Choice<string>[] = [
  { value: "auto", label: "Auto (system)" },
  { value: "en", label: "English" },
  { value: "fr-FR", label: "French" },
  { value: "zh-CN", label: "Chinese (simplified)" },
  { value: "uk-UA", label: "Ukrainian" },
  { value: "it-IT", label: "Italian" },
  { value: "sv-SE", label: "Swedish" },
  { value: "tr-TR", label: "Turkish" },
  { value: "vi-VN", label: "Vietnamese" },
];

export const vsyncChoices: Choice<number>[] = [
  { value: 0, label: "Game / driver" },
  { value: 1, label: "Off" },
  { value: 2, label: "On" },
];

export type FlipMeteringChoice = "auto" | "on" | "off";

export const flipMeteringChoices: Choice<FlipMeteringChoice>[] = [
  { value: "auto", label: "Inherit" },
  { value: "on", label: "On" },
  { value: "off", label: "Off" },
];

export function flipMeteringChoice(value: boolean | null): FlipMeteringChoice {
  if (value === null) return "auto";
  return value ? "on" : "off";
}

export function flipMeteringValue(choice: FlipMeteringChoice): boolean | null {
  if (choice === "auto") return null;
  return choice === "on";
}

// The mod's [Keybinds] actions, in its menu order. Values are modifier
// prefixes plus a virtual-key code, empty means unbound.
export const keybindActions: { key: string; label: string }[] = [
  { key: "RaiseMultiplier", label: "Raise multiplier" },
  { key: "LowerMultiplier", label: "Lower multiplier" },
  { key: "Dynamic", label: "Dynamic mode" },
  { key: "FollowGame", label: "Follow game" },
  { key: "Off", label: "Off (1x)" },
  { key: "Mode2x", label: "Fixed 2x" },
  { key: "Mode3x", label: "Fixed 3x" },
  { key: "Mode4x", label: "Fixed 4x" },
  { key: "Mode5x", label: "Fixed 5x" },
  { key: "Mode6x", label: "Fixed 6x" },
  { key: "FpsReadout", label: "FPS readout" },
  { key: "PinPanel", label: "Pin panel" },
  { key: "DlssPresetNext", label: "Next DLSS preset" },
  { key: "DlssPresetPrevious", label: "Previous DLSS preset" },
  { key: "DlssPresetDefault", label: "Default DLSS preset" },
];

export const optiScalerUiChoices: Choice<string>[] = [
  { value: "", label: "Mod default" },
  { value: "shared", label: "Both menus" },
  { value: "rtxmfg", label: "MFG Unlocker menu" },
  { value: "optiscaler", label: "OptiScaler tab only" },
];

export const dlss5StageChoices: Choice<number>[] = [
  { value: 0, label: "Auto" },
  { value: 1, label: "Before upscaling" },
  { value: 2, label: "After upscaling" },
  { value: 3, label: "Present" },
];

export const dlss5ModelChoices: Choice<number>[] = [
  { value: 0, label: "Model A" },
  { value: 1, label: "Model B" },
  { value: 2, label: "Model C" },
];

export const xemfgRoundingChoices: Choice<number>[] = [
  { value: 0, label: "At most" },
  { value: 1, label: "Nearest" },
  { value: 2, label: "At least" },
];

export const latencyPacingChoices: Choice<number>[] = [
  { value: 0, label: "Auto" },
  { value: 1, label: "On" },
  { value: 2, label: "Off" },
];
