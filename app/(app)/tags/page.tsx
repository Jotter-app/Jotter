import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export default async function TagsPage() {
  const supabase = await createClient();
  const { data: tags } = await supabase.from("tags").select().order("name");

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-5 p-6">
      <h1 className="font-heading text-2xl">Tags</h1>
      {tags && tags.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {tags.map((tag) => (
            <li key={tag.id}>
              <Link
                href={`/tags/${tag.id}`}
                className="inline-flex items-center gap-1 rounded-full border border-accent px-3 py-1 text-sm text-accent-700 hover:bg-accent/10"
              >
                {tag.name}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No tags yet -- tag a note, task, or event to get started.</p>
      )}
    </main>
  );
}
