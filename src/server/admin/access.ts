import { adminSections, can, isStaff, type Action, type Role } from "@/core/roles";
import { roleOf } from "@/server/identity";

/** Thrown when someone without the right role reaches an admin action. */
export class Forbidden extends Error {
  constructor(action: string) {
    super(`Not allowed: ${action}`);
  }
}

/** The role of the actor, or throws unless it grants `action`. Every admin write calls this first. */
export async function authorize(actorId: string | null | undefined, action: Action): Promise<Role> {
  if (!actorId) throw new Forbidden(action);
  const role = await roleOf(actorId);
  if (!can(role, action)) throw new Forbidden(action);
  return role;
}

export const SECTION_ACTION: Record<string, Action> = Object.fromEntries(
  adminSections("admin").map((s) => [s.id, s.needs])
);

/** Whether a role may open an admin section (sidebar id). */
export const canOpen = (role: Role, section: string) =>
  isStaff(role) && adminSections(role).some((s) => s.id === section);
