import { useState } from "react";
import { cn } from "../lib/cn";
import { initials } from "../lib/format";

interface GameArtProps {
  src: string | null;
  name: string;
  className?: string;
  labelClassName?: string;
}

export function GameArt({ src, name, className, labelClassName }: GameArtProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const imageSrc = src !== null && src.length > 0 && src !== failedSrc ? src : null;

  return (
    <div
      className={cn(
        "relative shrink-0 overflow-hidden rounded-[3px] border border-line bg-elevated",
        className,
      )}
    >
      {imageSrc === null ? (
        <div
          aria-hidden="true"
          className={cn(
            "mono flex h-full w-full items-center justify-center tracking-[0.06em] text-ink-dim",
            labelClassName,
          )}
        >
          {initials(name)}
        </div>
      ) : (
        <img
          src={imageSrc}
          alt=""
          draggable={false}
          loading="lazy"
          onError={() => setFailedSrc(imageSrc)}
          className="h-full w-full object-cover"
        />
      )}
    </div>
  );
}
