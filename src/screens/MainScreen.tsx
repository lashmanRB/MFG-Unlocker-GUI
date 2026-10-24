import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { api } from "../lib/api";
import { attempt } from "../lib/attempt";
import type { GameEntry, ReleaseInfo } from "../lib/types";
import { Button } from "../components/Button";
import { Dialog } from "../components/Dialog";
import { FooterBar } from "../components/FooterBar";
import { LeftRail } from "../components/LeftRail";
import { TopBar } from "../components/TopBar";
import { WorkspaceSkeleton } from "../components/Skeletons";
import { useScan } from "../hooks/useScan";
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
  const zoom = useZoom();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [release, setRelease] = useState<ReleaseInfo | null>(null);
  const [releaseFailed, setReleaseFailed] = useState(false);
  const [settingsDirty, setSettingsDirty] = useState(false);
  const [settingsEpoch, setSettingsEpoch] = useState(0);
  const [pending, setPending] = useState<PendingIntent | null>(null);

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

  useEffect(() => {
    let alive = true;
    void attempt(() => api.releaseInfo(false)).then((response) => {
      if (!alive) return;
      if (response.ok) setRelease(response.value);
      else setReleaseFailed(true);
    });
    return () => {
      alive = false;
    };
  }, []);

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

  const runRescan = () => {
    if (settingsDirty) {
      setPending({ kind: "rescan" });
      return;
    }
    void rescan();
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
      void rescan();
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
        scanning={scanning}
        adding={adding}
        zoom={zoom}
        onRescan={runRescan}
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
