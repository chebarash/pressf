import type { NextSemesterView } from "@/server/views";
import * as adapt from "./adapt";
import { NextScreen } from "./split/NextScreen";

/** D16 Next semester. */
export default function DesktopNext({ data }: { data: NextSemesterView }) {
  return <NextScreen data={adapt.nextSemester(data)} />;
}
