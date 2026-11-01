import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { faces } from "@/lib/db/schema";
import { signedUrl } from "@/lib/storage";
import { defaultFace, imageData } from "./card";

/** A teacher's face as data, since image rendering cannot follow the signed redirect. */
export async function faceData(id: string) {
  const [face] = await db().select().from(faces).where(eq(faces.teacherId, id));
  return (face && (await imageData(await signedUrl(face.storageKey)))) ?? defaultFace();
}
