"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { importNotes } from "@/lib/actions/noteImport";

// The upload itself (a zip's raw bytes, attachments included even though
// they're discarded server-side) can exceed the Server Action body-size
// limit before importNotes ever runs -- that fails as a framework-level
// request error, not a normal returned result, so it needs its own catch
// here rather than an `ok: false` branch.
const UPLOAD_FAILED_MESSAGE =
  "Import failed -- the upload didn't go through. If the file is very large, try a smaller batch or split it into multiple zips.";

export function ImportNotesButton() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  function handleFilesSelected(files: FileList | null) {
    if (!files || files.length === 0) return;

    const formData = new FormData();
    for (const file of files) formData.append("files", file);

    startTransition(async () => {
      try {
        const outcome = await importNotes(formData);
        if (!outcome.ok) {
          setResult({ ok: false, text: outcome.error ?? "Import failed." });
          return;
        }
        setResult({
          ok: true,
          text: outcome.imported === 1 ? "Imported 1 note." : `Imported ${outcome.imported} notes.`,
        });
        router.refresh();
      } catch {
        setResult({ ok: false, text: UPLOAD_FAILED_MESSAGE });
      }
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
      {result && (
        <span className={`text-xs ${result.ok ? "text-muted-foreground" : "text-destructive"}`}>{result.text}</span>
      )}
    </div>
  );
}
