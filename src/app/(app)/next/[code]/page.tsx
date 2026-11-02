import { nextMetadata } from "@/server/og";
import { Placeholder } from "@/ui/shell/Placeholder";

type Props = { params: Promise<{ code: string }> };

export async function generateMetadata({ params }: Props) {
  return nextMetadata(decodeURIComponent((await params).code));
}

export default function Page() {
  return <Placeholder title="Next semester" />;
}
