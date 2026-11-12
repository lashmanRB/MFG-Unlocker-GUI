import { useEffect, useRef, useState } from "react";
import { KeyRound } from "lucide-react";
import { Button } from "./Button";
import { cn } from "../lib/cn";
import { captureCombo, comboLabel } from "../lib/keycodes";

interface KeybindCaptureProps {
  value: string;
  onChange: (next: string) => void;
  id?: string;
}

export function KeybindCapture({ value, onChange, id }: KeybindCaptureProps) {
  const [listening, setListening] = useState(false);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const label = value.length === 0 ? "Not set" : comboLabel(value);

  useEffect(() => {
    if (!listening) return;

    const onKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.key === "Escape") {
        setListening(false);
        return;
      }
      const combo = captureCombo(event);
      if (combo === null) return;
      onChange(combo);
      setListening(false);
    };

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && buttonRef.current?.contains(target)) return;
      // mouse 4/5 bind as VK 5/6, same modifier prefixes as the keyboard path
      if (event.button === 3 || event.button === 4) {
        event.preventDefault();
        const parts: string[] = [];
        if (event.ctrlKey) parts.push("Ctrl");
        if (event.shiftKey) parts.push("Shift");
        if (event.altKey) parts.push("Alt");
        parts.push(event.button === 3 ? "0x05" : "0x06");
        onChange(parts.join("+"));
        setListening(false);
        return;
      }
      setListening(false);
    };

    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [listening, onChange]);

  return (
    <div className="flex items-center gap-2">
      <button
        ref={buttonRef}
        id={id}
        type="button"
        onClick={() => setListening((current) => !current)}
        className={cn(
          "mono flex h-8 min-w-0 flex-1 items-center gap-1.5 rounded-[5px] border px-2 text-left text-[12.5px] transition-colors duration-150 ease-out",
          listening
            ? "border-accent/60 bg-accent/[0.06] text-accent"
            : "border-line bg-elevated text-ink hover:border-line-strong",
        )}
      >
        <KeyRound size={12} className={listening ? "text-accent" : "text-ink-dim"} />
        <span className="truncate">{listening ? "Press a key or mouse 4/5..." : label}</span>
      </button>
      {value.length > 0 && !listening && (
        <Button size="sm" variant="ghost" onClick={() => onChange("")}>
          Clear
        </Button>
      )}
    </div>
  );
}