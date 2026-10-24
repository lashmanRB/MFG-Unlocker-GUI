import type { GameEntry, GameSettings } from "./types";

export function libraryLabel(game: GameEntry): string {
  if (game.source === "manual" || game.libraryPath === null) return "manual";
  const parts = game.libraryPath.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? game.libraryPath;
}

// both sides are built by spreading the same object, so key order matches
export function sameSettings(a: GameSettings, b: GameSettings): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
