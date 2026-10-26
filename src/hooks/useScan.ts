import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { attempt } from "../lib/attempt";
import { pickFolder } from "../lib/picker";
import type { GameEntry, ScanResult } from "../lib/types";
import { useToast } from "./useToast";

type ScanPhase = "loading" | "ready" | "error";
type ScanBusy = "scan" | "add" | null;

export function useScan() {
  const toast = useToast();
  const [result, setResult] = useState<ScanResult | null>(null);
  const [phase, setPhase] = useState<ScanPhase>("loading");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<ScanBusy>(null);
  const started = useRef(false);
  const hasResult = useRef(false);

  const load = useCallback(async (force = false) => {
    setBusy("scan");
    const response = await attempt(() => api.scanAll(force));
    if (response.ok) {
      hasResult.current = true;
      setResult(response.value);
      setError(null);
      setPhase("ready");
    } else if (hasResult.current) {
      toast("error", `Scan failed: ${response.message}`);
    } else {
      setError(response.message);
      setPhase("error");
    }
    setBusy(null);
  }, [toast]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void load();
  }, [load]);

  const addGame = useCallback(async (): Promise<GameEntry | null> => {
    const picked = await attempt(() => pickFolder("Select the folder that contains the game"));
    if (!picked.ok) {
      toast("error", `Could not open the folder picker: ${picked.message}`);
      return null;
    }
    const folder = picked.value;
    if (folder === null) return null;

    setBusy("add");
    const added = await attempt(() => api.addManualGame(folder));
    setBusy(null);
    if (!added.ok) {
      toast("error", `Could not add that folder: ${added.message}`);
      return null;
    }

    setResult((current) =>
      current
        ? {
            ...current,
            manual: [...current.manual.filter((item) => item.id !== added.value.id), added.value],
          }
        : current,
    );
    toast("ok", `${added.value.name} added`);
    return added.value;
  }, [toast]);

  const updateGame = useCallback((entry: GameEntry) => {
    setResult((current) => {
      if (!current) return current;
      const swap = (list: GameEntry[]) =>
        list.map((item) => (item.id === entry.id ? entry : item));
      return {
        ...current,
        scan: { ...current.scan, games: swap(current.scan.games) },
        manual: swap(current.manual),
      };
    });
  }, []);

  return {
    result,
    phase,
    error,
    busy,
    rescan: load,
    addGame,
    updateGame,
  };
}
