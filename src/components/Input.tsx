import { InputHTMLAttributes } from "react";
import styles from "@/styles/Input.module.css";

export default function Input({
  className,
  ...extra
}: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={[className, styles.input].join(` `)} {...extra} />;
}
