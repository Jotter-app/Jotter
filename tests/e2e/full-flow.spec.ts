import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { dayKey, dragEventChipToDay } from "./helpers";

// Full-flow smoke test per the plan's Milestone 6 testing table: sign up ->
// create a nested note -> quick-add an NL task -> drag a calendar event ->
// confirm a reminder was scheduled. Each step reuses the app's real UI (no
// mocking) against the local Supabase stack that `supabase start` provides.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

test("sign up, create a nested note, quick-add a task, drag a calendar event, and schedule a reminder", async ({
  page,
}) => {
  const suffix = Date.now();
  const email = `e2e-${suffix}@example.com`;
  const password = "test-password-123";

  await test.step("sign up", async () => {
    await page.goto("/signup");
    await page.locator("#email").fill(email);
    await page.locator("#password").fill(password);
    await page.getByRole("button", { name: "Sign up" }).click();
    await page.waitForURL("**/tasks");
  });

  await test.step("create a folder and a nested note with a hashtag", async () => {
    await page.getByRole("link", { name: "Notes" }).click();
    await page.waitForURL("**/notes");

    await page.getByRole("button", { name: "folder" }).click();
    await page.getByPlaceholder("Folder name").fill("E2E Folder");
    await page.getByRole("button", { name: "Create" }).click();
    await expect(page.getByText("E2E Folder")).toBeVisible();

    // The folder starts expanded and renders its own "+ note" row before the
    // root-level one, so .first() targets the note button nested inside it.
    await page.getByRole("button", { name: "note" }).first().click();
    await page.waitForURL(/\/notes\/[^/]+$/);

    await page.getByPlaceholder("Untitled").fill("E2E Note");
    // The note body is a CodeMirror 6 editor (contenteditable), not a plain
    // <textarea> -- no `placeholder` attribute to select by, and typing via
    // real keystrokes (not .fill()) matches how the editor actually expects
    // input to arrive.
    await page.locator(".cm-content").click();
    await page.locator(".cm-content").pressSequentially("Testing #e2enote from Playwright.");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  });

  const taskTitle = "e2e flow task";

  await test.step("quick-add a task with a natural-language due date and inline tag", async () => {
    await page.getByRole("link", { name: "Tasks" }).click();
    await page.waitForURL("**/tasks");

    await page.getByPlaceholder(/Add a task/).fill(`${taskTitle} tomorrow 3pm #e2eflow`);
    await page.getByRole("button", { name: "Add" }).click();

    await expect(page.getByText(taskTitle, { exact: true })).toBeVisible();
    await expect(page.getByText("e2eflow", { exact: true })).toBeVisible();
  });

  await test.step("add and drag a calendar event", async () => {
    await page.getByRole("link", { name: "Calendar" }).click();
    await page.waitForURL("**/calendar");

    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const todayCell = page.locator(`[data-testid="day-cell"][data-date="${dayKey(today)}"]`);
    const tomorrowCell = page.locator(`[data-testid="day-cell"][data-date="${dayKey(tomorrow)}"]`);

    await todayCell.getByRole("button", { name: "Add event" }).click();
    await page.locator("#event-title").fill("E2E Calendar Event");
    await page.getByRole("button", { name: "Create" }).click();

    const eventChip = todayCell.locator('[data-testid="event-chip"]');
    await expect(eventChip).toBeVisible();

    await dragEventChipToDay(page, eventChip, tomorrowCell);

    await expect(tomorrowCell.locator('[data-testid="event-chip"]')).toBeVisible();
    await expect(todayCell.locator('[data-testid="event-chip"]')).toHaveCount(0);
  });

  await test.step("confirm a reminder was scheduled for the task", async () => {
    const supabase = createClient(url, publishableKey);
    const { data: signIn, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError || !signIn.user) throw signInError ?? new Error("sign-in failed");

    const { data: task, error: taskError } = await supabase
      .from("tasks")
      .select("id, due_at")
      .eq("title", taskTitle)
      .single();
    if (taskError || !task) throw taskError ?? new Error("task not found");
    expect(task.due_at).not.toBeNull();

    const { data: reminder, error: reminderError } = await supabase
      .from("reminders")
      .select("fire_at, sent_at")
      .eq("task_id", task.id)
      .is("sent_at", null)
      .single();
    if (reminderError || !reminder) throw reminderError ?? new Error("reminder not found");

    expect(reminder.sent_at).toBeNull();
    expect(new Date(reminder.fire_at).getTime()).toBe(new Date(task.due_at!).getTime());
  });
});
