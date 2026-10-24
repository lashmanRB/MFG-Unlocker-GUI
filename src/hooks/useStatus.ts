import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { attempt } from "../lib/attempt";
import type { StatusSummary } from "../lib/types";

// only polls while the diagnostics tab is the active one, and pauses while
// the window is hidden
export function useStatus(gameId: string, active: boolean) {
  const [status, setStatus] = useState<StatusSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!active) return;
    let alive = true;
    setLoading(true);
    setError(null);
    setStatus(null);

    const tick = async () => {
      const response = await attempt(() => api.readStatus(gameId));
      if (!alive) return;
      if (response.ok) {
        setStatus(response.value);
        setError(null);
      } else {
        setError(response.message);
      }
      setLoading(false);
    };

    void tick();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void tick();
    }, 2000);

    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [gameId, active]);

  return { status, loading, error };
}
