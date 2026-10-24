import type { ReactNode } from "react";
import { Info, TriangleAlert } from "lucide-react";
import { cn } from "../lib/cn";

type Tone = "warn" | "danger" | "info";

interface CalloutProps {
  tone?: Tone;
  children: ReactNode;
  className?: string;
  icon?: ReactNode;
}

const toneClasses: Record<Tone, string> = {
  warn: "border-warn/25 bg-warn/[0.06] text-warn",
  danger: "border-danger/30 bg-danger/[0.06] text-danger",
  info: "border-line bg-elevated text-ink-muted",
};

export function Callout({ tone = "warn", children, className, icon }: CalloutProps) {
  const fallbackIcon =
    tone === "info" ? (
      <Info size={13} className="mt-px shrink-0" />
    ) : (
      <TriangleAlert size={13} className="mt-px shrink-0" />
    );

  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-[5px] border px-2.5 py-1.5 text-[11.5px] leading-snug",
        toneClasses[tone],
        className,
      )}
    >
      {icon ?? fallbackIcon}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
