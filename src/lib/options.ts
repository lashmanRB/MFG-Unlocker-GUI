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
