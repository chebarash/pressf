/**
 * Who can do what. Students use the app; moderators review uploads and reports;
 * admins run everything else. No role can see who rated what or who wrote an
 * Anonymous post — that is not a permission, it is not stored next to people.
 */

export type Role = "guest" | "student" | "moderator" | "admin";

export type Action =
  | "read:public" // course/professor names, ratings, OG cards
  | "read:files" // LMS and student files
  | "read:own" // own timetable, grades, attendance, notifications
  | "rate"
  | "upload"
  | "report"
  | "moderate:uploads"
  | "moderate:reports"
  | "admin:catalog"
  | "admin:people"
  | "admin:broadcast"
  | "admin:system"
  | "admin:audit";

const GRANTS: Record<Role, Action[]> = {
  guest: ["read:public"],
  student: ["read:public", "read:files", "read:own", "rate", "upload", "report"],
  moderator: ["read:public", "read:files", "read:own", "rate", "upload", "report", "moderate:uploads", "moderate:reports", "admin:audit"],
  admin: ["read:public", "read:files", "read:own", "rate", "upload", "report", "moderate:uploads", "moderate:reports", "admin:catalog", "admin:people", "admin:broadcast", "admin:system", "admin:audit"],
};

export const can = (role: Role, action: Action) => GRANTS[role].includes(action);

export const isStaff = (role: Role) => role === "moderator" || role === "admin";

/** Admin sections visible to a role, in sidebar order. */
export const ADMIN_SECTIONS: Array<{ id: string; label: string; needs: Action }> = [
  { id: "overview", label: "Overview", needs: "moderate:uploads" },
  { id: "uploads", label: "Uploads", needs: "moderate:uploads" },
  { id: "reports", label: "Reports", needs: "moderate:reports" },
  { id: "courses", label: "Courses & files", needs: "admin:catalog" },
  { id: "professors", label: "Professors", needs: "admin:catalog" },
  { id: "people", label: "People", needs: "admin:people" },
  { id: "broadcasts", label: "Broadcasts", needs: "admin:broadcast" },
  { id: "audit", label: "Audit log", needs: "admin:audit" },
  { id: "system", label: "System", needs: "admin:system" },
];

export const adminSections = (role: Role) => ADMIN_SECTIONS.filter((s) => can(role, s.needs));
