import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { attempt } from "../lib/attempt";
import type { LogFile } from "../lib/types";

export function useLogs(gameId: string, active: boolean) {
  const [files, setFiles] = useState<LogFile[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [filesError, setFilesError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [textLoading, setTextLoading] = useState(false);
  const [textError, setTextError] = useState<string | null>(null);
  const requestId = useRef(0);

  const openLog = useCallback(async (path: string) => {
    const ticket = requestId.current + 1;
    requestId.current = ticket;
    setSelected(path);
    setTextLoading(true);
    setTextError(null);
    const response = await attempt(() => api.readLog(path));
    if (requestId.current !== ticket) return;
    if (response.ok) {
      setText(response.value);
    } else {
      setText("");
      setTextError(response.message);
    }
    setTextLoading(false);
  }, []);

  useEffect(() => {
    setSelected(null);
    setText("");
    setTextError(null);
    if (!active) return;
    let alive = true;
    setFilesLoading(true);
    setFilesError(null);

    void attempt(() => api.listLogs(gameId)).then((response) => {
      if (!alive) return;
      if (response.ok) {
        setFiles([...response.value].sort((a, b) => b.modified - a.modified));
      } else {
        setFiles([]);
        setFilesError(response.message);
      }
      setFilesLoading(false);
    });

    return () => {
      alive = false;
    };
  }, [gameId, active]);

  // newest log opens by itself so the panel is not empty on first visit
  useEffect(() => {
    if (!active || files.length === 0) return;
    if (selected !== null && files.some((file) => file.path === selected)) return;
    void openLog(files[0].path);
  }, [active, files, selected, openLog]);

  return { files, filesLoading, filesError, selected, openLog, text, textLoading, textError };
}
