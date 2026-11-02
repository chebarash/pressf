import type { ProfessorsView } from "@/server/views";
import * as adapt from "./adapt";
import { ProfessorsScreen } from "./split/ProfessorsScreen";

/** Professors (G R). */
export default function DesktopProfessors({ data }: { data: ProfessorsView }) {
  return <ProfessorsScreen data={adapt.professors(data)} />;
}
