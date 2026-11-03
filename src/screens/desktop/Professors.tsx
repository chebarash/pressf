import type { ProfessorsView } from "@/server/views";
import * as adapt from "./adapt";
import { ProfessorsScreen } from "./split/ProfessorsScreen";

/** Professors (F R). */
export default function DesktopProfessors({ data, school = null, dept = null }: { data: ProfessorsView; school?: string | null; dept?: string | null }) {
  return <ProfessorsScreen key={`${school}|${dept}`} data={adapt.professors(data, { school, dept })} />;
}
