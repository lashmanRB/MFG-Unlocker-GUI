import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { attempt } from "../lib/attempt";
import { cn } from "../lib/cn";
import type { InstallBusy } from "../lib/install";
import type { GameEntry, ProxyOption, ReleaseInfo } from "../lib/types";
import { GameHeader } from "../components/GameHeader";
import { InstallActionDialog } from "../components/InstallActionDialog";
import type { InstallDialogMode } from "../components/InstallActionDialog";
import { TabBar } from "../components/TabBar";
import type { WorkspaceTab } from "../components/TabBar";
import { useToast } from "../hooks/useToast";
import { DiagnosticsTab } from "./DiagnosticsTab";
import { OverviewTab } from "./OverviewTab";
import { SettingsTab } from "./SettingsTab";

interface WorkspaceScreenProps {
  game: GameEntry;
  release: ReleaseInfo | null;
  nvidiaFetchedAt: number | null;
  settingsEpoch: number;
  onGameUpdated: (entry: GameEntry) => void;
  onDirtyChange: (dirty: boolean) => void;
  onRefreshNvidia: () => Promise<void>;
}

export function WorkspaceScreen({
  game,
  release,
  nvidiaFetchedAt,
  settingsEpoch,
  onGameUpdated,
  onDirtyChange,
  onRefreshNvidia,
}: WorkspaceScreenProps) {
  const toast = useToast();
  const [tab, setTab] = useState<WorkspaceTab>("overview");
  const [dllName, setDllName] = useState(game.install?.dllName ?? "");
  const [options, setOptions] = useState<ProxyOption[]>([]);
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [optionsError, setOptionsError] = useState<string | null>(null);
  const [busy, setBusy] = useState<InstallBusy>(null);
  const [installError, setInstallError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<InstallDialogMode | null>(null);
  const [launching, setLaunching] = useState(false);
  const [opening, setOpening] = useState(false);
  const optionsTicket = useRef(0);

  const loadProxyOptions = useCallback(async () => {
    const ticket = optionsTicket.current + 1;
    optionsTicket.current = ticket;
    setOptionsLoading(true);
    setOptionsError(null);
    const response = await attempt(() => api.proxyNames(game.id));
    if (optionsTicket.current !== ticket) return;
    setOptionsLoading(false);
    if (!response.ok) {
      setOptions([]);
      setDllName("");
      setOptionsError(response.message);
      return;
    }
    setOptions(response.value);
    setDllName((current) =>
      response.value.some((option) => option.name === current)
        ? current
        : (response.value[0]?.name ?? ""),
    );
  }, [game.id]);

  useEffect(() => {
    setDllName(game.install?.dllName ?? "");
    setInstallError(null);
  }, [game.id]);

  useEffect(() => {
    void loadProxyOptions();
  }, [loadProxyOptions]);

  const available = !optionsLoading && optionsError === null && options.length > 0;
  const needsReplace =
    game.install !== null &&
    (game.install.dllName !== dllName || game.install.version !== (release?.tag ?? null));

  const runInstall = async () => {
    if (!available) return;
    setInstallError(null);
    setBusy("install");
    const response = await attempt(() => api.installMod(game.id, dllName));
    setBusy(null);
    setDialog(null);
    if (!response.ok) {
      setInstallError(response.message);
      toast("error", `Install failed: ${response.message}`);
      return;
    }
    onGameUpdated({ ...game, install: response.value });
    toast("ok", `${response.value.dllName} installed for ${game.name}`);
    void loadProxyOptions();
  };

  const runUndo = async () => {
    setInstallError(null);
    setBusy("undo");
    const response = await attempt(() => api.uninstallMod(game.id));
    if (!response.ok) {
      setBusy(null);
      setDialog(null);
      setInstallError(response.message);
      toast("error", `Undo failed: ${response.message}`);
      return;
    }

    const refreshed = await attempt(() => api.rescanGame(game.id));
    setBusy(null);
    setDialog(null);

    if (!refreshed.ok) {
      onGameUpdated({ ...game, install: null });
      setInstallError(`The mod was removed, but the folder could not be read again: ${refreshed.message}`);
      toast("warn", "Mod removed, but the game folder could not be re-read");
      void loadProxyOptions();
      return;
    }

    onGameUpdated(refreshed.value);
    void loadProxyOptions();
    const restored = refreshed.value.install;
    if (restored !== null) {
      toast("ok", `Older build restored: ${restored.version ?? "unknown version"}`);
    } else {
      toast("ok", `Install undone for ${game.name}`);
    }
  };

  const requestInstall = () => {
    if (!available) return;
    if (needsReplace) {
      setDialog("replace");
      return;
    }
    void runInstall();
  };

  const requestUndo = () => {
    if (game.install === null) return;
    setDialog("undo");
  };

  const launch = async () => {
    setLaunching(true);
    const response = await attempt(() => api.launchGame(game.id));
    setLaunching(false);
    if (!response.ok) toast("error", `Could not launch the game: ${response.message}`);
  };

  const openFolder = async () => {
    setOpening(true);
    const response = await attempt(() => api.openPath(game.installDir));
    setOpening(false);
    if (!response.ok) toast("error", `Could not open the folder: ${response.message}`);
  };

  const install = {
    dllName,
    options,
    optionsLoading,
    optionsError,
    available,
    busy,
    error: installError,
    onDllName: setDllName,
    onInstall: requestInstall,
    onUndo: requestUndo,
  };

  return (
    <div className="@container flex min-h-0 flex-1 flex-col">
      <GameHeader
        game={game}
        install={install}
        launching={launching}
        opening={opening}
        onLaunch={() => void launch()}
        onOpenFolder={() => void openFolder()}
      />
      <TabBar active={tab} onChange={setTab} />

      <div
        className={cn("min-h-0 flex-1", tab === "overview" ? "block overflow-y-auto" : "hidden")}
      >
        <OverviewTab
          game={game}
          release={release}
          nvidiaFetchedAt={nvidiaFetchedAt}
          install={install}
          onGameUpdated={onGameUpdated}
          onRefreshNvidia={onRefreshNvidia}
        />
      </div>

      <div
        className={cn("min-h-0 flex-1 flex-col", tab === "settings" ? "flex" : "hidden")}
      >
        <SettingsTab
          key={`${game.id}:${settingsEpoch}`}
          gameId={game.id}
          onDirtyChange={onDirtyChange}
        />
      </div>

      <div
        className={cn("min-h-0 flex-1", tab === "diagnostics" ? "block overflow-y-auto" : "hidden")}
      >
        <DiagnosticsTab game={game} active={tab === "diagnostics"} />
      </div>

      {dialog !== null && (
        <InstallActionDialog
          mode={dialog}
          game={game}
          targetDll={dllName}
          targetVersion={release?.tag ?? null}
          busy={busy !== null}
          onCancel={() => setDialog(null)}
          onConfirm={() => {
            if (dialog === "undo") void runUndo();
            else void runInstall();
          }}
        />
      )}
    </div>
  );
}
