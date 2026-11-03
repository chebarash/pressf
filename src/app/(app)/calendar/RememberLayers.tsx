"use client";

import { useEffect } from "react";
import { rememberCalendarLayers } from "@/screens/mobile/mc/actions";

/**
 * Saves the layers the student just picked, so their calendar feed shows the
 * same. Runs after the page shows (a prefetched link never saves anything).
 */
export function RememberLayers({ layers }: { layers: string[] }) {
  const key = layers.join(",");
  useEffect(() => {
    void rememberCalendarLayers(key ? key.split(",") : []).catch(() => {});
  }, [key]);
  return null;
}
