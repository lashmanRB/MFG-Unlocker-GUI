import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { api } from "../lib/api";
import { attempt } from "../lib/attempt";
import type { AutoUpdateReport, GameEntry, ReleaseInfo } from "../lib/types";
import { Button } from "../components/Button";
import { Dialog } from "../components/Dialog";
import { FooterBar } from "../components/FooterBar";
import { LeftRail } from "../components/LeftRail";
import { TopBar } from "../components/TopBar";
import { WorkspaceSkeleton } from "../components/Skeletons";
import { useScan } from "../hooks/useScan";
import { useToast } from "../hooks/useToast";
import { useZoom } from "../hooks/useZoom";
import { NoGamesState, NoSteamState, ScanErrorState } from "./EmptyStates";
import { WorkspaceScreen } from "./WorkspaceScreen";

type PendingIntent = { kind: "select"; id: string } | { kind: "add" } | { kind: "rescan" };

// installed first, then hookable games, then the rest, so the useful ones are
// on screen without scrolling
function groupRank(game: GameEntry): number {
  if (game.install !== null) return 0;
  if (game.compat.state === "supported" || game.compat.state === "likely") return 1;
  return 2;
}

function compareGames(a: GameEntry, b: GameEntry): number {
  const rank = groupRank(a) - groupRank(b);
  if (rank !== 0) return rank;
  return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
}

