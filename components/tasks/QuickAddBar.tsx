"use client";

import { useActionState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createTaskFromQuickAdd, type QuickAddFormState } from "@/lib/actions/tasks";

const initialState: QuickAddFormState = { error: null };

export function QuickAddBar() {
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
