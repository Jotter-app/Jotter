"use client";

import { useActionState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createTaskFromQuickAdd, type QuickAddFormState } from "@/lib/actions/tasks";

const initialState: QuickAddFormState = { error: null };

// projectId, when given, is carried as a hidden field so a task created
// from a project's own page is automatically filed into it -- the global
// Tasks page never passes this, so createTaskFromQuickAdd sees no
// projectId there and files new tasks unfiled as it always has.
export function QuickAddBar({ projectId }: { projectId?: string } = {}) {
  const [state, formAction, pending] = useActionState(createTaskFromQuickAdd, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  // Clear the input after a successful add (state.error stays null on success).
  useEffect(() => {
    if (!pending && state.error === null) {
      formRef.current?.reset();
    }
  }, [pending, state]);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-2">
      <div className="flex gap-2">
        {projectId && <input type="hidden" name="projectId" value={projectId} />}
        <Input
          name="text"
          placeholder='Add a task... try "call mom tomorrow 5pm #family"'
          required
          autoComplete="off"
        />
        <Button type="submit" disabled={pending}>
          {pending ? "Adding..." : "Add"}
        </Button>
      </div>
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
    </form>
  );
}
