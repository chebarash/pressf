import { Shell } from "@/ui/shell/Shell";

/**
 * Every app screen renders inside the shell, which stays mounted between them.
 * `modal`: the rate dialog opened from a page stays over that page (an
 * intercepted /rate/[courseId]); a direct visit renders /rate as its own page.
 */
export default function AppLayout({ children, modal }: { children: React.ReactNode; modal: React.ReactNode }) {
  return (
    <Shell>
      {children}
      {modal}
    </Shell>
  );
}
