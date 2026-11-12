import { keybindActions } from "../lib/options";
import { ToggleField } from "./Controls";
import { KeybindCapture } from "./KeybindCapture";
import { Section } from "./Section";

interface KeybindsTabProps {
  keybinds: Record<string, string>;
  showNote: boolean;
  onKeybinds: (next: Record<string, string>) => void;
  onShowNote: (next: boolean) => void;
}

export function KeybindsTab({ keybinds, showNote, onKeybinds, onShowNote }: KeybindsTabProps) {
  function setBinding(key: string, combo: string) {
    const next = { ...keybinds };
    if (combo.length === 0) delete next[key];
    else next[key] = combo;
    onKeybinds(next);
  }

  return (
    <Section title="Keybinds">
      <p className="mb-3 text-[11px] leading-snug text-ink-dim">
        Keys apply in the mod's own menu. Unbound actions stay unbound.
      </p>
      <div className="grid gap-x-5 gap-y-2.5 @2xl:grid-cols-2">
        {keybindActions.map((action) => (
          <div key={action.key} className="flex items-center justify-between gap-3">
            <span className="shrink-0 text-[12.5px] text-ink">{action.label}</span>
            <div className="min-w-0 flex-1">
              <KeybindCapture
                value={keybinds[action.key] ?? ""}
                onChange={(combo) => setBinding(action.key, combo)}
              />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4">
        <ToggleField
          label="Show on-screen note"
          checked={showNote}
          onChange={onShowNote}
        />
      </div>
    </Section>
  );
}