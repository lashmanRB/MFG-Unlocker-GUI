import type { ProxyOption } from "./types";

export type InstallBusy = "install" | "undo" | null;

// shared between the workspace header shortcut and the install card so both
// show the same proxy choice and the same in-flight state
export interface InstallControls {
  dllName: string;
  options: ProxyOption[];
  optionsLoading: boolean;
  optionsError: string | null;
  available: boolean;
  busy: InstallBusy;
  error: string | null;
  onDllName: (name: string) => void;
  onInstall: () => void;
  onUndo: () => void;
}
