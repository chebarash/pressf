import { Button, EmptyState } from "@/ui/components";

/** 404 on both platforms: the EmptyState with the default face, a way home and a way to look. */
export default function NotFound() {
  return (
    <main style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: "calc(var(--sh-top, 0px) + 24px) 16px 32px", background: "var(--bg-page)" }}>
      <EmptyState
        face="default"
        title="Nothing here"
        text="This page moved, or the link was mistyped. Your courses, files and timetable are all one tap away."
        action={
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
            <Button href="/" label="Go to Today" />
            <Button href="/search" variant="secondary" label="Search" />
          </div>
        }
      />
    </main>
  );
}
