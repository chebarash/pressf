"use client";

import { usePlatform } from "@/platform/hooks";
import { CourseLoading as DesktopCourseLoading } from "@/screens/desktop/Loading";
import { CourseLoading } from "@/screens/mobile/Loading";

/** 4.17 Course · loading on mobile; the D4 list · detail · inspector skeleton on desktop. */
export default function Loading() {
  return usePlatform().mobile ? <CourseLoading /> : <DesktopCourseLoading />;
}
