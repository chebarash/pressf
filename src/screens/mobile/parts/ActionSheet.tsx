"use client";

import type { ReactNode } from "react";
import { Sheet } from "@/ui/shell/overlays";
import { BottomBar } from "./BottomBar";

type Action = { text: string; onClick: () => void; busy?: boolean };

/** A shell bottom sheet whose action is the MainButton (stacked over the screen's own). */
export function ActionSheet({ title, onClose, main, secondary, className, children }: { title: string; onClose: () => void; main: Action; secondary?: Action; className?: string; children: ReactNode }) {
  return (
    <Sheet label={title} onClose={onClose} className={className}>
      {children}
      <BottomBar main={main} secondary={secondary} />
    </Sheet>
  );
}
