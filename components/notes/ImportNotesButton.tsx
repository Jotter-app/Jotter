"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { importNotes } from "@/lib/actions/noteImport";

export function ImportNotesButton() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function handleFilesSelected(files: FileList | null) {
    if (!files || files.length === 0) return;

    const formData = new FormData();
    for (const file of files) formData.append("files", file);

    startTransition(async () => {
      const result = await importNotes(formData);
      if (!result.ok) {
        setMessage(result.error ?? "Import failed.");
        return;
      }
      setMessage(result.imported === 1 ? "Imported 1 note." : `Imported ${result.imported} notes.`);
      router.refresh();
    });

    // Lets the same file(s) be re-selected later without the browser
    // treating it as a no-op change (inputs only fire onChange when the
    // selected value actually differs from before).
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className="flex items-center gap-2">
      <input
        ref={inputRef}
        type="file"
        accept=".zip,.md"
        multiple
        className="hidden"
        onChange={(e) => handleFilesSelected(e.target.files)}
      />
      <Button
        size="sm"
        variant="ghost"
        disabled={isPending}
        onClick={() => inputRef.current?.click()}
      >
        {isPending ? "Importing..." : "Import"}
      </Button>
      {message && <span className="text-xs text-muted-foreground">{message}</span>}
    </div>
  );
}
