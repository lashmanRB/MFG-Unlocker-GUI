import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "../lib/cn";
import type { Choice } from "../lib/options";

const inputBase =
  "h-8 w-full rounded-[5px] border border-line bg-elevated px-2 text-[12.5px] text-ink placeholder:text-ink-dim transition-colors duration-150 ease-out hover:border-line-strong disabled:opacity-45";

interface SelectProps {
  value: string | number;
  onChange: (value: string) => void;
  children: ReactNode;
  id?: string;
  disabled?: boolean;
  className?: string;
}

export function Select({ value, onChange, children, id, disabled, className }: SelectProps) {
  return (
    <div className={cn("relative min-w-0", className)}>
      <select
        id={id}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className={cn(inputBase, "cursor-pointer appearance-none pr-7")}
      >
        {children}
      </select>
      <ChevronDown
        size={13}
        className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-ink-dim"
      />
    </div>
  );
}

interface TextInputProps {
  value: string;
  onChange: (value: string) => void;
  id?: string;
  placeholder?: string;
  disabled?: boolean;
  mono?: boolean;
  className?: string;
}

export function TextInput({
  value,
  onChange,
  id,
  placeholder,
  disabled,
  mono = false,
  className,
}: TextInputProps) {
  return (
    <input
      id={id}
      type="text"
      value={value}
      disabled={disabled}
      placeholder={placeholder}
      spellCheck={false}
      onChange={(event) => onChange(event.target.value)}
      className={cn(inputBase, mono && "mono", className)}
    />
  );
}

interface NumberInputProps {
  value: number;
  onChange: (value: number) => void;
  id?: string;
  min: number;
  max: number;
  disabled?: boolean;
  className?: string;
}

export function NumberInput({ value, onChange, id, min, max, disabled, className }: NumberInputProps) {
  const [draft, setDraft] = useState(String(value));

  useEffect(() => {
    if (Number.parseInt(draft, 10) !== value) setDraft(String(value));
  }, [value, draft]);

  return (
    <input
      id={id}
      type="number"
      inputMode="numeric"
      value={draft}
      min={min}
      max={max}
      step={1}
      disabled={disabled}
      onChange={(event) => {
        const next = event.target.value;
        setDraft(next);
        const parsed = Number.parseInt(next, 10);
        if (Number.isFinite(parsed) && parsed >= min && parsed <= max) onChange(parsed);
      }}
      onBlur={() => setDraft(String(value))}
      className={cn(inputBase, "mono tabular-nums", className)}
    />
  );
}

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  id?: string;
  disabled?: boolean;
  label: string;
}

export function Toggle({ checked, onChange, id, disabled, label }: ToggleProps) {
  return (
    <button
      type="button"
      id={id}
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative mt-0.5 h-[18px] w-[32px] shrink-0 rounded-full border transition-colors duration-150 ease-out disabled:cursor-not-allowed disabled:opacity-45",
        checked ? "border-accent/50 bg-accent/25" : "border-line bg-hover",
      )}
    >
      <span
        className={cn(
          "absolute top-1/2 size-[12px] -translate-y-1/2 rounded-full transition-[left,background-color] duration-150 ease-out",
          checked ? "left-[16px] bg-accent" : "left-[2px] bg-ink-dim",
        )}
      />
    </button>
  );
}

interface ToggleFieldProps {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

export function ToggleField({ label, hint, checked, onChange, disabled }: ToggleFieldProps) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <div className={cn("text-[12.5px] text-ink", disabled && "opacity-45")}>{label}</div>
        {hint !== undefined && (
          <p className={cn("mt-0.5 text-[11px] leading-snug text-ink-dim", disabled && "opacity-45")}>
            {hint}
          </p>
        )}
      </div>
      <Toggle checked={checked} onChange={onChange} disabled={disabled} label={label} />
    </div>
  );
}

interface CheckboxRowProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  hint?: string;
  disabled?: boolean;
}

export function CheckboxRow({ checked, onChange, label, hint, disabled }: CheckboxRowProps) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="group flex items-start gap-2 text-left disabled:cursor-not-allowed disabled:opacity-45"
    >
      <span
        className={cn(
          "mt-px flex size-[14px] shrink-0 items-center justify-center rounded-[3px] border transition-colors duration-150 ease-out",
          checked
            ? "border-accent bg-accent text-accent-ink"
            : "border-line-strong bg-elevated group-hover:border-ink-dim",
        )}
      >
        {checked && <Check size={10} strokeWidth={3} />}
      </span>
      <span className="min-w-0">
        <span className="block text-[12.5px] text-ink">{label}</span>
        {hint !== undefined && (
          <span className="mt-0.5 block text-[11px] leading-snug text-ink-dim">{hint}</span>
        )}
      </span>
    </button>
  );
}

interface RadioGroupProps<T extends string | number> {
  value: T;
  options: Choice<T>[];
  onChange: (value: T) => void;
  label?: string;
  className?: string;
}

export function RadioGroup<T extends string | number>({
  value,
  options,
  onChange,
  label,
  className,
}: RadioGroupProps<T>) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("flex flex-wrap gap-x-4 gap-y-1.5", className)}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={String(option.value)}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className="group flex items-center gap-1.5 py-0.5"
          >
            <span
              className={cn(
                "flex size-[11px] items-center justify-center rounded-full border transition-colors duration-150 ease-out",
                active
                  ? "border-accent"
                  : "border-line-strong group-hover:border-ink-dim",
              )}
            >
              {active && <span className="size-[5px] rounded-full bg-accent" />}
            </span>
            <span
              className={cn(
                "text-[12px] transition-colors duration-150 ease-out",
                active ? "text-ink" : "text-ink-muted group-hover:text-ink",
              )}
            >
              {option.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
