import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { CircleAlert, CircleCheck, Info, TriangleAlert, X } from "lucide-react";
import { cn } from "../lib/cn";

export type ToastKind = "ok" | "error" | "warn" | "info";
export type PushToast = (kind: ToastKind, message: string) => void;

interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
}

const ToastContext = createContext<PushToast | null>(null);

export function useToast(): PushToast {
  const push = useContext(ToastContext);
  if (!push) throw new Error("useToast needs a ToastProvider above it");
  return push;
}

const toastTTL = 4000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const timers = useRef<number[]>([]);

  const dismiss = useCallback((id: number) => {
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const push = useCallback<PushToast>(
    (kind, message) => {
      const id = nextId.current++;
      setItems((current) => [...current.slice(-3), { id, kind, message }]);
      timers.current.push(window.setTimeout(() => dismiss(id), toastTTL));
    },
    [dismiss],
  );

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending) window.clearTimeout(timer);
    };
  }, []);

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed right-3 bottom-10 z-50 flex w-[318px] flex-col gap-1.5">
        {items.map((item) => (
          <div
            key={item.id}
            className={cn(
              "toast-in pointer-events-auto flex items-start gap-2 rounded-md border bg-elevated px-2.5 py-2 text-[12px] leading-snug",
              item.kind === "error" ? "border-danger/40" : "border-line",
            )}
          >
            {item.kind === "ok" && <CircleCheck size={14} className="mt-px shrink-0 text-accent" />}
            {item.kind === "warn" && (
              <TriangleAlert size={14} className="mt-px shrink-0 text-warn" />
            )}
            {item.kind === "error" && (
              <CircleAlert size={14} className="mt-px shrink-0 text-danger" />
            )}
            {item.kind === "info" && <Info size={14} className="mt-px shrink-0 text-ink-muted" />}
            <span className="min-w-0 flex-1 text-ink">{item.message}</span>
            <button
              type="button"
              onClick={() => dismiss(item.id)}
              aria-label="Dismiss"
              className="-mr-1 shrink-0 rounded-[3px] p-0.5 text-ink-dim transition-colors duration-150 ease-out hover:bg-hover hover:text-ink"
            >
              <X size={12} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
