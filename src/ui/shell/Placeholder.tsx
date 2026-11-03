import { getPlatform, isMobile } from "@/platform/server";
import { PageHeader, SkeletonCard } from "./PageHeader";

/** Empty route shell with its title, until the screen lands. */
export async function Placeholder({ title, subtitle }: { title: string; subtitle?: string }) {
  const desktop = !isMobile(await getPlatform());
  return (
    <>
      <PageHeader title={title} subtitle={subtitle} desktop={desktop} />
      <div className="sh-placeholder">
        <SkeletonCard />
      </div>
    </>
  );
}
