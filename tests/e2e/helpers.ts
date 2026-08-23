import type { Locator, Page } from "@playwright/test";

/** Mirrors lib/calendar/grid.ts's dayKey() so tests can address the same
 * droppable day cells the UI renders, in local time (not UTC). */
export function dayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Opens the Cmd/Ctrl+K palette via the real keyboard shortcut, retrying the
 * keypress a few times. GlobalSearch attaches its keydown listener in a
 * useEffect, which only runs once React has hydrated -- right after a hard
 * navigation (page.goto), a single keypress can fire before that listener
 * exists and is lost for good (no queued replay), which a longer
 * expect(...).toBeVisible() timeout can't recover from on its own.
 */
export async function openPaletteWithShortcut(page: Page) {
  const input = page.getByPlaceholder(/Search, or type/);
  for (let attempt = 0; attempt < 5; attempt++) {
    await page.keyboard.press("Control+k");
    try {
      await input.waitFor({ state: "visible", timeout: 1000 });
      return input;
    } catch {
      // Listener probably wasn't attached yet -- try again.
    }
  }
  await input.waitFor({ state: "visible" });
  return input;
}

export async function dragEventChipToDay(page: Page, eventChip: Locator, targetDayCell: Locator) {
  const sourceBox = await eventChip.boundingBox();
  const targetBox = await targetDayCell.boundingBox();
  if (!sourceBox || !targetBox) throw new Error("Could not measure drag source/target");

  const sourceX = sourceBox.x + sourceBox.width / 2;
  const sourceY = sourceBox.y + sourceBox.height / 2;
  const targetX = targetBox.x + targetBox.width / 2;
  const targetY = targetBox.y + targetBox.height / 2;

  await page.mouse.move(sourceX, sourceY);
  await page.mouse.down();
  // dnd-kit's PointerSensor has an 8px activation distance -- a real drag
  // gesture needs to clear that before it starts tracking as a drag.
  await page.mouse.move(sourceX + 12, sourceY + 12, { steps: 5 });
  await page.mouse.move(targetX, targetY, { steps: 10 });
  await page.mouse.up();
}
