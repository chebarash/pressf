import { courseMetadata } from "@/server/og";
import { renderCourse } from "../course";

type Props = { params: Promise<{ code: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params }: Props) {
  return courseMetadata((await params).code);
}

export default function Page({ params, searchParams }: Props) {
  return renderCourse("files", params, searchParams);
}
