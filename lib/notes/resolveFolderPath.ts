import type { SupabaseClient } from "@supabase/supabase-js";
import { createFolderCore } from "@/lib/actions/folders";
import type { Database } from "@/lib/supabase/database.types";

export interface FolderPathCache {
  get(parentId: string | null, name: string): string | undefined;
  set(parentId: string | null, name: string, id: string): void;
}

// Scoped to a single import run -- repeated paths (many notes under the
// same "Work/Projects", say) shouldn't re-query per note once a level has
// already been resolved earlier in the same batch.
export function createFolderPathCache(): FolderPathCache {
  const map = new Map<string, string>();
  const key = (parentId: string | null, name: string) => `${parentId ?? "root"}::${name}`;
  return {
    get: (parentId, name) => map.get(key(parentId, name)),
    set: (parentId, name, id) => map.set(key(parentId, name), id),
  };
}

// Walks path segments one level at a time, reusing an existing folder with
// the same (user, name, parent) rather than creating a sibling duplicate --
// so re-importing into the same tree doesn't fork it. Matching is exact and
// case-sensitive, same as folder names aren't normalized anywhere else in
// this app. Returns the final segment's folder id, or null for an empty
// path (the root).
export async function resolveFolderPath(
  supabase: SupabaseClient<Database>,
  userId: string,
  segments: string[],
  cache: FolderPathCache
): Promise<string | null> {
  let parentId: string | null = null;

  for (const segment of segments) {
    const cached = cache.get(parentId, segment);
    if (cached) {
      parentId = cached;
      continue;
    }

    let existing: { id: string } | null = null;
    if (parentId === null) {
      const result: { data: { id: string } | null } = await supabase
        .from("folders")
        .select("id")
        .eq("user_id", userId)
        .eq("name", segment)
        .is("parent_folder_id", null)
        .maybeSingle();
      existing = result.data;
    } else {
      const result: { data: { id: string } | null } = await supabase
        .from("folders")
        .select("id")
        .eq("user_id", userId)
        .eq("name", segment)
        .eq("parent_folder_id", parentId)
        .maybeSingle();
      existing = result.data;
    }

    if (existing) {
      cache.set(parentId, segment, existing.id);
      parentId = existing.id;
      continue;
    }

    const newFolderId = await createFolderCore(supabase, userId, { name: segment, parentFolderId: parentId });
    if (!newFolderId) throw new Error(`Could not create folder "${segment}"`);
    cache.set(parentId, segment, newFolderId);
    parentId = newFolderId;
  }

  return parentId;
}
