import { Download, FolderOpen, Play, Undo2 } from "lucide-react";
import { Button } from "./Button";
import { GameArt } from "./GameArt";
import { StateChip } from "./StateChip";
import { formatGigabytes, middleTruncate } from "../lib/format";
import type { InstallControls } from "../lib/install";
import type { GameEntry } from "../lib/types";

interface GameHeaderProps {
  game: GameEntry;
  install: InstallControls;
  launching: boolean;
  opening: boolean;
  onLaunch: () => void;
  onOpenFolder: () => void;
}

export function GameHeader({
  game,
  install,
  launching,
  opening,
  onLaunch,
  onOpenFolder,
}: GameHeaderProps) {
  return (
    <header className="shrink-0 border-b border-line px-4 pt-3 pb-3">
      <div className="flex items-start gap-3.5">
        <GameArt
          sources={game.coverUrls}
          name={game.name}
          className="hidden aspect-[460/215] w-[176px] @md:block @3xl:w-[238px]"
          labelClassName="text-[19px]"
        />

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <h1 className="truncate text-[17px] leading-6 font-semibold tracking-[-0.01em] text-ink">
              {game.name}
            </h1>
            <StateChip state={game.compat.state} />
            {game.source === "manual" && (
              <span className="mono shrink-0 rounded-[3px] border border-line px-1.5 py-px text-[10px] tracking-[0.04em] text-ink-dim">
                manual
              </span>
            )}
          </div>

          <div className="mt-1.5 flex min-w-0 items-center gap-2 text-[12px] text-ink-dim">
            <span className="mono shrink-0">
              {game.appId === null ? "no app id" : `app ${game.appId}`}
            </span>
            <span className="h-3 w-px shrink-0 bg-line" />
            <span className="mono truncate" title={game.installDir}>
              {middleTruncate(game.installDir, 64)}
            </span>
            {game.sizeOnDisk !== null && (
              <>
                <span className="h-3 w-px shrink-0 bg-line" />
                <span className="mono shrink-0">{formatGigabytes(game.sizeOnDisk)}</span>
              </>
            )}
          </div>

          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            {game.exePath !== null && (
              <Button
                size="sm"
                variant="secondary"
                onClick={onLaunch}
                loading={launching}
                icon={<Play size={12} />}
              >
                Launch
              </Button>
            )}
            <Button
              size="sm"
              variant="secondary"
              onClick={onOpenFolder}
              loading={opening}
              icon={<FolderOpen size={12} />}
            >
              Open folder
            </Button>
            <Button
              size="sm"
              variant={game.install === null ? "primary" : "secondary"}
              onClick={install.onInstall}
              loading={install.busy === "install"}
              disabled={!install.available}
              icon={<Download size={12} />}
            >
              {game.install === null ? "Install" : "Update"}
            </Button>
            {game.install !== null && (
              <Button
                size="sm"
                variant="danger"
                onClick={install.onUndo}
                loading={install.busy === "undo"}
                disabled={install.busy !== null}
                icon={<Undo2 size={12} />}
              >
                Undo install
              </Button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
