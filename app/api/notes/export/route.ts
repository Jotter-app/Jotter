import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUserId } from "@/lib/supabase/session";
import { buildNotesExport, type ExportScope } from "@/lib/notes/exportNotes";

const scopeSchema = z.union([
  z.object({ scope: z.literal("all") }),
  z.object({ scope: z.literal("folder"), id: z.string().uuid() }),
  z.object({ scope: z.literal("note"), id: z.string().uuid() }),
]);

export async function GET(request: Request) {
  const { supabase, userId } = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const url = new URL(request.url);
  const parsed = scopeSchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid export scope" }, { status: 400 });
  }

  const scope: ExportScope =
    parsed.data.scope === "all" ? { type: "all" } : { type: parsed.data.scope, id: parsed.data.id };

  const result = await buildNotesExport(supabase, userId, scope);
  if (!result) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(result.data), {
    headers: {
      "Content-Type": result.contentType,
      "Content-Disposition": `attachment; filename="${result.filename}"`,
    },
  });
}
