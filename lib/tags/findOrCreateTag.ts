import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Shared by every "type a tag name and get a tag_id back" flow (the
 * TagPicker's create-on-the-fly option, note hashtag extraction, and
 * task quick-add hashtag extraction) so the find-or-create-by-name
 * pattern lives in one place.
 */
export async function findOrCreateTag(
  supabase: SupabaseClient<Database>,
  userId: string,
  name: string
): Promise<string | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;

  const { data: existing } = await supabase.from("tags").select("id").eq("name", trimmed).maybeSingle();
  if (existing) return existing.id;

  const { data: created, error } = await supabase
    .from("tags")
    .insert({ user_id: userId, name: trimmed })
    .select("id")
    .single();
  if (error || !created) return null;
  return created.id;
}
