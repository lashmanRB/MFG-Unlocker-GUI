import { useEffect, useRef } from "react";
import { cn } from "../lib/cn";

export interface ContextMenuItem {
  label: string;
  hint?: string;
  danger?: boolean;
  disabled?: boolean;
  onSelect: () => void;
}

interface ContextMenuProps {
  x: number;
  y: number;
  title?: string;
  items: ContextMenuItem[];
  onClose: () => void;
}

const WIDTH = 232;

export function ContextMenu({ x, y, title, items, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = () => onClose();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("mousedown", close);
    window.addEventListener("blur", close);
    window.addEventListener("resize", close);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("blur", close);
      window.removeEventListener("resize", close);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  const height = (title === undefined ? 8 : 34) + items.length * 32 + 16;
  const left = Math.max(8, Math.min(x, window.innerWidth - WIDTH - 8));
  const top = Math.max(8, Math.min(y, window.innerHeight - height - 8));

  return (
    <div
      ref={ref}
      role="menu"
      aria-label={title ?? "Actions"}
      style={{ left, top, width: WIDTH }}
      onMouseDown={(event) => event.stopPropagation()}
      className="fixed z-50 overflow-hidden rounded-[5px] border border-line-strong bg-elevated py-1 shadow-[0_12px_32px_-8px_rgba(0,0,0,0.7)]"
    >
      {title !== undefined && (
        <div className="truncate px-2.5 pt-1 pb-1.5 text-[10px] tracking-[0.04em] text-ink-dim uppercase">
          {title}
        </div>
      )}
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          role="menuitem"
          disabled={item.disabled}
          onClick={() => {
            onClose();
            item.onSelect();
          }}
          className={cn(
            "flex w-full items-baseline justify-between gap-3 px-2.5 py-1.5 text-left text-[11.5px] transition-colors duration-150 ease-out",
            item.disabled
              ? "cursor-not-allowed text-ink-dim/60"
              : item.danger
                ? "text-danger hover:bg-danger/10"
                : "text-ink hover:bg-hover",
          )}
        >
          <span>{item.label}</span>
          {item.hint !== undefined && (
            <span className="mono text-[10px] text-ink-dim">{item.hint}</span>
          )}
        </button>
      ))}
    </div>
  );
}