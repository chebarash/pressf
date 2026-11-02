"use client";

import { useState } from "react";
import { Tab } from "@/ui/components/Tabs";

/** Light / dark switch for the kit: sets data-theme on <html>. */
export function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark" | null>(null);
  const pick = (t: "light" | "dark") => {
    document.documentElement.dataset.theme = t;
    setTheme(t);
  };
  return (
    <div role="group" aria-label="Theme" style={{ display: "flex", gap: 4 }}>
      <Tab label="Light" active={theme === "light"} onClick={() => pick("light")} />
      <Tab label="Dark" active={theme === "dark"} onClick={() => pick("dark")} />
    </div>
  );
}
