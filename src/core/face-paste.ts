/**
 * "Paste spec": the operator looks at a professor's photo and sends back the
 * constructor parts as JSON; the admin pastes it into the face constructor.
 * Accepts a FaceSpec object, or `{ "spec": { … } }`. Parts left out keep the
 * constructor's current choice; unknown parts or options are refused, so a
 * typo never silently becomes a different face. Saving still goes through the
 * server's own check (buildFace).
 */
import { FACE_PART_ORDER, FACE_PARTS, FaceSpecSchema, type FacePart, type FaceSpec } from "@/core/face-parts";

export type PastedFace = { ok: true; spec: FaceSpec; filled: FacePart[] } | { ok: false; error: string };

export const PASTE_MAX_CHARS = 4000;

export function parsePastedFaceSpec(text: string, current: FaceSpec): PastedFace {
  const raw = text.trim();
  if (!raw) return { ok: false, error: "Paste the spec first" };
  if (raw.length > PASTE_MAX_CHARS) return { ok: false, error: "That is too long for a face spec" };
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return { ok: false, error: "That isn't valid JSON" };
  }
  if (value && typeof value === "object" && !Array.isArray(value) && "spec" in value) value = (value as { spec: unknown }).spec;
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ok: false, error: "The spec should be a JSON object of parts" };

  const parts = FACE_PART_ORDER as readonly string[];
  const entries = Object.entries(value as Record<string, unknown>);
  const unknown = entries.filter(([k]) => !parts.includes(k)).map(([k]) => k);
  if (unknown.length) return { ok: false, error: `Unknown part${unknown.length > 1 ? "s" : ""}: ${unknown.slice(0, 5).join(", ")}` };
  // Each part checked by the constructor's own schema, so new kinds of parts are covered too.
  const shape = FaceSpecSchema.shape as Record<string, { safeParse: (v: unknown) => { success: boolean } } | undefined>;
  const bad = entries.find(([k, v]) => !shape[k]?.safeParse(v).success);
  if (bad) {
    const [k, v] = bad;
    const options = FACE_PARTS[k as FacePart] as readonly unknown[];
    return { ok: false, error: `${k} can't be ${JSON.stringify(v)}: use ${options.join(", ")}` };
  }
  if (!entries.length) return { ok: false, error: "The spec has no parts" };

  const parsed = FaceSpecSchema.safeParse({ ...current, ...(value as object) });
  if (!parsed.success) return { ok: false, error: "That spec doesn't fit the constructor" };
  return { ok: true, spec: parsed.data as FaceSpec, filled: entries.map(([k]) => k as FacePart) };
}
