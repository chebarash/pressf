/**
 * A6 Professors · Profile and Unmatched from newuu.uz. Reads for the admin
 * screens and the writes behind them: profile overrides, linking a faculty-site
 * person to a professor, dismissing one, and starting an import. Every write
 * checks `admin:catalog`, writes the audit log and expires the professor caches.
 */
import { and, eq, inArray, ne } from "drizzle-orm";
import { z } from "zod";
import { mergeProfile, PROFILE_FIELDS, validateOverride, type ProfileFields } from "@/core/faculty";
import { teacherName } from "@/core/people";
import { createIndex } from "@/core/search";
import { db } from "@/lib/db";
import { facultyPeople, lmsTeachers, teacherAliases, teacherOverrides } from "@/lib/db/schema";
import { audit } from "@/server/audit";
import { importFaculty, lastImport, unmatchedPeople } from "@/server/faculty";
import { invalidate, TAGS } from "@/server/views/cache";
import { authorize } from "./access";
import { AdminError } from "./ops";

type Teacher = { id: string; firstName: string | null; lastName: string | null; surName: string | null; position: string | null; department: string | null };

async function currentTeachers(): Promise<Teacher[]> {
  const [rows, aliases] = await Promise.all([
    db().select({ id: lmsTeachers.id, firstName: lmsTeachers.firstName, lastName: lmsTeachers.lastName, surName: lmsTeachers.surName, position: lmsTeachers.position, department: lmsTeachers.department }).from(lmsTeachers),
    db().select({ oldId: teacherAliases.oldId }).from(teacherAliases),
  ]);
  const merged = new Set(aliases.map((a) => a.oldId));
  return rows.filter((t) => !merged.has(t.id));
}

const overrideFields = (o: typeof teacherOverrides.$inferSelect | undefined | null): ProfileFields | null =>
  o ? (Object.fromEntries(PROFILE_FIELDS.map((k) => [k, o[k] ?? null])) as ProfileFields) : null;

/** Profile tab: professors (searchable), each with where its profile comes from; the selected one in three columns. */
export async function profilesPage(q: string, selectedId: string | undefined) {
  const [teachers, linked, overrides] = await Promise.all([
    currentTeachers(),
    db().select({ teacherId: facultyPeople.teacherId }).from(facultyPeople),
    db().select({ teacherId: teacherOverrides.teacherId }).from(teacherOverrides),
  ]);
  const hasSite = new Set(linked.map((l) => l.teacherId).filter(Boolean));
  const hasOver = new Set(overrides.map((o) => o.teacherId));
  const row = (t: Teacher) => ({ id: t.id, name: teacherName(t), imported: hasSite.has(t.id), edited: hasOver.has(t.id) });
  const term = q.trim();
  const list = term
    ? createIndex(teachers.map((t) => ({ item: t, text: teacherName(t) })), { names: true }).search(term, 100).map((h) => row(h.item))
    : teachers.map(row).sort((a, b) => Number(b.edited) - Number(a.edited) || Number(b.imported) - Number(a.imported) || a.name.localeCompare(b.name)).slice(0, 200);
  const id = selectedId ?? list[0]?.id;
  return {
    q: term,
    total: teachers.length,
    imported: hasSite.size,
    edited: hasOver.size,
    list,
    selected: id ? await profileDetail(id) : null,
  };
}

/** One professor's profile: LMS values, imported values, overrides and what the page shows. */
export async function profileDetail(teacherId: string) {
  const [[t], [site], [over]] = await Promise.all([
    db().select().from(lmsTeachers).where(eq(lmsTeachers.id, teacherId)),
    db().select().from(facultyPeople).where(eq(facultyPeople.teacherId, teacherId)).limit(1),
    db().select().from(teacherOverrides).where(eq(teacherOverrides.teacherId, teacherId)),
  ]);
  if (!t) return null;
  const lms: Partial<ProfileFields> = { name: teacherName(t), position: t.position, department: t.department };
  const imported: Partial<ProfileFields> | null = site ? { name: site.name, position: site.position, department: site.department, school: site.school, office: site.office, email: site.email } : null;
  const override = overrideFields(over);
  // The page shows the given name + surname, never the site's full name with patronymic.
  const shown = mergeProfile(lms, imported ? { ...imported, name: null } : null, override);
  return {
    id: t.id,
    lms,
    imported,
    site: site ? { siteId: site.siteId, match: site.match, fetchedAt: site.fetchedAt.toISOString() } : null,
    override,
    shown,
    updatedAt: over?.updatedAt.toISOString() ?? null,
  };
}

/** Unmatched tab: site people without a professor, their candidates by name, and the last import. */
export async function unmatchedPage(q: string, selectedSiteId: number | undefined) {
  const [people, last, teachers] = await Promise.all([unmatchedPeople(), lastImport(), currentTeachers()]);
  const byId = new Map(teachers.map((t) => [t.id, t]));
  const card = (id: string) => {
    const t = byId.get(id);
    return t ? { id, name: teacherName(t), line: [t.position, t.department].filter(Boolean).join(" · ") } : null;
  };
  const selected = people.find((p) => p.siteId === selectedSiteId) ?? people[0] ?? null;
  const term = q.trim();
  const search = selected && term
    ? createIndex(teachers.map((t) => ({ item: t.id, text: teacherName(t) })), { names: true }).search(term, 8).map((h) => card(h.item)).filter((c) => !!c)
    : [];
  return {
    q: term,
    last,
    people: people.map((p) => ({ siteId: p.siteId, name: p.name, line: [p.position, p.department ?? p.school].filter(Boolean).join(" · "), email: p.email, why: p.candidates.length ? `${p.candidates.length} possible` : "No name match" })),
    selected: selected
      ? {
          siteId: selected.siteId, name: selected.name, position: selected.position, department: selected.department, school: selected.school, office: selected.office, email: selected.email,
          candidates: selected.candidates.map(card).filter((c) => !!c),
          search,
        }
      : null,
  };
}

