import styles from "@/styles/Modal.module.css";
import { ReactNode } from "react";

export default function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      className={styles.modal}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className={styles.content}>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}
