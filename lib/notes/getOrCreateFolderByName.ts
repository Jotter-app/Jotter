import type { SupabaseClient } from "@supabase/supabase-js";
import { createFolderCore } from "@/lib/actions/folders";
import type { Database } from "@/lib/supabase/database.types";

// Shared by the daily-note and weekly-review generators (Tier 3) -- both
// want a dedicated root-level folder that's created once and reused, not
// recreated on every visit.
export async function getOrCreateFolderByName(
  supabase: SupabaseClient<Database>,
  userId: string,
  name: string
): Promise<string | null> {
  const { data: existing } = await supabase
    .from("folders")
    .select("id")
    .eq("user_id", userId)
    .is("parent_folder_id", null)
    .eq("name", name)
    .maybeSingle();
  if (existing) return existing.id;

  return createFolderCore(supabase, userId, { name, parentFolderId: null });
}
