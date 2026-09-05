import { beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { assignTaskSectionCore, createSectionCore, deleteSectionCore } from "@/lib/actions/sections";
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

describe("sections", () => {
  const suffix = Date.now();
  let userA: { client: SupabaseClient; userId: string };
  let userB: { client: SupabaseClient; userId: string };

  beforeAll(async () => {
    userA = await createSignedInUser(`sections-a-${suffix}@example.com`, "test-password-123");
    userB = await createSignedInUser(`sections-b-${suffix}@example.com`, "test-password-123");
  });

  async function createTask(user: { client: SupabaseClient; userId: string }, title: string, projectId?: string) {
    const { data } = await user.client
      .from("tasks")
      .insert({ user_id: user.userId, title, project_id: projectId ?? null })
      .select("id")
      .single();
    return data!.id as string;
  }

  it("creates a section under a project", async () => {
    const projectId = await createProjectCore(userA.client, userA.userId, "Website Redesign");

    const sectionId = await createSectionCore(userA.client, userA.userId, projectId!, "Design");

    expect(sectionId).not.toBeNull();
    const { data: section } = await userA.client.from("sections").select("name, project_id").eq("id", sectionId!).single();
    expect(section?.name).toBe("Design");
    expect(section?.project_id).toBe(projectId);
  });

  it("assigns and reassigns a task's section", async () => {
    const projectId = await createProjectCore(userA.client, userA.userId, "Project A");
    const sectionA = await createSectionCore(userA.client, userA.userId, projectId!, "Design");
    const sectionB = await createSectionCore(userA.client, userA.userId, projectId!, "Build");
    const taskId = await createTask(userA, "Wireframe homepage", projectId!);

    await assignTaskSectionCore(userA.client, taskId, sectionA!);
    const { data: afterFirst } = await userA.client.from("tasks").select("section_id").eq("id", taskId).single();
    expect(afterFirst?.section_id).toBe(sectionA);

    await assignTaskSectionCore(userA.client, taskId, sectionB!);
    const { data: afterReassign } = await userA.client.from("tasks").select("section_id").eq("id", taskId).single();
    expect(afterReassign?.section_id).toBe(sectionB);

    await assignTaskSectionCore(userA.client, taskId, null);
    const { data: afterClear } = await userA.client.from("tasks").select("section_id").eq("id", taskId).single();
    expect(afterClear?.section_id).toBeNull();
  });

  it("deleting a section with deleteTasks=false leaves its tasks unfiled from the section", async () => {
    const projectId = await createProjectCore(userA.client, userA.userId, "Kept Tasks Project");
    const sectionId = await createSectionCore(userA.client, userA.userId, projectId!, "Design");
    const taskId = await createTask(userA, "Survives the section", projectId!);
    await assignTaskSectionCore(userA.client, taskId, sectionId!);

    await deleteSectionCore(userA.client, userA.userId, sectionId!, false);

    const { data: section } = await userA.client.from("sections").select().eq("id", sectionId!).maybeSingle();
    expect(section).toBeNull();
    const { data: task } = await userA.client.from("tasks").select("project_id, section_id").eq("id", taskId).single();
    expect(task?.section_id).toBeNull();
    expect(task?.project_id).toBe(projectId);
  });

  it("deleting a section with deleteTasks=true deletes its tasks too", async () => {
    const projectId = await createProjectCore(userA.client, userA.userId, "Deleted Tasks Project");
    const sectionId = await createSectionCore(userA.client, userA.userId, projectId!, "Design");
    const taskId = await createTask(userA, "Deleted with the section", projectId!);
    await assignTaskSectionCore(userA.client, taskId, sectionId!);

    await deleteSectionCore(userA.client, userA.userId, sectionId!, true);

    const { data: task } = await userA.client.from("tasks").select().eq("id", taskId).maybeSingle();
    expect(task).toBeNull();
  });

  it("deleting a project cascades to its sections, unfiling any kept tasks from both", async () => {
    const projectId = await createProjectCore(userA.client, userA.userId, "Cascade Project");
    const sectionId = await createSectionCore(userA.client, userA.userId, projectId!, "Design");
    const taskId = await createTask(userA, "Kept after project delete", projectId!);
    await assignTaskSectionCore(userA.client, taskId, sectionId!);

    await deleteProjectCore(userA.client, userA.userId, projectId!, false);

    const { data: section } = await userA.client.from("sections").select().eq("id", sectionId!).maybeSingle();
    expect(section).toBeNull();
    const { data: task } = await userA.client.from("tasks").select("project_id, section_id").eq("id", taskId).single();
    expect(task?.project_id).toBeNull();
    expect(task?.section_id).toBeNull();
  });

  it("reassigning a task's project clears its section", async () => {
    const projectId = await createProjectCore(userA.client, userA.userId, "Origin Project");
    const otherProjectId = await createProjectCore(userA.client, userA.userId, "Destination Project");
    const sectionId = await createSectionCore(userA.client, userA.userId, projectId!, "Design");
    const taskId = await createTask(userA, "Moves projects", projectId!);
    await assignTaskSectionCore(userA.client, taskId, sectionId!);

    await assignTaskProjectCore(userA.client, taskId, otherProjectId!);

    const { data: task } = await userA.client.from("tasks").select("project_id, section_id").eq("id", taskId).single();
    expect(task?.project_id).toBe(otherProjectId);
    expect(task?.section_id).toBeNull();
  });

  it("unfiling a task's project also clears its section", async () => {
    const projectId = await createProjectCore(userA.client, userA.userId, "Unfiled Origin Project");
    const sectionId = await createSectionCore(userA.client, userA.userId, projectId!, "Design");
    const taskId = await createTask(userA, "Becomes unfiled", projectId!);
    await assignTaskSectionCore(userA.client, taskId, sectionId!);

    await assignTaskProjectCore(userA.client, taskId, null);

    const { data: task } = await userA.client.from("tasks").select("project_id, section_id").eq("id", taskId).single();
    expect(task?.project_id).toBeNull();
    expect(task?.section_id).toBeNull();
  });

  it("user B cannot see user A's section", async () => {
    const projectId = await createProjectCore(userA.client, userA.userId, "A's Private Project");
    const sectionId = await createSectionCore(userA.client, userA.userId, projectId!, "A's Private Section");

    const { data: seenByB } = await userB.client.from("sections").select().eq("id", sectionId!);
    expect(seenByB).toEqual([]);
  });
});
