import type { SearchView } from "@/server/views";
import * as adapt from "./adapt";
import { SearchScreen } from "./split/SearchScreen";

/** D14 Search / D17 Search · nothing found. */
export default function DesktopSearch({ data }: { data: SearchView }) {
  return <SearchScreen data={adapt.search(data)} />;
}
