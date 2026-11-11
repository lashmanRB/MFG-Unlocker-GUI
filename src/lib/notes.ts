import data from "./gameNotes.json";

export interface NoteEntry {
  text: string;
  source: string;
}

export interface GameNotes {
  name: string;
  verdict: string;
  notes: NoteEntry[];
}

const byAppId: Record<string, GameNotes> = data.games;

export const notesUpdated = data.updated;
export const issuesUrl = data.issuesUrl;

export function notesFor(appId: number | null): GameNotes | null {
  if (appId === null) return null;
  return byAppId[String(appId)] ?? null;
}

export function verdictLabel(verdict: string): string {
  switch (verdict) {
    case "works-with-tweaks":
      return "needs tweaks";
    case "mixed":
      return "mixed reports";
    default:
      return verdict;
  }
}
