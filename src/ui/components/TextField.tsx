import { useId, type InputHTMLAttributes } from "react";
import { cx } from "./cx";
import s from "./TextField.module.css";

export type TextFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "size"> & {
  label: string;
  /** Error under the field (Figma 1.5 wrong password); also sets aria-invalid. */
  error?: string;
  /** Helper text under the field when there is no error. */
  hint?: string;
};

/** Labelled text input (Figma 1.3 / 1.5 Sign in). */
export function TextField({ label, error, hint, className, id, ...rest }: TextFieldProps) {
  const auto = useId();
  const inputId = id ?? auto;
  const noteId = `${inputId}-note`;
  const note = error ?? hint;
  return (
    <div className={cx(s.field, className)}>
      <label htmlFor={inputId} className={s.label}>
        {label}
      </label>
      <input
        id={inputId}
        className={cx(s.input, error && s.invalid)}
        aria-invalid={error ? true : undefined}
        aria-describedby={note ? noteId : undefined}
        {...rest}
      />
      {note ? (
        <p id={noteId} className={cx(s.note, error && s.error)}>
          {note}
        </p>
      ) : null}
    </div>
  );
}
