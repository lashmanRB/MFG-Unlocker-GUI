import { Plus, RefreshCw } from "lucide-react";
import { AppMark } from "./AppMark";
import { Button } from "./Button";
import { ZoomControl } from "./ZoomControl";
import type { ZoomControls } from "../hooks/useZoom";
import type { ReleaseInfo } from "../lib/types";

interface TopBarProps {
  release: ReleaseInfo | null;
  releaseFailed: boolean;
  refreshing: boolean;
  adding: boolean;
  zoom: ZoomControls;
  onRefresh: () => void;
  onAddGame: () => void;
}

export function TopBar({
  release,
  releaseFailed,
  refreshing,
  adding,
  zoom,
  onRefresh,
  onAddGame,
}: TopBarProps) {
  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-line px-3">
      <div className="flex min-w-0 items-center gap-2.5">
        <AppMark />
        <span className="truncate text-[12.5px] font-semibold tracking-[0.08em] text-ink uppercase">
          MFG Unlocker
        </span>
      </div>

      {release !== null && (
        <span className="mono shrink-0 rounded-[3px] border border-line bg-raised px-1.5 py-0.5 text-[10.5px] leading-4 text-ink-muted">
          {release.tag}
        </span>
      )}
      {release === null && releaseFailed && (
        <span className="mono shrink-0 rounded-[3px] border border-warn/25 px-1.5 py-0.5 text-[10.5px] leading-4 text-warn/90">
          release offline
        </span>
      )}

      <div className="ml-auto flex items-center gap-2">
        <ZoomControl zoom={zoom} />
        <Button size="sm" onClick={onRefresh} loading={refreshing} icon={<RefreshCw size={12} />}>
          Refresh
        </Button>
        <Button size="sm" onClick={onAddGame} loading={adding} icon={<Plus size={13} />}>
          Add game
        </Button>
      </div>
    </header>
  );
}
