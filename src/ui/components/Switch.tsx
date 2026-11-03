import { useId, type InputHTMLAttributes } from "react";
import { cx } from "./cx";
import s from "./Switch.module.css";

export type SwitchProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "size"> & {
  /** Row title, e.g. "Morning digest". */
  label: string;
  /** Second line, e.g. "07:30 on school days". */
  description?: string;
  /** "md" is the 46 × 28 mobile toggle (8.5); "sm" the 44 × 26 desktop one (D13). */
  size?: "md" | "sm";
};

/**
 * Toggle row (Figma 8.5 Alerts settings, D13 Settings). A native checkbox with role="switch",
 * so it works in server-rendered forms; pass onChange from a client parent.
 */
export function Switch({ label, description, className, id, size = "md", ...rest }: SwitchProps) {
  const auto = useId();
  const inputId = id ?? auto;
  return (
    <label htmlFor={inputId} className={cx(s.row, className)}>
      <span className={s.text}>
        <span className={s.label}>{label}</span>
        {description ? <span className={s.description}>{description}</span> : null}
      </span>
      <input id={inputId} type="checkbox" role="switch" className={s.input} {...rest} />
      <span className={cx(s.track, size === "sm" && s.small)} aria-hidden>
        <span className={s.knob} />
      </span>
    </label>
  );
}

/** Rounded group that holds Switch rows with hairline dividers (Figma 8.5). */
export function SwitchGroup({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cx(s.group, className)}>{children}</div>;
}
