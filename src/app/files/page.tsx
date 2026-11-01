import Link from "next/link";
import { FileRow } from "@/components/Cards";
import { Empty } from "@/components/ui";
import { publishedFiles } from "@/lib/content";
import { MATERIAL_KINDS } from "@/lib/db/schema";

export const metadata = { title: "Files" };
type Props = { searchParams: Promise<{ type?: string }> };

export default async function Files({ searchParams }: Props) {
  const { type } = await searchParams;
  const all = await publishedFiles();
  const list = type ? all.filter((f) => f.type === type) : all;
  return (
    <div className="wrap section">
      <h1 className="d-title">Files</h1>
      <p className="body-lg soft">Syllabi, past exams, mocks and solutions shared by students.</p>
      <div className="row" style={{ "--gap": "8px" } as React.CSSProperties}>
        <Link className={`chip ${!type ? "on" : ""}`} href="/files">All</Link>
        {MATERIAL_KINDS.map((kind) => <Link key={kind} className={`chip ${type === kind ? "on" : ""}`} href={`/files?type=${kind}`}>{kind[0].toUpperCase() + kind.slice(1)}</Link>)}
      </div>
      <div className="stack" style={{ "--gap": "12px" } as React.CSSProperties}>{list.map((file) => <FileRow key={file.id} file={file} />)}</div>
      {!list.length && <Empty title="Nothing here yet" action={<a className="key btn" href="https://t.me/pupressfbot" target="_blank" rel="noreferrer">Send on Telegram</a>}>Send past exams or notes to our Telegram bot. We check them and add them here.</Empty>}
    </div>
  );
}
