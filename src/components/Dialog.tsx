import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { X } from "lucide-react";

interface DialogProps {
  title: string;
  children: ReactNode;
  actions: ReactNode;
  onClose: () => void;
}

export function Dialog({ title, children, actions, onClose }: DialogProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;

      const panel = panelRef.current;
      if (panel === null) return;
      const focusables = panel.querySelectorAll<HTMLElement>(
        "button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex='-1'])",
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    panelRef.current?.focus();
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-base/85" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="relative flex w-full max-w-[470px] flex-col rounded-md border border-line-strong bg-elevated outline-none"
      >
        <header className="flex h-10 shrink-0 items-center justify-between gap-3 border-b border-line px-3.5">
          <h2 className="text-[13px] font-semibold tracking-[-0.01em] text-ink">{title}</h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="-mr-1 rounded-[3px] p-1 text-ink-dim transition-colors duration-150 ease-out hover:bg-hover hover:text-ink"
          >
            <X size={13} />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-3.5 py-3 text-[12px] leading-relaxed text-ink-muted">
          {children}
        </div>
        <footer className="flex shrink-0 justify-end gap-2 border-t border-line px-3.5 py-2.5">
          {actions}
        </footer>
      </div>
    </div>
  );
}
