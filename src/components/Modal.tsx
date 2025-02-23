import styles from "@/styles/Modal.module.css";

export default function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: any;
  onClose: () => any;
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
