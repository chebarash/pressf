"use client";

import { usePlatform } from "@/platform/hooks";
import { PageLoading } from "@/screens/desktop/Loading";
import { TimetableLoading } from "@/screens/mobile/Loading";

/** 3.7 Timetable · loading on mobile; the desktop frame keeps its sidebar and shows a desktop skeleton. */
export default function Loading() {
  return usePlatform().mobile ? <TimetableLoading /> : <PageLoading title="Timetable" />;
}
