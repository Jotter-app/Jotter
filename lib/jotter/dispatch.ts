"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { currentUserId } from "@/lib/supabase/session";
import { insertTaskCore } from "@/lib/actions/tasks";
import { insertEventCore } from "@/lib/actions/events";
import { insertNoteCore } from "@/lib/actions/notes";
import { getDefaultEventCreatesTaskCore } from "@/lib/actions/settings";
import { findOrCreateTag } from "@/lib/tags/findOrCreateTag";
import { parseImplicit } from "@/lib/jotter/parseImplicit";
import { parseExplicit } from "@/lib/jotter/parseExplicit";
import { DEFAULT_EVENT_DURATION_MS } from "@/lib/jotter/duration";
import type { JotterIntent, JotterRoute } from "@/lib/jotter/types";
import type { Database } from "@/lib/supabase/database.types";

export interface JotterDispatchResult {
  ok: boolean;
  error: string | null;
  route: JotterRoute | null;
  redirectTo: string | null;
}

function fail(error: string, route: JotterRoute | null = null): JotterDispatchResult {
  return { ok: false, error, route, redirectTo: null };
}

/**
 * Core dispatch logic, factored out (same seam as insertEventCore) so it's
 * callable both from the request-scoped wrapper below and directly from
 * integration tests, which can't go through currentUserId() -- it depends
 * on next/headers' cookies(), which only works inside an actual Next.js
 * request.
 */
export async function dispatchJotterCore(
  supabase: SupabaseClient<Database>,
  userId: string,
  rawInput: string,
  routeOverride?: JotterRoute
): Promise<JotterDispatchResult> {
  const trimmed = rawInput.trim();
  if (!trimmed) {
    return fail("Type something first.");
  }

  let intent: JotterIntent;
  if (trimmed.startsWith("/")) {
    const parsed = parseExplicit(trimmed);
    if (!parsed.ok || !parsed.intent) {
      return fail(parsed.error ?? "Could not parse that command.");
    }
    intent = parsed.intent;
  } else {
    intent = parseImplicit(trimmed);
    if (routeOverride) intent = { ...intent, route: routeOverride };
  }

  if (!intent.title) {
    return fail("Enter something first.", intent.route);
  }

  if (intent.route === "task") {
    const result = await insertTaskCore(supabase, userId, {
      title: intent.title,
      dueAt: intent.dueAt,
      tagNames: intent.tags,
    });
    if (!result.ok) return fail(result.error ?? "Could not create task.", "task");
    return { ok: true, error: null, route: "task", redirectTo: null };
  }

  if (intent.route === "event") {
    if (!intent.dueAt) {
      return fail("Events need a date/time.", "event");
    }
    const alsoCreateTask = await getDefaultEventCreatesTaskCore(supabase, userId);
    const endAt = intent.endAt ?? new Date(intent.dueAt.getTime() + DEFAULT_EVENT_DURATION_MS);
    const result = await insertEventCore(supabase, userId, {
      title: intent.title,
      startAt: intent.dueAt.toISOString(),
      endAt: endAt.toISOString(),
      alsoCreateTask,
    });
    if (!result.ok) return fail(result.error ?? "Could not create event.", "event");
    return { ok: true, error: null, route: "event", redirectTo: null };
  }

  // note
  const result = await insertNoteCore(supabase, userId, {
    folderId: null,
    title: intent.title,
    bodyMarkdown: intent.noteBody ?? "",
  });
  if (!result.ok || !result.noteId) {
    return fail(result.error ?? "Could not create note.", "note");
  }

  // Mirrors saveNote's tag-on-save behavior, so a Jotter-created note is
  // tagged the same as one hand-typed then saved, rather than waiting for a
  // first manual edit to pick up its hashtags.
  for (const name of intent.tags) {
    const tagId = await findOrCreateTag(supabase, userId, name);
    if (!tagId) continue;
    await supabase
      .from("taggables")
      .upsert(
        { tag_id: tagId, user_id: userId, taggable_id: result.noteId, taggable_type: "note" },
        { onConflict: "tag_id,taggable_id,taggable_type", ignoreDuplicates: true }
      );
  }

  return { ok: true, error: null, route: "note", redirectTo: `/notes/${result.noteId}` };
}

/**
 * The single entry point Jotter's UI calls, whether the input came from
 * implicit routing or an explicit /command (see
 * docs/superpowers/specs/2026-08-23-jotter-design.md). Returns a uniform
 * result rather than throwing/redirecting, so the caller (GlobalSearch)
 * controls navigation itself -- notes don't reuse createNote()'s
 * redirect()-throwing shape here for exactly that reason. Revalidation
 * lives here rather than in dispatchJotterCore -- it needs an actual
 * Next.js request-scoped store, which integration tests calling the core
 * function directly don't have.
 */
export async function dispatchJotter(
  rawInput: string,
  routeOverride?: JotterRoute
): Promise<JotterDispatchResult> {
  const { supabase, userId } = await currentUserId();
  if (!userId) {
    return fail("Not signed in.");
  }

  const result = await dispatchJotterCore(supabase, userId, rawInput, routeOverride);

  if (result.ok) {
    if (result.route === "task") {
      revalidatePath("/tasks");
      revalidatePath("/calendar");
    } else if (result.route === "event") {
      revalidatePath("/calendar");
      revalidatePath("/tasks");
    } else if (result.route === "note") {
      revalidatePath("/notes");
    }
  }

  return result;
}
