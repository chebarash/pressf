"use client";

import { useState } from "react";
import { chooseGroup } from "@/lib/actions";

export function GroupPicker({ groups, current }: { groups: string[]; current?: string | null }) {
  const [q, setQ] = useState("");
  const shown = groups.filter((g) => g.toLowerCase().includes(q.toLowerCase())).slice(0, 24);
  return (
    <form action={chooseGroup} className="stack">
      <div className="search" style={{ cursor: "text" }}><input id="group-search" autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search your group, like FCS 1" aria-label="Search group" autoComplete="off" /></div>
      <div className="row" style={{ "--gap": "8px" } as React.CSSProperties}>{shown.map((g) => <button key={g} className={`chip ${g === current ? "on" : ""}`} name="group" value={g}>{g}</button>)}</div>
      {!shown.length && <p className="soft">No group with that name.</p>}
    </form>
  );
}
