import { invoke } from "@tauri-apps/api/core";
import type {
  ApplyResult,
  AutoUpdateReport,
  GameEntry,
  GameSettings,
  InstallInfo,
  LogFile,
  ProxyOption,
  ReleaseInfo,
  ScanResult,
  StatusSummary,
} from "./types";
import { mock } from "./mock";

export const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export const api = {
  scanAll: (force = false): Promise<ScanResult> =>
    isTauri ? invoke<ScanResult>("scan_all", { force }) : mock.scanAll(),

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

  proxyNames: (gameId: string): Promise<ProxyOption[]> =>
    isTauri ? invoke<ProxyOption[]>("proxy_names", { gameId }) : mock.proxyNames(gameId),

  installMod: (gameId: string, dllName: string): Promise<InstallInfo> =>
    isTauri
      ? invoke<InstallInfo>("install_mod", { gameId, dllName })
      : mock.installMod(gameId, dllName),

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
