import Link from "next/link";
import { notFound } from "next/navigation";
import { getUser } from "@/lib/auth";

export const metadata = { title: "Admin", robots: { index: false } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser();
  if (!user?.isAdmin) notFound();
  return (
    <div className="wrap section">
      <div className="stack" style={{ "--gap": "8px" } as React.CSSProperties}>
        <div className="caps accent">Admin</div>
        <nav className="tabs" aria-label="Admin"><Link className="tab" href="/admin">Syllabi</Link><Link className="tab" href="/admin/faces">Faces</Link></nav>
      </div>
      {children}
    </div>
  );
}
