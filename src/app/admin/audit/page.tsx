import { Audit } from "@/screens/admin/Audit";
import { requireSection } from "@/server/admin/viewer";
import { auditPage } from "@/server/admin/views";

const uuid = /^[0-9a-f-]{36}$/;

export default async function AdminAuditPage({ searchParams }: { searchParams: Promise<{ actor?: string; action?: string }> }) {
  await requireSection("audit");
  const sp = await searchParams;
  const data = await auditPage({ actor: sp.actor && uuid.test(sp.actor) ? sp.actor : undefined, action: sp.action?.slice(0, 40) || undefined });
  return <Audit data={data} />;
}
