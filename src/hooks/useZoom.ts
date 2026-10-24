import { useCallback, useEffect, useRef, useState } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { isTauri } from "../lib/api";

export const zoomMin = 0.75;
export const zoomMax = 1.75;
export const zoomStep = 0.05;

const storageKey = "mfg.uiZoom";

export interface ZoomControls {
  factor: number;
  enabled: boolean;
  step: (delta: number) => void;
  set: (factor: number) => void;
  reset: () => void;
}

function clampZoom(value: number): number {
  const rounded = Math.round(value * 100) / 100;
  return Math.min(zoomMax, Math.max(zoomMin, rounded));
}

function storedZoom(): number {
  const raw = window.localStorage.getItem(storageKey);
  if (raw === null) return 1;
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? clampZoom(parsed) : 1;
}

// WebView page zoom, so the UI scales like a browser instead of a transform
export function useZoom(): ZoomControls {
  const [factor, setFactor] = useState(1);
  const factorRef = useRef(1);

  const apply = useCallback(async (value: number) => {
    if (!isTauri) return;
    try {
      await getCurrentWebview().setZoom(value);
    } catch {
      // zoom is cosmetic; a refused call should not take the window down
    }
  }, []);

  const commit = useCallback(
    (value: number) => {
      const next = clampZoom(value);
      factorRef.current = next;
      setFactor(next);
      if (isTauri) window.localStorage.setItem(storageKey, String(next));
      void apply(next);
    },
    [apply],
  );

  useEffect(() => {
    if (!isTauri) return;
    const initial = storedZoom();
    factorRef.current = initial;
    setFactor(initial);
    void apply(initial);
  }, [apply]);

  const step = useCallback(
    (delta: number) => {
      commit(factorRef.current + delta);
    },
    [commit],
  );

  const reset = useCallback(() => commit(1), [commit]);
  const set = useCallback((value: number) => commit(value), [commit]);

  useEffect(() => {
    if (!isTauri) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      if (event.key === "=" || event.key === "+") {
        event.preventDefault();
        step(zoomStep);
      } else if (event.key === "-" || event.key === "_") {
        event.preventDefault();
        step(-zoomStep);
      } else if (event.key === "0") {
        event.preventDefault();
        reset();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [step, reset]);

  return { factor, enabled: isTauri, step, set, reset };
}
