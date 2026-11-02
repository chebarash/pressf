"use client";

import type { ReactNode } from "react";
import { Sheet } from "@/ui/components";
import { BottomBar } from "./BottomBar";

type Action = { text: string; onClick: () => void; busy?: boolean };

/** A bottom sheet whose action is Telegram's MainButton (the kit's buttons in a browser). */
export function ActionSheet({ title, onClose, main, secondary, children }: { title: string; onClose: () => void; main: Action; secondary?: Action; children: ReactNode }) {
  return (
    <Sheet open onClose={onClose} title={title} heading={false} footer={<BottomBar inline main={main} secondary={secondary} />}>
      {children}
    </Sheet>
  );
}
