import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { Star } from "lucide-react";

export interface NoteCardData {
  id: string;
  title: string;
  bodyMarkdown: string;
  updatedAt: string;
  notebookName: string;
  tags: { id: string; name: string }[];
  starred: boolean;
}

// A short, plain-text preview -- markdown syntax is stripped just enough
// (headings, list markers, emphasis) that the snippet doesn't read as
// broken markdown at a glance; this is not a renderer.
function snippet(bodyMarkdown: string): string {
  const plain = bodyMarkdown
    .replace(/^#+\s*/gm, "")
    .replace(/^[-*]\s*/gm, "")
    .replace(/[*_`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return plain.length > 140 ? `${plain.slice(0, 140)}...` : plain;
}

export function NoteCard({ note }: { note: NoteCardData }) {
  return (
    <Link
      href={`/notes/${note.id}`}
      className="flex flex-col gap-1.5 rounded-2xl bg-card p-4 shadow-sm transition-shadow hover:shadow-md"
    >
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] font-semibold tracking-wide text-accent-700 uppercase">
          {note.notebookName}
        </span>
        {note.starred && <Star className="ml-auto size-3.5 shrink-0 fill-accent text-accent" aria-label="Starred" />}
      </div>
      <div className="font-heading text-[17px] leading-tight">{note.title || "Untitled"}</div>
      <p className="line-clamp-2 flex-1 text-[13px] text-muted-foreground">{snippet(note.bodyMarkdown)}</p>
      <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
        <span>Edited {formatDistanceToNow(new Date(note.updatedAt), { addSuffix: true })}</span>
        {note.tags.map((tag) => (
          <span key={tag.id} className="rounded-full border border-accent px-2 py-0.5 text-accent-700">
            #{tag.name}
          </span>
        ))}
      </div>
    </Link>
  );
}
