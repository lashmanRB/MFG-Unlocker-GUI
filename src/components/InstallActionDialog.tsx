import { Button } from "./Button";
import { Dialog } from "./Dialog";
import type { GameEntry } from "../lib/types";

export type InstallDialogMode = "undo" | "replace";

interface InstallActionDialogProps {
  mode: InstallDialogMode;
  game: GameEntry;
  targetDll: string;
  targetVersion: string | null;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

function Mono({ children }: { children: string }) {
  return <span className="mono text-[11.5px] break-all text-ink">{children}</span>;
}

export function InstallActionDialog({
  mode,
  game,
  targetDll,
  targetVersion,
  busy,
  onCancel,
  onConfirm,
}: InstallActionDialogProps) {
  const install = game.install;
  const title = mode === "undo" ? "Undo the mod install" : "Replace the installed mod";

  return (
    <Dialog
      title={title}
      onClose={busy ? () => undefined : onCancel}
      actions={
        <>
          <Button size="sm" variant="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button
            size="sm"
            variant={mode === "undo" ? "danger" : "primary"}
            onClick={onConfirm}
            loading={busy}
          >
            {mode === "undo" ? "Undo install" : "Replace"}
          </Button>
        </>
      }
    >
      {install === null ? (
        <p>This game has no mod installed.</p>
      ) : mode === "undo" ? (
        <ul className="space-y-2.5">
          <li>
            Removes <Mono>{install.dllName}</Mono> from <Mono>{game.workDir}</Mono>.
          </li>
          {install.binkBackup !== null && (
            <li>
              Restores the game's own <Mono>{install.dllName}</Mono> from its backup{" "}
              <Mono>{install.binkBackup}</Mono>.
            </li>
          )}
          {install.previous !== null && (
            <li>
              Restores the older mod build{" "}
              <Mono>{install.previous.version ?? "unknown version"}</Mono> that was kept aside.
            </li>
          )}
          <li>
            Leaves the mod's settings files (<Mono>RTXMFG-Universal.json</Mono>,{" "}
            <Mono>RTX40MFG-UI.ini</Mono>) and the log files in place.
          </li>
        </ul>
      ) : (
        <ul className="space-y-2.5">
          <li>
            Removes the current <Mono>{install.dllName}</Mono> from <Mono>{game.workDir}</Mono> and
            keeps it aside for undo.
          </li>
          <li>
            Writes <Mono>{targetDll}</Mono> in its place
            {targetVersion === null ? "." : ` (${targetVersion}).`}
          </li>
          <li>
            Leaves the mod's settings files (<Mono>RTXMFG-Universal.json</Mono>,{" "}
            <Mono>RTX40MFG-UI.ini</Mono>) and the log files in place.
          </li>
        </ul>
      )}
    </Dialog>
  );
}
