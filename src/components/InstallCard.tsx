import { Download, Undo2 } from "lucide-react";
import { Button } from "./Button";
import { Callout } from "./Callout";
import { CheckboxRow, Select } from "./Controls";
import { Field } from "./Field";
import { Section } from "./Section";
import { proxyNames } from "../lib/api";
import { middleTruncate, relativeTime } from "../lib/format";
import { isBinkName } from "../lib/install";
import type { InstallControls } from "../lib/install";
import type { GameEntry, ReleaseInfo } from "../lib/types";

interface InstallCardProps {
  game: GameEntry;
  release: ReleaseInfo | null;
  controls: InstallControls;
}

function PathRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="w-[70px] shrink-0 text-[10px] whitespace-nowrap tracking-[0.04em] text-ink-dim uppercase">
        {label}
      </span>
      <span
        className="mono min-w-0 flex-1 truncate text-[11px] text-ink-muted"
        title={value}
      >
        {middleTruncate(value, 32)}
      </span>
    </div>
  );
}

export function InstallCard({ game, release, controls }: InstallCardProps) {
  const install = game.install;
  const bink = isBinkName(controls.dllName);
  const hookedName = bink ? `${controls.dllName.replace(/\.dll$/i, "")}Hooked.dll` : null;
  const updateAvailable =
    install !== null &&
    install.version !== null &&
    release !== null &&
    install.version !== release.tag;

  return (
    <Section
      title="Mod install"
      aside={
        <span className="mono text-[10.5px] text-ink-dim">
          {install === null ? "not installed" : (install.version ?? "version unknown")}
        </span>
      }
    >
      <div className="space-y-1">
        <PathRow label="Game folder" value={game.installDir} />
        <PathRow label="Mod files" value={game.workDir} />
      </div>
      {game.workDir !== game.installDir && (
        <p className="mt-1.5 text-[11px] leading-snug text-ink-dim">
          The mod's files sit beside the executable, not in the game root.
        </p>
      )}

      <div className="mt-3 rounded-[5px] border border-line bg-base/60 px-2.5 py-2">
        {install === null ? (
          <p className="text-[11.5px] leading-snug text-ink-dim">
            Not installed. The proxy DLL goes into the mod folder above.
          </p>
        ) : (
          <>
            <div className="flex items-baseline justify-between gap-2">
              <span className="mono text-[12.5px] text-ink">{install.dllName}</span>
              <span className="text-[10.5px] text-ink-dim">
                {relativeTime(install.installedAt)}
              </span>
            </div>
            <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-[10.5px] text-ink-dim">
              <span className="mono">{install.version ?? "version unknown"}</span>
              {install.binkBackup !== null && (
                <span className="mono">backup {install.binkBackup}</span>
              )}
            </div>
            {install.previous !== null && (
              <div
                className="mt-1 border-t border-line/70 pt-1 text-[10.5px] text-ink-dim"
                title={install.previous.path}
              >
                previous build kept:{" "}
                <span className="mono">{install.previous.version ?? "unknown version"}</span>
              </div>
            )}
          </>
        )}
      </div>

      {updateAvailable && install !== null && (
        <Callout tone="warn" className="mt-2">
          Update available: {install.version} is installed, {release?.tag} is the current release.
        </Callout>
      )}

      <div className="mt-3">
        <Field
          label="Proxy DLL"
          htmlFor="install-proxy"
          hint={
            bink && hookedName !== null
              ? undefined
              : "Pick a name the game does not already ship in this folder."
          }
        >
          <Select
            id="install-proxy"
            value={controls.dllName}
            onChange={controls.onDllName}
            disabled={controls.busy !== null}
          >
            {proxyNames.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </Select>
        </Field>
        {bink && hookedName !== null && (
          <p className="mt-1.5 text-[11px] leading-snug text-warn/90">
            The game's own {controls.dllName} is backed up as {hookedName} before the mod DLL is
            written.
          </p>
        )}
      </div>

      <div className="mt-2.5">
        <CheckboxRow
          checked={controls.binkBackup}
          onChange={controls.onBinkBackup}
          disabled={!bink || controls.busy !== null}
          label="Back up the original DLL"
          hint={
            bink && hookedName !== null
              ? `Keeps the game's ${controls.dllName} as ${hookedName}.`
              : "Only used with a bink proxy name."
          }
        />
      </div>

      <p className="mt-3 border-t border-line pt-2.5 text-[11px] leading-snug text-ink-dim">
        Only one copy of the mod goes into a folder, and it must not replace a DLL the game ships
        itself. The proxy name above is how you avoid that.
      </p>

      {controls.error !== null && (
        <Callout tone="danger" className="mt-2">
          {controls.error}
        </Callout>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {install === null ? (
          <Button
            size="sm"
            onClick={controls.onInstall}
            loading={controls.busy === "install"}
            icon={<Download size={12} />}
          >
            Install
          </Button>
        ) : (
          <Button
            size="sm"
            onClick={controls.onInstall}
            loading={controls.busy === "install"}
            icon={<Download size={12} />}
          >
            Update
          </Button>
        )}

        {install !== null && (
          <Button
            size="sm"
            variant="danger"
            onClick={controls.onUndo}
            loading={controls.busy === "undo"}
            disabled={controls.busy !== null}
            icon={<Undo2 size={12} />}
          >
            Undo install
          </Button>
        )}
      </div>
    </Section>
  );
}
