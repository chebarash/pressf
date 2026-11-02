import type { ReactNode } from "react";
import { cx } from "./cx";
import { Face } from "./Face";
import s from "./EmptyState.module.css";

export type EmptyStateProps = {
  title: string;
  text?: ReactNode;
  /** Usually a secondary <Button icon>. */
  action?: ReactNode;
  /** Mascot by default; "default" shows the 404 face. */
  face?: "mascot" | "default" | false;
  className?: string;
};

/** Empty / error state (Figma EmptyState 4008:1548). */
export function EmptyState({ title, text, action, face = "mascot", className }: EmptyStateProps) {
  return (
    <div className={cx(s.empty, className)}>
      {face ? <Face kind={face} size={120} /> : null}
      <h2 className={cx(s.title, "t-display-xs")}>{title}</h2>
      {text ? <p className={cx(s.text, "t-body-md")}>{text}</p> : null}
      {action ? <div className={s.action}>{action}</div> : null}
    </div>
  );
}
