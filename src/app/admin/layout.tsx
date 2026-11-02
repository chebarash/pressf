import type { Metadata } from "next";
import { adminSections } from "@/core/roles";
import { Sidebar } from "@/screens/admin/Sidebar";
import { s } from "@/screens/admin/ui";
import { staffViewer } from "@/server/admin/viewer";
import { chrome } from "@/server/admin/views";

export const metadata: Metadata = { title: "Admin", robots: { index: false, follow: false } };

/** Desktop admin: role-gated (404 for non-staff), sidebar stays mounted across sections. */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const viewer = await staffViewer();
  const { counts, me } = await chrome(viewer);
  const sections = adminSections(viewer.role).map(({ id, label }) => ({ id, label }));
  return (
    <div className={s.shell}>
      <Sidebar sections={sections} counts={counts} me={{ ...me, role: viewer.role === "admin" ? "Admin" : "Moderator" }} />
      {children}
    </div>
  );
}
