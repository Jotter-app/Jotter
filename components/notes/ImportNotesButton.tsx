"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { createImportUploadUrl, importNotes, type UploadedImportFile } from "@/lib/actions/noteImport";

const UPLOAD_FAILED_MESSAGE = "Import failed -- the upload didn't go through. Please try again.";

export function ImportNotesButton() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  function handleFilesSelected(files: FileList | null) {
    if (!files || files.length === 0) return;
    const fileList = Array.from(files);

    startTransition(async () => {
      const supabase = createClient();
      const uploads: UploadedImportFile[] = [];

      try {
        // Each file uploads straight from the browser to Supabase Storage
        // via a signed URL, bypassing this app's own server entirely --
        // Vercel's Serverless Function request-body limit (~4.5MB, not
        // configurable) would otherwise reject a real vault export with
        // attachments before the import logic ever ran.
        for (const file of fileList) {
          const prepared = await createImportUploadUrl(file.name);
          if (!prepared.ok) {
            setResult({ ok: false, text: prepared.error });
            return;
          }
          const { error: uploadError } = await supabase.storage
            .from("note-imports")
            .uploadToSignedUrl(prepared.path, prepared.token, file);
          if (uploadError) {
            setResult({ ok: false, text: UPLOAD_FAILED_MESSAGE });
            return;
          }
          uploads.push({ path: prepared.path, name: file.name });
        }

        const outcome = await importNotes(uploads);
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
