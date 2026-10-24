import { binkNames } from "./api";

export function isBinkName(name: string): boolean {
  return binkNames.includes(name);
}

export type InstallBusy = "install" | "undo" | null;

// shared between the workspace header shortcuts and the install card so both
// show the same proxy choice and the same in-flight state
export interface InstallControls {
  dllName: string;
  binkBackup: boolean;
  busy: InstallBusy;
  error: string | null;
  onDllName: (name: string) => void;
  onBinkBackup: (enabled: boolean) => void;
  onInstall: () => void;
  onUndo: () => void;
}
