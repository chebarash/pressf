import { professorMetadata } from "@/server/og";
import { Placeholder } from "@/ui/shell/Placeholder";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props) {
  return professorMetadata(decodeURIComponent((await params).id));
}

export default function Page() {
  return <Placeholder title="Professor" />;
}