/* ───────── writes ───────── */

const teacherIdSchema = z.string().trim().min(1).max(40);
const siteIdSchema = z.number().int().positive();

async function requireTeacher(id: string) {
  const [t] = await db().select({ id: lmsTeachers.id }).from(lmsTeachers).where(eq(lmsTeachers.id, id));
  if (!t) throw new AdminError("Professor not found");
}

/** Saves the admin's profile fields; empty fields fall back to the imported/LMS value. */
export async function saveProfile(actorId: string, teacherId: string, input: Partial<ProfileFields>) {
  await authorize(actorId, "admin:catalog");
  const id = teacherIdSchema.parse(teacherId);
  await requireTeacher(id);
  let fields: ProfileFields;
  try {
    fields = validateOverride(input);
  } catch (e) {
    throw new AdminError(e instanceof Error ? e.message : "Check the fields");
  }
  const [before] = await db().select().from(teacherOverrides).where(eq(teacherOverrides.teacherId, id));
  const changed = PROFILE_FIELDS.filter((k) => (before?.[k] ?? null) !== fields[k]);
  if (!changed.length) return { message: "Nothing changed" };
  if (PROFILE_FIELDS.every((k) => fields[k] === null)) await db().delete(teacherOverrides).where(eq(teacherOverrides.teacherId, id));
  else
    await db()
      .insert(teacherOverrides)
      .values({ teacherId: id, ...fields, updatedBy: actorId, updatedAt: new Date() })
      .onConflictDoUpdate({ target: teacherOverrides.teacherId, set: { ...fields, updatedBy: actorId, updatedAt: new Date() } });
  await audit(actorId, "teacher.profile", `teacher:${id}`, Object.fromEntries(changed.map((k) => [k, { from: before?.[k] ?? null, to: fields[k] }])));
  invalidate(TAGS.teacher(id), TAGS.catalog);
  return { message: "Profile saved" };
}

/** Drops every override: the page shows the imported/LMS values again. */
export async function resetProfile(actorId: string, teacherId: string) {
  await authorize(actorId, "admin:catalog");
  const id = teacherIdSchema.parse(teacherId);
  const [before] = await db().delete(teacherOverrides).where(eq(teacherOverrides.teacherId, id)).returning();
  if (!before) return { message: "Already using imported values" };
  await audit(actorId, "teacher.profile.reset", `teacher:${id}`, { cleared: Object.fromEntries(PROFILE_FIELDS.filter((k) => before[k] !== null).map((k) => [k, before[k]])) });
  invalidate(TAGS.teacher(id), TAGS.catalog);
  return { message: "Reset to imported values" };
}

/** Links a faculty-site person to a professor by hand; it survives every import. */
export async function assignPerson(actorId: string, siteId: number, teacherId: string) {
  await authorize(actorId, "admin:catalog");
  const sid = siteIdSchema.parse(siteId);
  const id = teacherIdSchema.parse(teacherId);
  await requireTeacher(id);
  const [person] = await db().select().from(facultyPeople).where(eq(facultyPeople.siteId, sid));
  if (!person) throw new AdminError("That person is no longer listed — reload");
  // One site person per professor: an automatic link elsewhere gives way to the admin's choice.
  const others = await db().select({ siteId: facultyPeople.siteId, match: facultyPeople.match }).from(facultyPeople).where(and(eq(facultyPeople.teacherId, id), ne(facultyPeople.siteId, sid)));
  if (others.some((o) => o.match === "manual")) throw new AdminError("This professor already has a newuu.uz person linked by hand");
  if (others.length) await db().update(facultyPeople).set({ teacherId: null, match: "none" }).where(inArray(facultyPeople.siteId, others.map((o) => o.siteId)));
  await db().update(facultyPeople).set({ teacherId: id, match: "manual" }).where(eq(facultyPeople.siteId, sid));
  await audit(actorId, "teacher.newuu.assign", `teacher:${id}`, { siteId: sid, name: person.name, previous: person.teacherId });
  invalidate(TAGS.catalog, TAGS.teacher(id), ...(person.teacherId ? [TAGS.teacher(person.teacherId)] : []));
  return { message: `Linked ${person.name}` };
}

/** Keeps a site person out of the Unmatched list (not a professor we list, or no LMS teacher). */
export async function dismissPerson(actorId: string, siteId: number) {
  await authorize(actorId, "admin:catalog");
  const sid = siteIdSchema.parse(siteId);
  const [person] = await db().update(facultyPeople).set({ teacherId: null, match: "dismissed" }).where(eq(facultyPeople.siteId, sid)).returning();
  if (!person) throw new AdminError("That person is no longer listed — reload");
  await audit(actorId, "teacher.newuu.dismiss", `newuu:${sid}`, { name: person.name });
  return { message: `Dismissed ${person.name}` };
}

/** "Import from newuu.uz now": starts the import in the background (`schedule`, e.g. `after`). */
export async function startImport(actorId: string, schedule: (job: () => Promise<unknown>) => void) {
  await authorize(actorId, "admin:catalog");
  await audit(actorId, "job.run", "job:newuu-import");
  schedule(() => importFaculty().catch((e) => console.error("newuu import failed", e)));
  return { message: "Import started — takes about two minutes" };
}
