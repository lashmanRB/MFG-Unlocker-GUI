import { cn } from "../lib/cn";
import type { Choice } from "../lib/options";

interface SegmentedProps<T extends string | number> {
  value: T;
  options: Choice<T>[];
  onChange: (value: T) => void;
  disabled?: boolean;
  size?: "sm" | "md";
  label?: string;
  className?: string;
}

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  disabled = false,
  size = "md",
  label,
  className,
}: SegmentedProps<T>) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn(
        "inline-flex w-full rounded-md border border-line bg-raised p-0.5",
        disabled && "opacity-45",
        className,
      )}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={String(option.value)}
            type="button"
            disabled={disabled}
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={cn(
              "flex-1 rounded-[4px] px-1.5 text-center font-medium transition-[background-color,color,box-shadow] duration-150 ease-out",
              size === "sm" ? "h-6 text-[11.5px]" : "h-7 text-[12px]",
              active
                ? "bg-elevated text-ink shadow-[inset_0_0_0_1px_var(--color-line-strong)]"
                : "text-ink-muted hover:text-ink",
              disabled && "cursor-not-allowed",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
