import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import { attempt } from "../lib/attempt";
import type { GameSettings } from "../lib/types";

export function useSettings(gameId: string) {
  const [data, setData] = useState<GameSettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    setData(null);

    void attempt(() => api.readSettings(gameId)).then((response) => {
      if (!alive) return;
      if (response.ok) setData(response.value);
      else setError(response.message);
      setLoading(false);
    });

    return () => {
      alive = false;
    };
  }, [gameId, nonce]);

  const reload = useCallback(() => setNonce((current) => current + 1), []);

  return { data, loading, error, reload };
}
