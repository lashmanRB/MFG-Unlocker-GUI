import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { attempt } from "../lib/attempt";
import type { GameEntry, InstallInfo, ProxyOption } from "../lib/types";
import { Button } from "./Button";
import { Callout } from "./Callout";
import { Dialog } from "./Dialog";
import { cn } from "../lib/cn";

type Phase = "names" | "running" | "done";

interface Row {
  game: GameEntry;
  names: ProxyOption[];
  choice: string;
  status: "pending" | "running" | "ok" | "failed";
  message: string | null;
}

interface BulkInstallDialogProps {
  games: GameEntry[];
  onClose: () => void;
  onFinished: (installed: { gameId: string; install: InstallInfo }[]) => void;
}

function statusText(row: Row): string {
  if (row.status === "running") return "installing";
  if (row.status === "ok") return "installed";
  if (row.status === "failed") return row.message ?? "failed";
  return row.choice === "" ? "no free proxy name" : "waiting";
}

export function BulkInstallDialog({ games, onClose, onFinished }: BulkInstallDialogProps) {
  const [rows, setRows] = useState<Row[]>(
    games.map((game) => ({
      game,
      names: [],
      choice: "",
      status: "pending" as const,
      message: null,
    })),
  );
  const [loading, setLoading] = useState(true);
  const [phase, setPhase] = useState<Phase>("names");
  const listed = games.map((game) => game.id).join("|");
  const latestGames = useRef(games);
  latestGames.current = games;

  // The proxy name that actually loads depends on the game, so each row asks
  // for its own list from the game folder.
  useEffect(() => {
    let alive = true;
    const list = listed.length === 0 ? [] : listed.split("|");
    void (async () => {
      const loaded = await Promise.all(
        list.map(async (gameId): Promise<Row | null> => {
          const game = latestGames.current.find((candidate) => candidate.id === gameId);
          if (game === undefined) return null;
          const response = await attempt(() => api.proxyNames(game.id));
          const names = response.ok ? response.value : [];
          return {
            game,
            names,
            choice: names[0]?.name ?? "",
            status: "pending",
            message: response.ok ? null : response.message,
          };
        }),
      );
      if (!alive) return;
      setRows(loaded.filter((row): row is Row => row !== null));
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [listed]);

  function setChoice(gameId: string, choice: string) {
    setRows((current) =>
      current.map((row) => (row.game.id === gameId ? { ...row, choice } : row)),
    );
  }

  function setStatus(gameId: string, status: Row["status"], message: string | null) {
    setRows((current) =>
      current.map((row) => (row.game.id === gameId ? { ...row, status, message } : row)),
    );
  }

  const run = async () => {
    setPhase("running");
    const installed: { gameId: string; install: InstallInfo }[] = [];
    for (const row of rows) {
      if (row.choice === "") {
        setStatus(row.game.id, "failed", "no free proxy name");
        continue;
      }
      setStatus(row.game.id, "running", null);
      const response = await attempt(() => api.installMod(row.game.id, row.choice));
      if (response.ok) {
        installed.push({ gameId: row.game.id, install: response.value });
        setStatus(row.game.id, "ok", response.value.dllName);
      } else {
        setStatus(row.game.id, "failed", response.message);
      }
    }
    setPhase("done");
    onFinished(installed);
  };

  const ready = rows.filter((row) => row.choice !== "").length;
  const failed = rows.filter((row) => row.status === "failed");
  const installedCount = rows.filter((row) => row.status === "ok").length;

  return (
    <Dialog
      title={phase === "done" ? "Bulk install finished" : `Install the mod in ${rows.length} ${rows.length === 1 ? "game" : "games"}`}
      size="md"
      onClose={phase === "running" ? () => undefined : onClose}
      actions={
        phase === "names" ? (
          <>
            <Button size="sm" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button size="sm" loading={false} disabled={loading || ready === 0} onClick={run}>
              Install {ready}
            </Button>
          </>
        ) : phase === "running" ? (
          <Button size="sm" disabled>
            Working
          </Button>
        ) : (
          <Button size="sm" onClick={onClose}>
            Close
          </Button>
        )
      }
    >
      <div className="flex flex-col gap-3">
        {phase === "names" && (
          <p className="text-[11.5px] leading-relaxed text-ink-muted">
            A game only loads the mod under a name it asks Windows for, so every row picks the first
            free one. Change a name only when the game already loads something else.
          </p>
        )}

        {phase === "done" && (
          <Callout tone={failed.length === 0 ? "info" : "warn"}>
            {installedCount} of {rows.length} installed
            {failed.length > 0 ? `, ${failed.length} failed` : ""}.
          </Callout>
        )}

        {loading ? (
          <p className="text-[11.5px] text-ink-dim">Reading the game folders...</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line/50 overflow-hidden rounded-[5px] border border-line bg-base/40">
            {rows.map((row) => (
              <li key={row.game.id} className="flex items-center gap-3 px-3 py-2">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[11.5px] text-ink">{row.game.name}</span>
                  {row.message !== null && row.names.length === 0 && (
                    <span className="mt-0.5 block truncate text-[10px] text-danger">
                      {row.message}
                    </span>
                  )}
                </span>
                {phase === "names" ? (
                  row.names.length > 0 ? (
                    <select
                      value={row.choice}
                      aria-label={`Proxy name for ${row.game.name}`}
                      onChange={(event) => setChoice(row.game.id, event.target.value)}
                      className="h-7 w-[150px] shrink-0 rounded-[4px] border border-line bg-elevated px-1.5 text-[11px] text-ink"
                    >
                      {row.names.map((name) => (
                        <option key={name.name} value={name.name}>
                          {name.name}
                          {name.state === "free" ? "" : name.state === "ours" ? " (ours)" : " (bink)"}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="text-[10.5px] text-danger">no free proxy name</span>
                  )
                ) : (
                  <span
                    className={cn(
                      "mono max-w-[220px] truncate text-[10.5px]",
                      row.status === "ok"
                        ? "text-accent"
                        : row.status === "failed"
                          ? "text-danger"
                          : row.status === "running"
                            ? "text-ink-muted"
                            : "text-ink-dim",
                    )}
                    title={row.message ?? undefined}
                  >
                    {statusText(row)}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}

        {phase === "names" && (
          <p className="text-[10.5px] text-ink-dim">
            Games that already have the mod are not in this list, and a game missing a free proxy
            name is skipped.
          </p>
        )}
      </div>
    </Dialog>
  );
}