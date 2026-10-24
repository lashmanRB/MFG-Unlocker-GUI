import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { attempt } from "../lib/attempt";
import { cn } from "../lib/cn";
import { isBinkName } from "../lib/install";
import type { InstallBusy } from "../lib/install";
import type { GameEntry, ReleaseInfo } from "../lib/types";
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
  settingsEpoch: number;
  onGameUpdated: (entry: GameEntry) => void;
  onDirtyChange: (dirty: boolean) => void;
}

export function WorkspaceScreen({
  game,
  release,
  settingsEpoch,
  onGameUpdated,
  onDirtyChange,
}: WorkspaceScreenProps) {
  const toast = useToast();
  const [tab, setTab] = useState<WorkspaceTab>("overview");
  const [dllName, setDllName] = useState(game.install?.dllName ?? "winmm.dll");
  const [binkBackup, setBinkBackup] = useState(
    game.install === null ? true : game.install.binkBackup !== null,
  );
  const [busy, setBusy] = useState<InstallBusy>(null);
  const [installError, setInstallError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<InstallDialogMode | null>(null);
  const [launching, setLaunching] = useState(false);
  const [opening, setOpening] = useState(false);

  useEffect(() => {
    setDllName(game.install?.dllName ?? "winmm.dll");
    setBinkBackup(game.install === null ? true : game.install.binkBackup !== null);
    setInstallError(null);
  }, [game.id, game.install?.dllName, game.install?.binkBackup]);

  const needsReplace =
    game.install !== null &&
    (game.install.dllName !== dllName || game.install.version !== (release?.tag ?? null));

  const runInstall = async () => {
    setInstallError(null);
    setBusy("install");
    const bink = isBinkName(dllName) && binkBackup;
    const response = await attempt(() => api.installMod(game.id, dllName, bink));
    setBusy(null);
    setDialog(null);
    if (!response.ok) {
      setInstallError(response.message);
      toast("error", `Install failed: ${response.message}`);
      return;
    }
    onGameUpdated({ ...game, install: response.value });
    toast("ok", `${response.value.dllName} installed for ${game.name}`);
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
      return;
    }

    onGameUpdated(refreshed.value);
    const restored = refreshed.value.install;
    if (restored !== null) {
      toast("ok", `Older build restored: ${restored.version ?? "unknown version"}`);
    } else {
      toast("ok", `Install undone for ${game.name}`);
    }
  };

  const requestInstall = () => {
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
    binkBackup,
    busy,
    error: installError,
    onDllName: setDllName,
    onBinkBackup: setBinkBackup,
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
        <OverviewTab game={game} release={release} install={install} onGameUpdated={onGameUpdated} />
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
