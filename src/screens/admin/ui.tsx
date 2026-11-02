/**
 * Local admin atoms (the shared UI kit has no desktop-admin variants yet).
 * Styles: admin.module.css, tokens only.
 */
import type { ComponentProps, ReactNode } from "react";
import s from "./admin.module.css";

export const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(" ");

export type Tone = "plain" | "inverse" | "mustard" | "mustardStrong" | "rust" | "plum" | "teal" | "moss";
const TONE: Record<Tone, string | undefined> = {
  plain: undefined, inverse: s.chipInverse, mustard: s.chipMustard, mustardStrong: s.chipMustardStrong, rust: s.chipRust, plum: s.chipPlum, teal: s.chipTeal, moss: s.chipMoss,
};

export const Chip = ({ tone = "plain", children, className }: { tone?: Tone; children: ReactNode; className?: string }) => (
  <span className={cx(s.chip, TONE[tone], className)}>{children}</span>
);

export const Key = ({ children }: { children: ReactNode }) => <kbd className={s.key}>{children}</kbd>;

type BtnProps = ComponentProps<"button"> & { tone?: "plain" | "accent" | "danger"; hint?: ReactNode; grow?: boolean };
export const Btn = ({ tone = "plain", hint, grow, className, children, ...rest }: BtnProps) => (
  <button type="button" className={cx(s.btn, tone === "accent" && s.btnAccent, tone === "danger" && s.btnDanger, grow && s.btnGrow, className)} {...rest}>
    {children}
    {hint != null && <Key>{hint}</Key>}
  </button>
);

export const Label = ({ children }: { children: ReactNode }) => <div className={s.label}>{children}</div>;

export const KV = ({ k, children, tone, top, wide }: { k: ReactNode; children: ReactNode; tone?: "accent" | "danger"; top?: boolean; wide?: boolean }) => (
  <div className={cx(s.kv, top && s.kvTop)}>
    <span className={cx(s.kvKey, wide && s.kvKeyWide)}>{k}</span>
    <span className={cx(s.kvVal, tone === "accent" && s.kvAccent, tone === "danger" && s.kvDanger)}>{children}</span>
  </div>
);

export const Radio = ({ on }: { on: boolean }) => <span aria-hidden className={cx(s.radio, on && s.radioOn)} />;

export const Head = ({ title, sub }: { title: ReactNode; sub?: ReactNode }) => (
  <div className={s.head}>
    <h1 className={s.h1}>{title}</h1>
    {sub != null && <p className={s.sub}>{sub}</p>}
  </div>
);

export { s };
