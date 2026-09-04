import { beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { assignTaskProjectCore, createProjectCore, deleteProjectCore } from "@/lib/actions/projects";

// Requires a running local Supabase stack (`supabase start`). Exercises the
// *Core functions directly (rather than the exported "use server" actions)
// since those wrappers call currentUserId(), which depends on next/headers'
// cookies() and only works inside an actual Next.js request.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

async function createSignedInUser(email: string, password: string) {
  const client = createClient(url, publishableKey);
  await client.auth.signUp({ email, password });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.user) throw error ?? new Error("sign-in failed");
  return { client, userId: data.user.id };
}

describe("projects", () => {
  const suffix = Date.now();
  let userA: { client: SupabaseClient; userId: string };
  let userB: { client: SupabaseClient; userId: string };

  beforeAll(async () => {
    userA = await createSignedInUser(`projects-a-${suffix}@example.com`, "test-password-123");
    userB = await createSignedInUser(`projects-b-${suffix}@example.com`, "test-password-123");
  });

  async function createTask(user: { client: SupabaseClient; userId: string }, title: string) {
    const { data } = await user.client.from("tasks").insert({ user_id: user.userId, title }).select("id").single();
    return data!.id as string;
  }

  it("creates a project", async () => {
    const projectId = await createProjectCore(userA.client, userA.userId, "Website Redesign");

    expect(projectId).not.toBeNull();
    const { data: project } = await userA.client.from("projects").select("name").eq("id", projectId!).single();
    expect(project?.name).toBe("Website Redesign");
  });

  it("assigns and reassigns a task's project", async () => {
    const projectId = await createProjectCore(userA.client, userA.userId, "Project A");
    const otherProjectId = await createProjectCore(userA.client, userA.userId, "Project B");
    const taskId = await createTask(userA, "Design the homepage");

    await assignTaskProjectCore(userA.client, taskId, projectId!);
    const { data: afterFirst } = await userA.client.from("tasks").select("project_id").eq("id", taskId).single();
    expect(afterFirst?.project_id).toBe(projectId);

    await assignTaskProjectCore(userA.client, taskId, otherProjectId!);
    const { data: afterReassign } = await userA.client.from("tasks").select("project_id").eq("id", taskId).single();
    expect(afterReassign?.project_id).toBe(otherProjectId);

    await assignTaskProjectCore(userA.client, taskId, null);
    const { data: afterClear } = await userA.client.from("tasks").select("project_id").eq("id", taskId).single();
    expect(afterClear?.project_id).toBeNull();
  });

  it("deleting a project with deleteTasks=false leaves its tasks unfiled", async () => {
    const projectId = await createProjectCore(userA.client, userA.userId, "Kept Tasks Project");
    const taskId = await createTask(userA, "Survives the project");
    await assignTaskProjectCore(userA.client, taskId, projectId!);

    await deleteProjectCore(userA.client, userA.userId, projectId!, false);

    const { data: project } = await userA.client.from("projects").select().eq("id", projectId!).maybeSingle();
    expect(project).toBeNull();
    const { data: task } = await userA.client.from("tasks").select("project_id").eq("id", taskId).single();
    expect(task?.project_id).toBeNull();
  });

  it("deleting a project with deleteTasks=true deletes its tasks too", async () => {
    const projectId = await createProjectCore(userA.client, userA.userId, "Deleted Tasks Project");
    const taskId = await createTask(userA, "Deleted with the project");
    await assignTaskProjectCore(userA.client, taskId, projectId!);

    await deleteProjectCore(userA.client, userA.userId, projectId!, true);

    const { data: task } = await userA.client.from("tasks").select().eq("id", taskId).maybeSingle();
    expect(task).toBeNull();
  });

  it("user B cannot see user A's project", async () => {
    const projectId = await createProjectCore(userA.client, userA.userId, "A's Private Project");

    const { data: seenByB } = await userB.client.from("projects").select().eq("id", projectId!);
    expect(seenByB).toEqual([]);

    // Not tested here: whether userB's own task can have its project_id
    // *set* to userA's project id. It can -- RLS on `tasks` only checks
    // that userB owns the task row being updated, not that the referenced
    // project_id is one userB can see; the FK itself just checks the id
    // exists somewhere in `projects`, same as every other cross-table FK
    // in this schema (e.g. taggables.tag_id has the identical shape). No
    // data leaks either way -- userB still can never SELECT userA's
    // project row -- and the UI can never produce this in practice, since
    // ProjectPicker only ever offers allProjects, which is already
    // RLS-scoped to the current user.
  });
});
