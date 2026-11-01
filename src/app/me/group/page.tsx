import { GroupPicker } from "@/components/GroupPicker";
import { removeGroup } from "@/lib/actions";
import { getCatalog } from "@/lib/catalog";
import { currentGroup } from "@/lib/group";

export const metadata = { title: "Choose group" };

export default async function GroupPage() {
  const [{ groups }, group] = await Promise.all([getCatalog(), currentGroup()]);
  return (
    <div className="wrap section" style={{ maxWidth: 680 }}>
      <h1 className="d-lg">{group ? "Change your group" : "Which group are you in?"}</h1>
      <p className="soft">We will show your timetable, your teachers and files for your courses.</p>
      {group && (
        <form action={removeGroup} className="row between">
          <span>Your group is <b>{group}</b></span>
          <button className="key btn sm">Remove group</button>
        </form>
      )}
      <GroupPicker groups={groups.map((g) => g.class)} current={group} />
    </div>
  );
}
