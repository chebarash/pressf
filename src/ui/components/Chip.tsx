import Link from "next/link";
import type { MouseEventHandler } from "react";
import { XIcon } from "../icons";
import { cx, type ForcedState } from "./cx";
import s from "./Chip.module.css";

export type ChipProps = {
  label: string;
  /** Figma Size: M 36 · S 30. */
  size?: "m" | "s";
  selected?: boolean;
  disabled?: boolean;
  /** Shows the × (Figma `removable`). Pass onRemove to make it a button. */
  removable?: boolean;
  onRemove?: MouseEventHandler<HTMLButtonElement>;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  href?: string;
  state?: ForcedState;
  className?: string;
};

/** Filter / tag chip (Figma Chip 4007:1260). */
export function Chip({ label, size = "m", selected, disabled, removable, onRemove, onClick, href, state, className }: ChipProps) {
  const cls = cx(s.chip, size === "s" && s.s, selected && s.selected, disabled && s.disabled, size === "m" ? "t-label-md" : "t-label-sm", className);
  const x = removable ? (
    onRemove ? (
      <button type="button" className={s.remove} onClick={onRemove} disabled={disabled} aria-label={`Remove ${label}`}>
        <XIcon size={14} />
      </button>
    ) : (
      <XIcon size={14} />
    )
  ) : null;

  if (removable && onRemove) {
    return (
      <span className={cls} data-state={state}>
        <span>{label}</span>
        <span className={s.removeWrap}>{x}</span>
      </span>
    );
  }
  if (href && !disabled) {
    return (
      <Link href={href} className={cls} data-state={state} aria-current={selected ? "true" : undefined} data-haptic="select">
        <span>{label}</span>
        {x}
      </Link>
    );
  }
  return (
    <button type="button" className={cls} data-state={state} disabled={disabled} aria-pressed={selected ?? false} onClick={onClick}>
      <span>{label}</span>
      {x}
    </button>
  );
}
