"use client";

import { usePathname } from "next/navigation";
import { usePlatform } from "@/platform/hooks";
import { DesktopLoading } from "@/screens/desktop/Loading";
import { SkeletonPage } from "@/ui/shell/PageHeader";
import { LoadingTitle } from "./LoadingTitle";

/**
 * 1.1 Launch · loading on mobile: the frame stays, the screen streams in under its own title.
 * Desktop keeps the sidebar and shows the skeleton of the D screen that is coming.
 */
export default function Loading() {
  const { mobile } = usePlatform();
  const pathname = usePathname() ?? "/";
  if (!mobile) return <DesktopLoading pathname={pathname} />;
  return <SkeletonPage title={<LoadingTitle />} />;
}
