import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DndContext, useDraggable } from "@dnd-kit/core";

// Mirrors EventChip.tsx: a draggable button rendered inside a DndContext
// (see MonthView.tsx / WeekView.tsx), whose aria-describedby comes from
// dnd-kit's DndContext-scoped id generator (@dnd-kit/utilities' useUniqueId).
function DraggableChip() {
  const { attributes, setNodeRef } = useDraggable({ id: "event-1" });
  return <button ref={setNodeRef} data-testid="chip" {...attributes} />;
}

function describedByFor(contextId: string | undefined) {
  const html = renderToStaticMarkup(
    <DndContext id={contextId}>
      <DraggableChip />
    </DndContext>
  );
  return html.match(/aria-describedby="([^"]+)"/)?.[1];
}

describe("DndContext accessibility id stability (calendar drag-and-drop)", () => {
  it("drifts across renders when DndContext has no pinned id -- the root cause of the /calendar hydration mismatch", () => {
    // Without a pinned id, useUniqueId falls back to a module-level counter
    // that increments once per DndContext mount in the current process. A
    // long-lived Next.js server accumulates mounts across requests/Fast
    // Refresh remounts, so its counter value at SSR time drifts from a
    // fresh browser page load's counter, which always starts at 0 --
    // producing exactly this kind of aria-describedby mismatch. Simulate
    // that drift here with warm-up renders between the two we compare.
    describedByFor(undefined);
    const first = describedByFor(undefined);
    describedByFor(undefined);
    describedByFor(undefined);
    const second = describedByFor(undefined);

    expect(first).not.toBe(second);
  });

  it("stays stable across renders when DndContext is given a pinned id, as MonthView and WeekView do", () => {
    describedByFor("calendar-grid");
    const first = describedByFor("calendar-grid");
    describedByFor("calendar-grid");
    describedByFor("calendar-grid");
    const second = describedByFor("calendar-grid");

    expect(first).toBe(second);
    expect(first).toBe("calendar-grid");
  });
});
