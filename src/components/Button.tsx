import type { ButtonHTMLAttributes, ReactNode } from "react";
import { LoaderCircle } from "lucide-react";
import { cn } from "../lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  loading?: boolean;
}

const variantClasses: Record<Variant, string> = {
  primary: "border border-transparent bg-accent text-accent-ink hover:bg-[#5be58c]",
  secondary: "border border-line bg-raised text-ink hover:border-line-strong hover:bg-hover",
  ghost: "border border-transparent text-ink-muted hover:bg-hover hover:text-ink",
  danger: "border border-line bg-raised text-danger hover:border-danger/40 hover:bg-danger/10",
};

const sizeClasses: Record<Size, string> = {
  sm: "h-7 gap-1.5 px-2 text-[12px]",
  md: "h-8 gap-2 px-2.5 text-[12.5px]",
};

export function Button({
  variant = "secondary",
  size = "md",
  icon,
  loading = false,
  className,
  children,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      type="button"
      {...rest}
      disabled={disabled || loading}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-md font-medium whitespace-nowrap transition-[background-color,border-color,color,transform] duration-150 ease-out select-none active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45",
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
    >
      {loading ? <LoaderCircle size={size === "sm" ? 12 : 13} className="animate-spin" /> : icon}
      {children}
    </button>
  );
}
