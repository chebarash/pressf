import Link from "next/link";
import { FileRow } from "@/components/Cards";
import { Pager, PER_PAGE } from "@/components/Pager";
import { Empty } from "@/components/ui";
import { publishedFiles } from "@/lib/content";
import { MATERIAL_KINDS } from "@/lib/db/schema";

export const metadata = { title: "Files" };
type Props = { searchParams: Promise<{ type?: string; q?: string; page?: string }> };

export default async function Files({ searchParams }: Props) {
  const { type, q = "", page = "1" } = await searchParams;
  const all = await publishedFiles();
  const needle = q.toLowerCase();
  const list = all.filter((f) => (!type || f.type === type) &&
    (!needle || `${f.fileName} ${f.courseName ?? ""} ${f.courseCode ?? ""}`.toLowerCase().includes(needle)));
  const n = Math.max(1, Number(page) || 1);
  return (
    <div className="wrap section">
      <h1 className="d-title">Files</h1>
      <p className="body-lg soft">Syllabi, past exams, mocks and solutions shared by students.</p>
      <form action="/files">
        {type && <input type="hidden" name="type" value={type} />}
        <input className="input" name="q" defaultValue={q} placeholder="Search by course or file" aria-label="Search files" />
      </form>
      <div className="row" style={{ "--gap": "8px" } as React.CSSProperties}>
        <Link className={`chip ${!type ? "on" : ""}`} href="/files">All</Link>
        {MATERIAL_KINDS.map((kind) => <Link key={kind} className={`chip ${type === kind ? "on" : ""}`} href={`/files?type=${kind}`}>{kind[0].toUpperCase() + kind.slice(1)}</Link>)}
      </div>
      <div className="stack" style={{ "--gap": "12px" } as React.CSSProperties}>{list.slice((n - 1) * PER_PAGE, n * PER_PAGE).map((file) => <FileRow key={file.id} file={file} />)}</div>
      <Pager page={n} pages={Math.ceil(list.length / PER_PAGE)} query={{ q: q || undefined, type }} />
      {!list.length && <Empty title="Nothing here yet" action={<a className="key btn" href="https://t.me/pupressfbot" target="_blank" rel="noreferrer">Send on Telegram</a>}>Send past exams or notes to our Telegram bot. We check them and add them here.</Empty>}
    </div>
  );
}
