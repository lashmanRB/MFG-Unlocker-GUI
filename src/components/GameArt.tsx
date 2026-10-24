import { useEffect, useState } from "react";
import { cn } from "../lib/cn";
import { initials } from "../lib/format";

interface GameArtProps {
  sources: string[];
  name: string;
  className?: string;
  labelClassName?: string;
}

export function GameArt({ sources, name, className, labelClassName }: GameArtProps) {
  const [index, setIndex] = useState(0);
  const first = sources[0] ?? "";

  // the same slot is reused when another game is selected
  useEffect(() => {
    setIndex(0);
  }, [first]);

  const src = index < sources.length ? sources[index] : null;

  return (
    <div
      className={cn(
        "relative shrink-0 overflow-hidden rounded-[3px] border border-line bg-elevated",
        className,
      )}
    >
      {src === null ? (
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
          src={src}
          alt=""
          draggable={false}
          loading="lazy"
          onError={() => setIndex((current) => current + 1)}
          className="h-full w-full object-contain"
        />
      )}
    </div>
  );
}
