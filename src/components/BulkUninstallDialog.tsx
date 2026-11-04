import { useRef, useState } from "react";
import { api } from "../lib/api";
import { attempt } from "../lib/attempt";
import type { GameEntry } from "../lib/types";
import { Button } from "./Button";
import { Callout } from "./Callout";
import { Dialog } from "./Dialog";
import { cn } from "../lib/cn";

type Phase = "confirm" | "running" | "done";

interface Row {
  game: GameEntry;
  status: "pending" | "running" | "ok" | "failed";
  message: string | null;
}

interface BulkUninstallDialogProps {
  games: GameEntry[];
  onClose: () => void;
  onFinished: (removedIds: string[]) => void;
}

export function BulkUninstallDialog({ games, onClose, onFinished }: BulkUninstallDialogProps) {
  const [rows, setRows] = useState<Row[]>(
    games.map((game) => ({ game, status: "pending" as const, message: null })),
  );
  const [phase, setPhase] = useState<Phase>("confirm");
  const started = useRef(false);

  function setStatus(gameId: string, status: Row["status"], message: string | null) {
    setRows((current) =>
      current.map((row) => (row.game.id === gameId ? { ...row, status, message } : row)),
    );
  }

  const run = async () => {
    if (started.current) return;
    started.current = true;
    setPhase("running");
    const removed: string[] = [];
    for (const row of rows) {
      setStatus(row.game.id, "running", null);
      const response = await attempt(() => api.uninstallMod(row.game.id));
      if (response.ok) {
        removed.push(row.game.id);
        setStatus(row.game.id, "ok", "removed");
      } else {
        setStatus(row.game.id, "failed", response.message);
      }
    }
    setPhase("done");
    onFinished(removed);
  };

  const failed = rows.filter((row) => row.status === "failed");
  const removedCount = rows.filter((row) => row.status === "ok").length;

  // Undo does not always delete the mod: a build kept aside comes back instead.
  const outcome = (game: GameEntry): string => {
    const previous = game.install?.previous ?? null;
    return previous === null ? "removed" : `restored ${previous.version ?? "the previous build"}`;
  };

  return (
    <Dialog
      title={phase === "done" ? "Bulk uninstall finished" : `Remove the mod from ${rows.length} ${rows.length === 1 ? "game" : "games"}`}
      size="md"
      onClose={phase === "running" ? () => undefined : onClose}
      actions={
        phase === "confirm" ? (
          <>
            <Button size="sm" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button size="sm" variant="danger" onClick={run}>
              Undo {rows.length} install{rows.length === 1 ? "" : "s"}
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
        {phase === "confirm" && (
          <p className="text-[11.5px] leading-relaxed text-ink-muted">
            Closes on the mod files only: the DLL is removed, a game's own Bink DLL gets its name
            back, and any build kept aside for undo is restored. Settings files stay where they are.
          </p>
        )}

        {phase === "done" && (
          <Callout tone={failed.length === 0 ? "info" : "warn"}>
            {removedCount} of {rows.length} undone
            {failed.length > 0 ? `, ${failed.length} failed` : ""}.
          </Callout>
        )}

        <ul className="flex flex-col divide-y divide-line/50 overflow-hidden rounded-[5px] border border-line bg-base/40">
          {rows.map((row) => {
            const install = row.game.install;
            return (
              <li key={row.game.id} className="flex items-center gap-3 px-3 py-2">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[11.5px] text-ink">{row.game.name}</span>
                  <span className="block truncate text-[10px] text-ink-dim">
                    {install === null
                      ? "no install"
                      : `${install.dllName} ${install.version ?? "unknown version"}`}
                    {install?.previous != null
                      ? `, restores ${install.previous.version ?? "the previous build"}`
                      : install?.binkBackup != null
                        ? ", restores the game's Bink DLL"
                        : ""}
                  </span>
                </span>
                <span
                  className={cn(
                    "mono max-w-[180px] shrink-0 truncate text-[10.5px]",
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
                  {row.status === "pending" ? "" : (row.status === "ok" ? outcome(row.game) : (row.message ?? row.status))}
                </span>
              </li>
            );
          })}
        </ul>

        {phase === "confirm" && (
          <p className="text-[10.5px] text-ink-dim">
            The game has to be closed for a file to move. A game that is still running reports its
            error here and the rest carry on.
          </p>
        )}
      </div>
    </Dialog>
  );
}