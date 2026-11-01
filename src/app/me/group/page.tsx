import { GroupPicker } from "@/components/GroupPicker";
import { getCatalog } from "@/lib/catalog";

export const metadata = { title: "Choose group" };

export default async function GroupPage() {
  const { groups } = await getCatalog();
  return (
    <div className="wrap section" style={{ maxWidth: 680 }}>
      <h1 className="d-lg">Which group are you in?</h1>
      <p className="soft">We will show your timetable, your teachers and files for your courses.</p>
      <GroupPicker groups={groups.map((g) => g.class)} />
    </div>
  );
}
