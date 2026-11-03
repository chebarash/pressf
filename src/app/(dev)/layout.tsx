import { notFound } from "next/navigation";

/** The UI kit and screen previews run on fixtures: local only, a 404 in production. */
export default function DevLayout({ children }: { children: React.ReactNode }) {
  if (process.env.NODE_ENV === "production") notFound();
  return children;
}
