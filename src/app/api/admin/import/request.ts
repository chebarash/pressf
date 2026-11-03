import { z } from "zod";
import { can } from "@/core/roles";
import { getUser } from "@/lib/auth";
import { cronAuthorized } from "@/app/api/cron/auth";
import { roleOf } from "@/server/identity";
import { ImportError, type ImportDecision, type ImportMeta } from "@/server/import";

/**
 * Who may import: the import script with `Authorization: Bearer <CRON_SECRET>`,
 * or a signed-in admin (for an admin screen later). Null for everyone else.
 */
export async function importActor(request: Request): Promise<{ id: string | null } | null> {
  if (cronAuthorized(request)) return { id: null };
  if (request.headers.get("authorization")) return null;
  const user = await getUser().catch(() => null);
  if (user && can(await roleOf(user.id), "admin:catalog")) return { id: user.id };
  return null;
}

const Meta = z.object({
  channel: z.object({ id: z.union([z.string().regex(/^[\w-]{1,64}$/), z.number().int()]), name: z.string().trim().min(1).max(200) }),
  postId: z.union([z.string().regex(/^\d{1,12}$/), z.number().int().nonnegative()]),
  date: z.string().max(40).nullish(),
  text: z.string().max(20_000).nullish(),
  fileName: z.string().min(1).max(500),
  mime: z.string().max(200).nullish(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/).nullish(),
  size: z.number().int().positive().nullish(),
});

const Decision = z.object({
  course: z.string().min(1).max(20),
  type: z.string(),
  title: z.string().min(1).max(200),
  term: z.string().max(40).nullish(),
  week: z.number().int().nullish(),
  exam: z.enum(["midterm", "final", "quiz"]).nullish(),
  skip: z.boolean().optional(),
});

function json(raw: FormDataEntryValue | null, what: string) {
  if (typeof raw !== "string") throw new ImportError(`${what} is required`);
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new ImportError(`${what} is not JSON`);
  }
}

const issues = (e: z.ZodError) => e.issues.map((i) => i.path.join(".") || i.message).join(", ");

/** The multipart body: `meta` (JSON), `file` (the bytes; plan may omit it for a very large file), `decision` (JSON, commit only). */
export async function readImport(request: Request, withDecision: boolean) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    throw new ImportError("Send multipart form data");
  }
  const meta = Meta.safeParse(json(form.get("meta"), "meta"));
  if (!meta.success) throw new ImportError(`Bad meta: ${issues(meta.error)}`);
  const file = form.get("file");
  const bytes = file && typeof file !== "string" ? new Uint8Array(await file.arrayBuffer()) : null;
  let decision: ImportDecision | null = null;
  if (withDecision) {
    const parsed = Decision.safeParse(json(form.get("decision"), "decision"));
    if (!parsed.success) throw new ImportError(`Bad decision: ${issues(parsed.error)}`);
    decision = parsed.data as ImportDecision;
  }
  return { meta: meta.data as ImportMeta, bytes, decision };
}

export function failed(error: unknown) {
  if (error instanceof ImportError) return Response.json({ error: error.message }, { status: error.status });
  console.error("Import failed", error);
  return Response.json({ error: "failed" }, { status: 500 });
}
