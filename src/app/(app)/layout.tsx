import { Shell } from "@/ui/shell/Shell";

/** Every app screen renders inside the shell, which stays mounted between them. */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <Shell>{children}</Shell>;
}
