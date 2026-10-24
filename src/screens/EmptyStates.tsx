import type { ReactNode } from "react";
import { FolderOpen, HardDrive, TriangleAlert } from "lucide-react";
import { Button } from "../components/Button";

interface EmptyFrameProps {
  icon: ReactNode;
  title: string;
  children: ReactNode;
  actions: ReactNode;
}

function EmptyFrame({ icon, title, children, actions }: EmptyFrameProps) {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center p-6">
      <div className="w-full max-w-[440px]">
        <div className="mb-3 grid size-9 place-items-center rounded-md border border-line bg-raised text-ink-muted">
          {icon}
        </div>
        <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-ink">{title}</h2>
        <div className="mt-1.5 space-y-1.5 text-[12px] leading-relaxed text-ink-muted">{children}</div>
        <div className="mt-4 flex flex-wrap items-center gap-2">{actions}</div>
      </div>
    </div>
  );
}

export function NoSteamState({
  onAddFolder,
  onRescan,
  scanning,
}: {
  onAddFolder: () => void;
  onRescan: () => void;
  scanning: boolean;
}) {
  return (
    <EmptyFrame
      icon={<HardDrive size={17} />}
      title="Steam not found"
      actions={
        <>
          <Button variant="primary" size="sm" onClick={onAddFolder} icon={<FolderOpen size={12} />}>
            Add game folder
          </Button>
          <Button size="sm" variant="ghost" onClick={onRescan} loading={scanning}>
            Rescan
          </Button>
        </>
      }
    >
      <p>
        No Steam installation turned up in the usual places, so there is nothing to list. You can
        still point the app at a game by hand.
      </p>
      <p className="text-ink-dim">
        Pick the folder that holds the game executable, for example
        <span className="mono"> D:\Games\Trepang2 </span>
        or an Unreal <span className="mono">Binaries\Win64</span> folder.
      </p>
    </EmptyFrame>
  );
}

export function NoGamesState({
  onAddFolder,
  onRescan,
  scanning,
}: {
  onAddFolder: () => void;
  onRescan: () => void;
  scanning: boolean;
}) {
  return (
    <EmptyFrame
      icon={<FolderOpen size={17} />}
      title="No games installed"
      actions={
        <>
          <Button variant="primary" size="sm" onClick={onAddFolder} icon={<FolderOpen size={12} />}>
            Add game folder
          </Button>
          <Button size="sm" variant="ghost" onClick={onRescan} loading={scanning}>
            Rescan
          </Button>
        </>
      }
    >
      <p>
        Steam is installed, but none of its libraries contain a game manifest yet. Install a game
        through Steam and rescan, or add a folder by hand.
      </p>
    </EmptyFrame>
  );
}

export function ScanErrorState({
  message,
  onRetry,
  scanning,
}: {
  message: string;
  onRetry: () => void;
  scanning: boolean;
}) {
  return (
    <EmptyFrame
      icon={<TriangleAlert size={17} />}
      title="Scan failed"
      actions={
        <Button variant="primary" size="sm" onClick={onRetry} loading={scanning}>
          Try again
        </Button>
      }
    >
      <p>The app could not read the Steam libraries.</p>
      <p className="mono break-words text-ink-dim">{message}</p>
    </EmptyFrame>
  );
}
