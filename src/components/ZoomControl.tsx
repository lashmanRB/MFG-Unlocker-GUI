import { useEffect, useRef, useState } from "react";
import { Check, Minus, Plus } from "lucide-react";
import { cn } from "../lib/cn";
import { zoomMax, zoomMin } from "../hooks/useZoom";
import type { ZoomControls } from "../hooks/useZoom";

const presets = [0.8, 0.9, 1, 1.1, 1.25, 1.5];

export function ZoomControl({ zoom }: { zoom: ZoomControls }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const percent = Math.round(zoom.factor * 100);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && rootRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const buttonClass =
    "grid h-full w-6 place-items-center text-ink-muted transition-colors duration-150 ease-out hover:bg-hover hover:text-ink disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent";

  return (
    <div
      ref={rootRef}
      className="relative"
      title={zoom.enabled ? `UI zoom ${percent}%` : "UI zoom applies in the desktop app"}
    >
      <div className="flex h-7 items-center rounded-[5px] border border-line bg-raised">
        <button
          type="button"
          aria-label="Zoom out"
          disabled={!zoom.enabled || zoom.factor <= zoomMin}
          onClick={() => zoom.step(-0.05)}
          className={cn(buttonClass, "rounded-l-[4px]")}
        >
          <Minus size={11} />
        </button>
        <button
          type="button"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label={`Zoom level ${percent} percent`}
          disabled={!zoom.enabled}
          onClick={() => setOpen((current) => !current)}
          className="mono h-full min-w-[42px] border-x border-line px-1 text-[10.5px] text-ink-muted transition-colors duration-150 ease-out hover:bg-hover hover:text-ink disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
        >
          {percent}%
        </button>
        <button
          type="button"
          aria-label="Zoom in"
          disabled={!zoom.enabled || zoom.factor >= zoomMax}
          onClick={() => zoom.step(0.05)}
          className={cn(buttonClass, "rounded-r-[4px]")}
        >
          <Plus size={11} />
        </button>
      </div>

      {open && zoom.enabled && (
        <div className="absolute top-full right-0 z-30 mt-1 w-[128px] rounded-md border border-line bg-elevated p-1">
          {presets.map((value) => {
            const active = Math.abs(zoom.factor - value) < 0.001;
            return (
              <button
                key={value}
                type="button"
                onClick={() => {
                  zoom.set(value);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center justify-between rounded-[3px] px-2 py-1 text-[11.5px] transition-colors duration-150 ease-out hover:bg-hover",
                  active ? "text-ink" : "text-ink-muted",
                )}
              >
                <span className="mono">{Math.round(value * 100)}%</span>
                {active && <Check size={11} className="text-accent" />}
              </button>
            );
          })}
          <div className="my-1 h-px bg-line" />
          <button
            type="button"
            onClick={() => {
              zoom.reset();
              setOpen(false);
            }}
            className="w-full rounded-[3px] px-2 py-1 text-left text-[11.5px] text-ink-muted transition-colors duration-150 ease-out hover:bg-hover hover:text-ink"
          >
            Reset
          </button>
        </div>
      )}
    </div>
  );
}
