import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { dayKey, dragEventChipToDay, openPaletteWithShortcut } from "./helpers";

// Exercises the Jotter command palette itself (docs/superpowers/specs/
// 2026-08-23-jotter-design.md): the explicit /event create grammar plus
// event<->task linking staying in sync on reschedule, the implicit
// single-ranked "Create" row, and the bare-/ pillar picker's template
// insertion. Companion to full-flow.spec.ts, which already covers the
// non-Jotter per-page flows end to end.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

test("Jotter command palette: explicit linking, implicit create, and the / picker", async ({ page }) => {
  const suffix = Date.now();
  const email = `jotter-e2e-${suffix}@example.com`;
  const password = "test-password-123";

  await test.step("sign up and turn on the event-creates-task default", async () => {
    await page.goto("/signup");
    await page.locator("#email").fill(email);
    await page.locator("#password").fill(password);
    await page.getByRole("button", { name: "Sign up" }).click();
    await page.waitForURL("**/tasks");

    await page.goto("/settings");
    await page.getByRole("checkbox", { name: "New calendar events also create a task by default" }).click();
  });

  let taskDueAt: string;

  await test.step('explicit "/event create" links a task, and rescheduling moves both together', async () => {
    await page.goto("/calendar");
    const input = await openPaletteWithShortcut(page);
    await input.fill('/event create "Team Sync" tomorrow 2-3pm');
    await page.getByText(/Create event: Team Sync/).click();

    await expect(input).toBeHidden();

    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowCell = page.locator(`[data-testid="day-cell"][data-date="${dayKey(tomorrow)}"]`);
    const eventChip = tomorrowCell.locator('[data-testid="event-chip"]');
    await expect(eventChip).toBeVisible();

    // Confirm the linked task landed with a matching due date before
    // dragging -- direct DB check, same pattern as full-flow.spec.ts.
    const supabase = createClient(url, publishableKey);
    const { data: signIn, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError || !signIn.user) throw signInError ?? new Error("sign-in failed");

    const { data: taskBefore, error: taskBeforeError } = await supabase
      .from("tasks")
      .select("id, due_at")
      .eq("title", "Team Sync")
      .single();
    if (taskBeforeError || !taskBefore) throw taskBeforeError ?? new Error("linked task not found");
    taskDueAt = taskBefore.due_at!;

    const dayAfterTomorrow = new Date(tomorrow);
    dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 1);
    const targetCell = page.locator(`[data-testid="day-cell"][data-date="${dayKey(dayAfterTomorrow)}"]`);
    await dragEventChipToDay(page, eventChip, targetCell);

    await expect(targetCell.locator('[data-testid="event-chip"]')).toBeVisible();

    const { data: taskAfter } = await supabase.from("tasks").select("due_at").eq("id", taskBefore.id).single();
    const expectedDueAt = new Date(taskDueAt).getTime() + 24 * 3_600_000;
    expect(new Date(taskAfter!.due_at!).getTime()).toBe(expectedDueAt);

    const { data: reminder } = await supabase
      .from("reminders")
      .select("fire_at, sent_at")
      .eq("task_id", taskBefore.id)
      .single();
    expect(new Date(reminder!.fire_at).getTime()).toBe(expectedDueAt);
    expect(reminder?.sent_at).toBeNull();
  });

  await test.step("implicit routing surfaces a single ranked Create row for plain text", async () => {
    await page.goto("/tasks");
    const input = await openPaletteWithShortcut(page);
    await input.fill("buy milk tomorrow 5pm");

    const createItem = page.getByText(/Create task: buy milk/);
    await expect(createItem).toBeVisible();
    await createItem.click();
    await expect(input).toBeHidden();

    await expect(page.getByText("buy milk", { exact: true })).toBeVisible();
  });

  await test.step("a bare / opens the pillar picker and inserts a command template", async () => {
    const input = await openPaletteWithShortcut(page);
    await input.fill("/");

    await expect(page.getByText("/note create ... -- new note")).toBeVisible();
    await page.getByText("/note create ... -- new note").click();
    await expect(input).toHaveValue('/note create "');

    await page.keyboard.press("Escape");
  });
});
