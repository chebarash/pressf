import Link from "next/link";
import type { School } from "@/lib/catalog";
import { Arrow } from "./ui";

const TINT: Record<string, string> = { computing: "computing", engineering: "engineering", management: "management", humanities: "humanities", medicine: "medicine" };

export function SchoolCards({ schools }: { schools: School[] }) {
  return schools.map((school) => (
    <Link key={school.slug} className={`card school ${TINT[school.slug] ?? ""}`} href={`/schools/${school.slug}`}>
      <div><div className="caps">School of</div><h3 className="d-sm">{school.name.replace(/^School of /, "")}</h3></div>
      <div className="row between"><span className="small grow">{school.programs.map((p) => p.name).join(", ")}</span><Arrow /></div>
    </Link>
  ));
}
