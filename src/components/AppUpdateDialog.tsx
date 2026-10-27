import { useState } from "react";
import { api } from "../lib/api";
import { attempt } from "../lib/attempt";
import type { AppUpdate } from "../lib/types";
import { Button } from "./Button";
import { Callout } from "./Callout";
import { Dialog } from "./Dialog";

interface AppUpdateDialogProps {
  update: AppUpdate;
  onLater: () => void;
}

// Release notes are written as markdown for the GitHub page. The dialog already
// has a heading of its own, so section headings and raw html are dropped.
function noteLines(notes: string): string[] {
  return notes
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#") && !line.startsWith("<"))
    .slice(0, 8);
}

export function AppUpdateDialog({ update, onLater }: AppUpdateDialogProps) {
  const [installing, setInstalling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lines = noteLines(update.notes);

  const install = async () => {
    setError(null);
    setInstalling(true);
    const response = await attempt(() => api.appUpdateInstall());
    // Nothing comes back on success: the window closes and the new build starts.
    if (!response.ok) {
      setInstalling(false);
      setError(response.message);
    }
  };

  return (
    <Dialog
      title={`Version ${update.latest} is out`}
      onClose={installing ? () => undefined : onLater}
      actions={
        <>
          <Button size="sm" variant="ghost" onClick={onLater} disabled={installing}>
            Later
          </Button>
          <Button size="sm" onClick={install} loading={installing}>
            Update and restart
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="divide-y divide-line/40 rounded-[5px] border border-line bg-base/40 px-3 py-1.5">
          <div className="flex items-baseline justify-between gap-4 py-1">
            <span className="text-[11px] text-ink-muted">Installed</span>
            <span className="mono text-[11.5px] text-ink-dim">{update.current}</span>
          </div>
          <div className="flex items-baseline justify-between gap-4 py-1">
            <span className="text-[11px] text-ink-muted">Available</span>
            <span className="mono text-[11.5px] text-accent">{update.latest}</span>
          </div>
        </div>

        {lines.length > 0 && (
          <div>
            <div className="label">What changed</div>
            <div className="mt-1.5 max-h-[132px] overflow-y-auto rounded-[5px] border border-line/60 bg-base/40 px-3 py-2">
              <ul className="flex flex-col gap-1">
                {lines.map((line) => (
                  <li key={line} className="text-[11.5px] leading-snug text-ink-muted">
                    {line}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        <p className="text-[11px] leading-snug text-ink-muted">
          The app closes and starts the new version on its own. Installed games, the mod and your
          settings stay untouched.
        </p>

        {error !== null && <Callout tone="danger">{error}</Callout>}
      </div>
    </Dialog>
  );
}