import { courseMetadata } from "@/server/og";
import { Placeholder } from "@/ui/shell/Placeholder";

type Props = { params: Promise<{ code: string }> };

export async function generateMetadata({ params }: Props) {
  return courseMetadata(decodeURIComponent((await params).code));
}

export default function Page() {
  return <Placeholder title="Course" />;
}
