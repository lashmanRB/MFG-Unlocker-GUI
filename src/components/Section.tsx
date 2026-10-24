import type { ReactNode } from "react";
import { cn } from "../lib/cn";

interface SectionProps {
  title: string;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}

export function Section({ title, aside, children, className, bodyClassName }: SectionProps) {
  return (
    <section
      className={cn("min-w-0 overflow-hidden rounded-md border border-line bg-raised", className)}
    >
      <header className="flex h-8 items-center justify-between gap-3 border-b border-line px-3">
        <h2 className="label text-ink-muted">{title}</h2>
        {aside}
      </header>
      <div className={cn("px-3 py-3", bodyClassName)}>{children}</div>
    </section>
  );
}
