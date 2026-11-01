import { revalidatePath } from "next/cache";
import { Face, Tag } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { getCatalog } from "@/lib/catalog";
import { faceMap } from "@/lib/content";
import { db } from "@/lib/db";
import { faces } from "@/lib/db/schema";
import { putObject } from "@/lib/storage";

async function upload(form: FormData) {
  "use server";
  await requireAdmin();
  const id = String(form.get("id"));
  const file = form.get("face") as File;
  if (!file?.size || file.type !== "image/png") return;
  const key = await putObject(`faces/${id}.png`, Buffer.from(await file.arrayBuffer()), "image/png");
  await db().insert(faces).values({ teacherId: id, storageKey: key }).onConflictDoUpdate({ target: faces.teacherId, set: { storageKey: key, drawn: true, updatedAt: new Date() } });
  revalidatePath("/admin/faces");
}

export default async function AdminFaces() {
  const [catalog, map] = await Promise.all([getCatalog(), faceMap()]);
  const list = catalog.teachers.filter((t) => t.teaches.length).sort((a, b) => Number(map.has(a.id)) - Number(map.has(b.id)) || Number(!!b.photo_url) - Number(!!a.photo_url));
  return (
    <div className="stack">
      <h1 className="d-lg">Faces</h1>
      <p className="soft">Photos come from the university site. A PNG uploaded here replaces the photo and stays.</p>
      {list.map((t) => (
        <form key={t.id} action={upload} className="line-row" style={{ border: "2px solid var(--subtle)", background: "var(--surface)" }}>
          <input type="hidden" name="id" value={t.id} />
          <Face name={t.display_name} src={map.get(t.id)} />
          <div className="grow"><div className="label">{t.display_name}</div><div className="small soft">{t.photo_url ? "Has a photo" : "No photo"}</div></div>
          <Tag tone={map.has(t.id) ? "accent-tag" : "warm"}>{map.has(t.id) ? "Has picture" : "Default head"}</Tag>
          <input type="file" name="face" accept="image/png" aria-label={`Face for ${t.display_name}`} />
          <button className="key btn sm">Save</button>
        </form>
      ))}
    </div>
  );
}
