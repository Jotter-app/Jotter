// "Most-recent-edit-wins," made concrete: push-on-write already keeps
// Jotter's updated_at and Google's `updated` in lockstep on every successful
// local write, so the only way Jotter's timestamp ends up ahead of what a
// fresh pull just reported is that an earlier push attempt failed -- in
// which case the fix is to retry that push, not to overwrite the local
// event with Google's now-stale data. Equal timestamps (in practice,
// effectively never -- both carry millisecond precision) fall back to
// repush-local too, since it's the harmless side: re-pushing identical data
// is a no-op API call, while wrongly overwriting local data never is.
export function resolveConflict(localUpdatedAt: string, googleUpdatedAt: string): "apply-google" | "repush-local" {
  return new Date(googleUpdatedAt).getTime() > new Date(localUpdatedAt).getTime() ? "apply-google" : "repush-local";
}
