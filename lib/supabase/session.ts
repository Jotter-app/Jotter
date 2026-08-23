import { createClient } from "@/lib/supabase/server";

// Shared by Server Actions that need the current user's id for RLS-scoped
// inserts (the with-check policy requires user_id = auth.uid() explicitly).
export async function currentUserId() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  return { supabase, userId: data?.claims.sub ?? null };
}
