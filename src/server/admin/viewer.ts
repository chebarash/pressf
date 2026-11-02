import { notFound } from "next/navigation";
import { cache } from "react";
import { isStaff, type Role } from "@/core/roles";
import { getUser } from "@/lib/auth";
import { roleOf } from "@/server/identity";
import { canOpen } from "./access";

/** The signed-in staff member, or a 404 for everyone else (the admin does not admit it exists). */
export const staffViewer = cache(async (): Promise<{ id: string; email: string; role: Role }> => {
  const user = await getUser();
  if (!user) notFound();
  const role = await roleOf(user.id);
  if (!isStaff(role)) notFound();
  return { id: user.id, email: user.email, role };
});

/** Guards one admin section page on the server. */
export async function requireSection(section: string) {
  const viewer = await staffViewer();
  if (!canOpen(viewer.role, section)) notFound();
  return viewer;
}

/** For server actions: the actor id (permission is checked again inside every op). */
export async function actorId() {
  const user = await getUser();
  if (!user) throw new Error("Sign in first");
  return user.id;
}
