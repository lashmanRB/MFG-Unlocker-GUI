import { GameArt } from "./GameArt";
import { StateChip } from "./StateChip";
import { cn } from "../lib/cn";
import { libraryLabel } from "../lib/game";
import type { GameEntry } from "../lib/types";

interface GameRowProps {
  game: GameEntry;
  selected: boolean;
  onSelect: (id: string) => void;
}

export function GameRow({ game, selected, onSelect }: GameRowProps) {
  return (
    <button
      type="button"
      onClick={() => onSelect(game.id)}
      aria-current={selected ? "true" : undefined}
      className={cn(
        "group relative flex w-full items-center gap-2.5 py-2 pr-2.5 pl-3 text-left transition-colors duration-150 ease-out",
        selected ? "bg-elevated" : "hover:bg-elevated/60",
      )}
    >
      {selected && (
        <span className="absolute inset-y-1 left-0 w-[2px] rounded-r-full bg-accent" />
      )}
      <GameArt
        sources={game.coverUrls}
        name={game.name}
        className="aspect-[460/215] w-[72px]"
        labelClassName="text-[11px]"
      />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-ink">
            {game.name}
          </span>
          {game.install !== null && (
            <span className="mono shrink-0 rounded-[2px] border border-accent/30 px-1 text-[9px] leading-[13px] tracking-[0.06em] text-accent">
              MOD
            </span>
          )}
        </span>
        <span className="mt-1 flex min-w-0 items-center gap-1.5">
          <StateChip state={game.compat.state} />
          <span className="truncate text-[10.5px] text-ink-dim max-[920px]:hidden">
            {libraryLabel(game)}
          </span>
        </span>
      </span>
    </button>
  );
}
