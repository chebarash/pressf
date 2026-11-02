import { rateMetadata } from "@/server/og";
import { Placeholder } from "@/ui/shell/Placeholder";

export const generateMetadata = () => rateMetadata();

export default function Page() {
  return <Placeholder title="Rate" />;
}
