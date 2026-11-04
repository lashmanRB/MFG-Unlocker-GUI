import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { Button } from "./Button";
import { Callout } from "./Callout";
import { ContextMenu } from "./ContextMenu";
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
  selectedIds: string[];
  loading: boolean;
  steamMissing: boolean;
  scanErrors: string[];
  onSelect: (id: string) => void;
  onToggleSelect: (id: string) => void;
  onRangeSelect: (ids: string[]) => void;
  onContextSelect: (id: string) => void;
  onClearSelection: () => void;
  onBulkInstall: (ids: string[]) => void;
  onBulkUninstall: (ids: string[]) => void;
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
  selectedIds,
  loading,
  steamMissing,
  scanErrors,
  onSelect,
  onToggleSelect,
  onRangeSelect,
  onContextSelect,
  onClearSelection,
  onBulkInstall,
  onBulkUninstall,
  onAddFolder,
}: LeftRailProps) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const scrollMemory = useRef(0);

  // Installing a game moves its row to the top of the list, which drags the
  // view along with it. Keep the rail where the user left it instead.
  useLayoutEffect(() => {
    const box = listRef.current;
    if (box !== null && box.scrollTop !== scrollMemory.current) {
      box.scrollTop = scrollMemory.current;
    }
  });

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

  const selectedGames = useMemo(
    () => games.filter((game) => selectedIds.includes(game.id)),
    [games, selectedIds],
  );
  const installTargets = selectedGames.filter((game) => game.install === null);
  const uninstallTargets = selectedGames.filter((game) => game.install !== null);

  function handleSelect(id: string, modifiers: { toggle: boolean; range: boolean }) {
    if (modifiers.toggle) {
      onToggleSelect(id);
      return;
    }
    if (modifiers.range) {
      const from = selectedId ?? id;
      const anchor = visible.findIndex((game) => game.id === from);
      const target = visible.findIndex((game) => game.id === id);
      if (anchor === -1 || target === -1) {
        onSelect(id);
        return;
      }
      const first = Math.min(anchor, target);
      const last = Math.max(anchor, target);
      onRangeSelect(visible.slice(first, last + 1).map((game) => game.id));
      return;
    }
    onSelect(id);
  }

  const menuIds = menu === null ? [] : selectedIds.includes(menu.id) ? selectedIds : [menu.id];
  const menuGames = games.filter((game) => menuIds.includes(game.id));
  const menuInstalls = menuGames.filter((game) => game.install === null).map((game) => game.id);
  const menuUninstalls = menuGames.filter((game) => game.install !== null).map((game) => game.id);

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

      {selectedIds.length > 1 && (
        <div className="flex shrink-0 items-center gap-1 border-b border-line bg-elevated/60 px-2.5 py-1.5">
          <span className="mono text-[10.5px] whitespace-nowrap text-ink-muted">
            {selectedIds.length} selected
          </span>
          <div className="ml-auto flex items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              disabled={installTargets.length === 0}
              title={installTargets.length === 0 ? "Every selected game has the mod" : undefined}
              onClick={() => onBulkInstall(installTargets.map((game) => game.id))}
            >
              Install
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={uninstallTargets.length === 0}
              title={uninstallTargets.length === 0 ? "No selected game has the mod" : undefined}
              onClick={() => onBulkUninstall(uninstallTargets.map((game) => game.id))}
            >
              Uninstall
            </Button>
            <button
              type="button"
              aria-label="Clear selection"
              title="Clear selection"
              onClick={onClearSelection}
              className="rounded-[3px] p-1 text-ink-dim transition-colors duration-150 ease-out hover:bg-hover hover:text-ink"
            >
              <X size={12} />
            </button>
          </div>
        </div>
      )}

      <div
        ref={listRef}
        onScroll={(event) => {
          scrollMemory.current = event.currentTarget.scrollTop;
        }}
        className="min-h-0 flex-1 overflow-y-auto"
      >
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
                <GameRow
                  game={game}
                  selected={game.id === selectedId}
                  checked={selectedIds.includes(game.id)}
                  onSelect={handleSelect}
                  onContextMenu={(id, point) => {
                    onContextSelect(id);
                    setMenu({ id, ...point });
                  }}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      {menu !== null && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          title={menuGames.length === 1 ? menuGames[0].name : `${menuGames.length} games`}
          onClose={() => setMenu(null)}
          items={[
            {
              label: "Install mod",
              hint: menuInstalls.length > 0 ? `+${menuInstalls.length}` : undefined,
              disabled: menuInstalls.length === 0,
              onSelect: () => onBulkInstall(menuInstalls),
            },
            {
              label: "Uninstall mod",
              hint: menuUninstalls.length > 0 ? `-${menuUninstalls.length}` : undefined,
              danger: true,
              disabled: menuUninstalls.length === 0,
              onSelect: () => onBulkUninstall(menuUninstalls),
            },
            {
              label: "Clear selection",
              disabled: selectedIds.length === 0,
              onSelect: onClearSelection,
            },
          ]}
        />
      )}
    </aside>
  );
}