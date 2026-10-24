import { useEffect, useRef, useState } from "react";
import { KeyRound } from "lucide-react";
import { Button } from "./Button";
import { cn } from "../lib/cn";
import { captureVk, vkLabel } from "../lib/keycodes";

interface KeyCaptureProps {
  value: string;
  onChange: (key: string) => void;
  id?: string;
}

export function KeyCapture({ value, onChange, id }: KeyCaptureProps) {
  const [listening, setListening] = useState(false);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const label = value.length === 0 ? "Not set" : vkLabel(value);

  useEffect(() => {
    if (!listening) return;

    const onKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.key === "Escape") {
        setListening(false);
        return;
      }
      const code = captureVk(event);
      if (code === null) return;
      onChange(String(code));
      setListening(false);
    };

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && buttonRef.current?.contains(target)) return;
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
        <span className="truncate">{listening ? "Press a key..." : label}</span>
      </button>
      {value.length > 0 && !listening && (
        <Button size="sm" variant="ghost" onClick={() => onChange("")}>
          Clear
        </Button>
      )}
    </div>
  );
}
