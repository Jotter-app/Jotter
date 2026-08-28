import { describe, expect, it } from "vitest";
import { formatTaskCheckboxLine } from "@/lib/jotter/formatTaskCheckboxLine";

describe("formatTaskCheckboxLine", () => {
  it("formats a bare task with no due date or tags", () => {
    expect(formatTaskCheckboxLine("abc-123", "Buy milk", null, [])).toBe(
      "- [ ] Buy milk <!-- task:abc-123 -->"
    );
  });

  it("includes a formatted due date when present", () => {
    const dueAt = new Date("2026-08-28T17:00:00");
    expect(formatTaskCheckboxLine("abc-123", "Call the dentist", dueAt, [])).toBe(
      "- [ ] Call the dentist (due Aug 28, 5:00 PM) <!-- task:abc-123 -->"
    );
  });

  it("appends every tag with a leading #", () => {
    expect(formatTaskCheckboxLine("abc-123", "Follow up", null, ["client-x", "urgent"])).toBe(
      "- [ ] Follow up #client-x #urgent <!-- task:abc-123 -->"
    );
  });

  it("combines a due date and tags in due-date-then-tags order", () => {
    const dueAt = new Date("2026-08-28T09:00:00");
    expect(formatTaskCheckboxLine("abc-123", "Standup", dueAt, ["team"])).toBe(
      "- [ ] Standup (due Aug 28, 9:00 AM) #team <!-- task:abc-123 -->"
    );
  });
});
