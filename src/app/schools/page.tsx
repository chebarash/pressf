import { SchoolCards } from "@/components/SchoolCards";
import { getCatalog } from "@/lib/catalog";

export const metadata = { title: "Schools" };

export default async function Schools() {
  const { schools } = await getCatalog();
  return (
    <div className="wrap section">
      <div><h1 className="d-title">Schools</h1><p className="body-lg soft">Every school at NewUU, with its programs, courses and teachers.</p></div>
      <div className="grid-3"><SchoolCards schools={schools} /></div>
    </div>
  );
}