export default function MainScreen() {
  const { result, phase, error, busy, rescan, addGame, updateGame } = useScan();
  const toast = useToast();
  const zoom = useZoom();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [release, setRelease] = useState<ReleaseInfo | null>(null);
  const [releaseFailed, setReleaseFailed] = useState(false);
  const [settingsDirty, setSettingsDirty] = useState(false);
  const [settingsEpoch, setSettingsEpoch] = useState(0);
  const [pending, setPending] = useState<PendingIntent | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const autoUpdateStarted = useRef(false);
  const autoUpdateBusy = useRef(false);

  const games = useMemo(
    () =>
      result === null
        ? []
        : [...result.scan.games, ...result.manual].sort(compareGames),
    [result],
  );
  const selected = games.find((game) => game.id === selectedId) ?? null;
  const scanning = busy === "scan";
  const adding = busy === "add";
  const loading = phase === "loading" && result === null;

  const applyAutoUpdate = useCallback(
    async (report: AutoUpdateReport) => {
      if (report.release !== null) {
        setRelease(report.release);
        setReleaseFailed(false);
      } else {
        setReleaseFailed(true);
      }

      if (report.updated.length > 0) {
        const refreshed = await Promise.all(
          report.updated.map((item) => attempt(() => api.rescanGame(item.gameId))),
        );
        for (const response of refreshed) {
          if (response.ok) updateGame(response.value);
        }
      }

      if (report.updated.length === 1) {
        toast("ok", `Mod updated to ${report.updated[0].to}`);
      } else if (report.updated.length > 1) {
        toast("ok", `${report.updated.length} games updated to ${report.updated[0].to}`);
      } else if (report.downloaded) {
        const tag = report.release?.tag;
        toast(
          "info",
          tag === undefined ? "Downloaded the newest MFG Unlocker build" : `Downloaded MFG Unlocker ${tag}`,
        );
      }

      if (report.failed.length > 0) {
        const first = report.failed[0];
        const extra = report.failed.length > 2 ? ` (+${report.failed.length - 1} more)` : "";
        toast("warn", `${first}${extra}`);
      }
    },
    [toast, updateGame],
  );

  const runAutoUpdate = useCallback(
    async (refresh: boolean) => {
      if (autoUpdateBusy.current) return;
      autoUpdateBusy.current = true;
      const response = await attempt(() => api.autoUpdate(refresh));
      if (response.ok) await applyAutoUpdate(response.value);
      else setReleaseFailed(true);
      autoUpdateBusy.current = false;
    },
    [applyAutoUpdate],
  );

  // release check runs once the first scan settles, so updated install entries
  // are merged into a list that already exists
  useEffect(() => {
    if (autoUpdateStarted.current) return;
    if (phase === "loading") return;
    autoUpdateStarted.current = true;
    void runAutoUpdate(true);
  }, [phase, runAutoUpdate]);

  useEffect(() => {
    setSelectedId((current) => {
      if (current !== null && games.some((game) => game.id === current)) return current;
      return games[0]?.id ?? null;
    });
  }, [games]);

  const runAdd = async () => {
    const entry = await addGame();
    if (entry !== null) setSelectedId(entry.id);
  };

  const addFolder = () => {
    if (settingsDirty) {
      setPending({ kind: "add" });
      return;
    }
    void runAdd();
  };

  const scanAndCheckReleases = useCallback(async () => {
    setRefreshing(true);
    // one button, everything: the mod release, NVIDIA's list, cover art, the list
    await rescan(true);
    await runAutoUpdate(true);
    setRefreshing(false);
  }, [rescan, runAutoUpdate]);

  const runRescan = () => {
    if (settingsDirty) {
      setPending({ kind: "rescan" });
      return;
    }
    void scanAndCheckReleases();
  };

  const selectGame = (id: string) => {
    if (id === selectedId) return;
    if (settingsDirty) {
      setPending({ kind: "select", id });
      return;
    }
    setSelectedId(id);
  };

  const discardAndContinue = () => {
    const intent = pending;
    setPending(null);
    setSettingsDirty(false);
    if (intent === null) return;
    if (intent.kind === "select") {
      setSelectedId(intent.id);
    } else if (intent.kind === "add") {
      void runAdd();
    } else {
      setSettingsEpoch((current) => current + 1);
      void scanAndCheckReleases();
    }
  };

  let pendingMessage = "";
  if (pending !== null && selected !== null) {
    if (pending.kind === "rescan") {
      pendingMessage = `Rescanning discards the unsaved settings for ${selected.name}.`;
    } else if (pending.kind === "add") {
      pendingMessage = `Adding a game and switching to it discards the unsaved settings for ${selected.name}.`;
    } else {
      const target = games.find((game) => game.id === pending.id);
      pendingMessage = `Opening ${target?.name ?? "another game"} discards the unsaved settings for ${selected.name}.`;
    }
  }

  let workspace: ReactNode;
  if (loading) {
    workspace = <WorkspaceSkeleton />;
  } else if (phase === "error") {
    workspace = (
      <ScanErrorState message={error ?? "Unknown error"} onRetry={runRescan} scanning={scanning} />
    );
  } else if (games.length === 0) {
    workspace =
      result !== null && result.scan.steamPath === null ? (
        <NoSteamState onAddFolder={addFolder} onRescan={runRescan} scanning={scanning} />
      ) : (
        <NoGamesState onAddFolder={addFolder} onRescan={runRescan} scanning={scanning} />
      );
  } else if (selected !== null) {
    workspace = (
      <WorkspaceScreen
        game={selected}
        release={release}
        nvidiaFetchedAt={result?.nvidiaFetchedAt ?? null}
        settingsEpoch={settingsEpoch}
        onGameUpdated={updateGame}
        onDirtyChange={setSettingsDirty}
      />
    );
  } else {
    workspace = (
      <div className="grid min-h-0 flex-1 place-items-center p-6">
        <p className="text-[12px] text-ink-dim">Select a game from the list to get started.</p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-base">
      <TopBar
        release={release}
        releaseFailed={releaseFailed}
        refreshing={refreshing || scanning}
        adding={adding}
        zoom={zoom}
        onRefresh={runRescan}
        onAddGame={addFolder}
      />
      <div className="flex min-h-0 flex-1">
        <LeftRail
          games={games}
          selectedId={selectedId}
          loading={loading}
          steamMissing={result !== null && result.scan.steamPath === null}
          scanErrors={result?.scan.errors ?? []}
          onSelect={selectGame}
          onAddFolder={addFolder}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <main className="flex min-h-0 flex-1 flex-col">{workspace}</main>
          <FooterBar gpu={result?.gpu ?? null} release={release} />
        </div>
      </div>

      {pending !== null && (
        <Dialog
          title="Unsaved settings"
          onClose={() => setPending(null)}
          actions={
            <>
              <Button size="sm" variant="ghost" onClick={() => setPending(null)}>
                Stay
              </Button>
              <Button size="sm" variant="danger" onClick={discardAndContinue}>
                Discard
              </Button>
            </>
          }
        >
          <p>{pendingMessage}</p>
          <p className="mt-2 text-ink-dim">
            The changes on the settings form have not been written to the mod's files yet.
          </p>
        </Dialog>
      )}
    </div>
  );
}
