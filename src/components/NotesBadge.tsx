import { MessageSquareText } from "lucide-react";
import { notesFor } from "../lib/notes";

export function NotesBadge({ appId }: { appId: number | null }) {
  if (notesFor(appId) === null) return null;
  return (
    <span className="inline-flex shrink-0 text-ink-dim" title="Community notes for this game">
      <MessageSquareText size={12} />
    </span>
  );
}
