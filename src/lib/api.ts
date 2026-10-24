import { invoke } from "@tauri-apps/api/core";
import type {
  ApplyResult,
  AutoUpdateReport,
  GameEntry,
  GameSettings,
  InstallInfo,
  LogFile,
  ReleaseInfo,
  ScanResult,
  StatusSummary,
} from "./types";
import { mock } from "./mock";

export const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export const api = {
  scanAll: (): Promise<ScanResult> => (isTauri ? invoke<ScanResult>("scan_all") : mock.scanAll()),

  rescanGame: (gameId: string): Promise<GameEntry> =>
    isTauri ? invoke<GameEntry>("rescan_game", { gameId }) : mock.rescanGame(gameId),

  addManualGame: (path: string): Promise<GameEntry> =>
    isTauri ? invoke<GameEntry>("add_manual_game", { path }) : mock.addManualGame(path),

  forgetGame: (gameId: string): Promise<void> =>
    isTauri ? invoke<void>("forget_game", { gameId }) : mock.forgetGame(gameId),

  setGameExe: (gameId: string, exePath: string): Promise<GameEntry> =>
    isTauri
      ? invoke<GameEntry>("set_game_exe", { gameId, exePath })
      : mock.setGameExe(gameId, exePath),

  installMod: (gameId: string, dllName: string, bink: boolean): Promise<InstallInfo> =>
    isTauri
      ? invoke<InstallInfo>("install_mod", { gameId, dllName, bink })
      : mock.installMod(gameId, dllName, bink),

  uninstallMod: (gameId: string): Promise<void> =>
    isTauri ? invoke<void>("uninstall_mod", { gameId }) : mock.uninstallMod(gameId),

  releaseInfo: (refresh: boolean): Promise<ReleaseInfo> =>
    isTauri ? invoke<ReleaseInfo>("release_info", { refresh }) : mock.releaseInfo(refresh),

  autoUpdate: (refresh: boolean): Promise<AutoUpdateReport> =>
    isTauri ? invoke<AutoUpdateReport>("auto_update", { refresh }) : mock.autoUpdate(refresh),

  readSettings: (gameId: string): Promise<GameSettings> =>
    isTauri ? invoke<GameSettings>("read_settings", { gameId }) : mock.readSettings(gameId),

  writeSettings: (gameId: string, settings: GameSettings): Promise<ApplyResult> =>
    isTauri
      ? invoke<ApplyResult>("write_settings", { gameId, settings })
      : mock.writeSettings(gameId, settings),

  readStatus: (gameId: string): Promise<StatusSummary | null> =>
    isTauri ? invoke<StatusSummary | null>("read_status", { gameId }) : mock.readStatus(gameId),

  listLogs: (gameId: string): Promise<LogFile[]> =>
    isTauri ? invoke<LogFile[]>("list_logs", { gameId }) : mock.listLogs(gameId),

  readLog: (path: string, maxBytes?: number): Promise<string> =>
    isTauri ? invoke<string>("read_log", { path, maxBytes }) : mock.readLog(path),

  launchGame: (gameId: string): Promise<void> =>
    isTauri ? invoke<void>("launch_game", { gameId }) : mock.launchGame(gameId),

  openPath: (path: string): Promise<void> =>
    isTauri ? invoke<void>("open_path", { path }) : mock.openPath(path),
};

export const proxyNames = [
  "version.dll",
  "dinput8.dll",
  "winmm.dll",
  "d3d9.dll",
  "d3d10.dll",
  "d3d11.dll",
  "d3d12.dll",
  "dxgi.dll",
  "dsound.dll",
  "wininet.dll",
  "winhttp.dll",
  "binkw64.dll",
  "bink2w64.dll",
  "xinput1_1.dll",
  "xinput1_2.dll",
  "xinput1_3.dll",
  "xinput1_4.dll",
  "xinput9_1_0.dll",
  "xinputuap.dll",
];

export const binkNames = ["binkw64.dll", "bink2w64.dll"];
