import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { Callout } from "./Callout";
import { GameRow } from "./GameRow";
import { RailSkeleton } from "./Skeletons";
import { cn } from "../lib/cn";
import type { GameEntry } from "../lib/types";

type Filter = "all" | "supported" | "installed" | "nvidia";

interface FilterOption {
  value: Filter;
  label: string;
  count: number;
}

interface LeftRailProps {
  games: GameEntry[];
  selectedId: string | null;
  loading: boolean;
  steamMissing: boolean;
  scanErrors: string[];
  onSelect: (id: string) => void;
  onAddFolder: () => void;
}

function hasMfgCeiling(game: GameEntry): boolean {
  return game.compat.nvidiaTier === 4 || game.compat.nvidiaTier === 6;
}

function matchesFilter(game: GameEntry, filter: Filter): boolean {
  if (filter === "installed") return game.install !== null;
  if (filter === "supported") {
    return game.compat.state === "supported" || game.compat.state === "likely";
  }
  if (filter === "nvidia") return hasMfgCeiling(game);
  return true;
}

export function LeftRail({
  games,
  selectedId,
  loading,
  steamMissing,
  scanErrors,
  onSelect,
  onAddFolder,
}: LeftRailProps) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const options = useMemo<FilterOption[]>(() => {
    const supported = games.filter((game) => matchesFilter(game, "supported")).length;
    const installed = games.filter((game) => matchesFilter(game, "installed")).length;
    const nvidia = games.filter((game) => matchesFilter(game, "nvidia")).length;
    return [
      { value: "all", label: "All", count: games.length },
      { value: "supported", label: "Supported", count: supported },
      { value: "installed", label: "Installed", count: installed },
      { value: "nvidia", label: "NVIDIA", count: nvidia },
    ];
  }, [games]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return games.filter((game) => {
      if (!matchesFilter(game, filter)) return false;
      if (needle.length === 0) return true;
      return (
        game.name.toLowerCase().includes(needle) ||
        game.installDir.toLowerCase().includes(needle) ||
        (game.appId !== null && String(game.appId).includes(needle))
      );
    });
  }, [games, filter, query]);

  return (
    <aside className="flex w-[312px] shrink-0 flex-col border-r border-line bg-raised max-[920px]:w-[248px]">
      <div className="flex shrink-0 flex-col gap-2 border-b border-line px-3 py-2.5">
        <div className="relative">
          <Search
            size={13}
            className="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-ink-dim"
          />
          <input
            type="text"
            value={query}
            aria-label="Search games"
            placeholder="Search games"
            spellCheck={false}
            onChange={(event) => setQuery(event.target.value)}
            className="h-8 w-full rounded-[5px] border border-line bg-elevated pr-7 pl-7 text-[12.5px] text-ink transition-colors duration-150 ease-out placeholder:text-ink-dim hover:border-line-strong"
          />
          {query.length > 0 && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => setQuery("")}
              className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded-[3px] p-0.5 text-ink-dim transition-colors duration-150 ease-out hover:bg-hover hover:text-ink"
            >
              <X size={12} />
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 gap-1 rounded-[5px] border border-line bg-base p-1">
          {options.map((option) => {
            const active = option.value === filter;
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={active}
                title={`${option.label}: ${option.count} games`}
                onClick={() => setFilter(option.value)}
                className={cn(
                  "flex h-6 items-center justify-center gap-1 rounded-[4px] text-[11.5px] font-medium transition-[background-color,color,box-shadow] duration-150 ease-out max-[920px]:gap-0.5 max-[920px]:text-[11px]",
                  active
                    ? "bg-elevated text-ink shadow-[inset_0_0_0_1px_var(--color-line-strong)]"
                    : "text-ink-dim hover:text-ink-muted",
                )}
              >
                {option.label}
                <span
                  className={cn(
                    "mono text-[10px] max-[920px]:hidden",
                    active ? "text-ink-dim" : "text-ink-dim/70",
                  )}
                >
                  {option.count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {scanErrors.length > 0 && (
          <div className="border-b border-line p-2">
            <Callout tone="warn">
              <span className="font-medium">Scan warnings</span>
              <ul className="mt-1 space-y-0.5">
                {scanErrors.slice(0, 3).map((message) => (
                  <li key={message} className="break-words">
                    {message}
                  </li>
                ))}
                {scanErrors.length > 3 && (
                  <li className="text-ink-muted">and {scanErrors.length - 3} more</li>
                )}
              </ul>
            </Callout>
          </div>
        )}

        {steamMissing && games.length > 0 && (
          <div className="border-b border-line p-2">
            <Callout tone="info">
              Steam was not found on this PC, so this list only has folders you added yourself.
            </Callout>
          </div>
        )}

        {loading ? (
          <RailSkeleton />
        ) : visible.length === 0 ? (
          <div className="px-3 py-8 text-center">
            <p className="text-[12px] text-ink-dim">
              {games.length === 0 ? "No games found yet." : "Nothing matches this filter."}
            </p>
            {games.length === 0 ? (
              <button
                type="button"
                onClick={onAddFolder}
                className="mt-2 text-[12px] text-ink-muted underline decoration-line-strong underline-offset-2 transition-colors duration-150 ease-out hover:text-ink"
              >
                Add a game folder
              </button>
            ) : (
              query.length > 0 && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="mt-2 text-[12px] text-ink-muted underline decoration-line-strong underline-offset-2 transition-colors duration-150 ease-out hover:text-ink"
                >
                  Clear search
                </button>
              )
            )}
          </div>
        ) : (
          <ul className="divide-y divide-line/60">
            {visible.map((game) => (
              <li key={game.id}>
                <GameRow game={game} selected={game.id === selectedId} onSelect={onSelect} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}
