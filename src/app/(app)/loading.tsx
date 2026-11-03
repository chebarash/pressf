import { SkeletonPage } from "@/ui/shell/PageHeader";
import { LoadingTitle } from "./LoadingTitle";

/** 1.1 Launch · loading: the frame stays, the screen streams in under its own title ("Today" at launch). */
export default function Loading() {
  return <SkeletonPage title={<LoadingTitle />} />;
}
