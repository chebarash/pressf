"use client";

import { useRouter } from "next/navigation";

/** A compact filter for long lists. Picking a value opens the matching address. */
export function FilterSelect({ label, value, options }: { label: string; value: string; options: Array<{ label: string; href: string; value: string }> }) {
  const router = useRouter();
  return (
    <label className={`select ${value ? "on" : ""}`}>
      <span className="sr-only">{label}</span>
      <select value={value} onChange={(event) => router.push(options.find((option) => option.value === event.target.value)!.href)}>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
}
