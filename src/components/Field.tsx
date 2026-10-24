import type { ReactNode } from "react";
import { cn } from "../lib/cn";

interface FieldProps {
  label: string;
  htmlFor?: string;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function Field({ label, htmlFor, hint, children, className }: FieldProps) {
  return (
    <div className={cn("min-w-0", className)}>
      <label htmlFor={htmlFor} className="label mb-1.5 block text-ink-muted">
        {label}
      </label>
      {children}
      {hint !== undefined && (
        <p className="mt-1 text-[11px] leading-snug text-ink-dim">{hint}</p>
      )}
    </div>
  );
}
