import { beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { insertSubtaskCore, toggleTaskCompleteCore } from "@/lib/actions/tasks";

// Requires a running local Supabase stack (`supabase start`). Exercises
// insertSubtaskCore/toggleTaskCompleteCore directly (rather than the
// exported insertSubtask/toggleTaskComplete actions) since those wrappers
// call currentUserId(), which depends on next/headers' cookies() and only
// works inside an actual Next.js request -- not a plain Vitest process.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

async function createSignedInUser(email: string, password: string) {
  const client = createClient(url, publishableKey);
  await client.auth.signUp({ email, password });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.user) throw error ?? new Error("sign-in failed");
  return { client, userId: data.user.id };
}

describe("subtasks", () => {
  const suffix = Date.now();
  let userA: { client: SupabaseClient; userId: string };
  let userB: { client: SupabaseClient; userId: string };

  beforeAll(async () => {
    userA = await createSignedInUser(`subtasks-a-${suffix}@example.com`, "test-password-123");
    userB = await createSignedInUser(`subtasks-b-${suffix}@example.com`, "test-password-123");
  });

  async function createTopLevelTask(user: { client: SupabaseClient; userId: string }, title: string) {
    const { data } = await user.client.from("tasks").insert({ user_id: user.userId, title }).select("id").single();
    return data!.id as string;
  }

  it("creates a subtask under a plain top-level task", async () => {
    const parentId = await createTopLevelTask(userA, "Groceries");

    const result = await insertSubtaskCore(userA.client, userA.userId, parentId, "Buy milk");

    expect(result.ok).toBe(true);
    const { data: subtask } = await userA.client.from("tasks").select("parent_task_id").eq("id", result.taskId!).single();
    expect(subtask?.parent_task_id).toBe(parentId);
  });

  it("rejects nesting a subtask under an existing subtask (one level only)", async () => {
    const parentId = await createTopLevelTask(userA, "Groceries 2");
    const subtaskResult = await insertSubtaskCore(userA.client, userA.userId, parentId, "Buy milk");

    const result = await insertSubtaskCore(userA.client, userA.userId, subtaskResult.taskId!, "Buy 2% milk");

    expect(result.ok).toBe(false);
    expect(result.taskId).toBeNull();
  });

  it("user B cannot create a subtask under user A's task", async () => {
    const parentId = await createTopLevelTask(userA, "Groceries 3");

    const result = await insertSubtaskCore(userB.client, userB.userId, parentId, "Sneaky subtask");

    // Blocked by RLS -- userB's client can't select userA's task row at
    // all, so insertSubtaskCore's own parent lookup finds nothing.
    expect(result.ok).toBe(false);
  });

  it("completing the parent cascades completion to every open subtask", async () => {
    const parentId = await createTopLevelTask(userA, "Groceries 4");
    const sub1 = await insertSubtaskCore(userA.client, userA.userId, parentId, "Buy milk");
    const sub2 = await insertSubtaskCore(userA.client, userA.userId, parentId, "Buy eggs");

    await toggleTaskCompleteCore(userA.client, userA.userId, parentId, true, null);

    const { data: subtasks } = await userA.client
      .from("tasks")
      .select("id, completed_at")
      .in("id", [sub1.taskId!, sub2.taskId!]);
    expect(subtasks?.every((s) => s.completed_at !== null)).toBe(true);
  });

  it("does not overwrite a subtask that was already completed before the parent", async () => {
    const parentId = await createTopLevelTask(userA, "Groceries 5");
    const sub = await insertSubtaskCore(userA.client, userA.userId, parentId, "Buy milk");
    await toggleTaskCompleteCore(userA.client, userA.userId, sub.taskId!, true, null);
    const { data: before } = await userA.client.from("tasks").select("completed_at").eq("id", sub.taskId!).single();

    await toggleTaskCompleteCore(userA.client, userA.userId, parentId, true, null);

    const { data: after } = await userA.client.from("tasks").select("completed_at").eq("id", sub.taskId!).single();
    expect(after?.completed_at).toBe(before?.completed_at);
  });

  it("un-completing the parent leaves subtasks untouched", async () => {
    const parentId = await createTopLevelTask(userA, "Groceries 6");
    const sub = await insertSubtaskCore(userA.client, userA.userId, parentId, "Buy milk");
    await toggleTaskCompleteCore(userA.client, userA.userId, parentId, true, null);

    await toggleTaskCompleteCore(userA.client, userA.userId, parentId, false, null);

    const { data: subtask } = await userA.client.from("tasks").select("completed_at").eq("id", sub.taskId!).single();
    expect(subtask?.completed_at).not.toBeNull();
  });
});
