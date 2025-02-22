import { CourseType } from "@/types/types";
import styles from "@/styles/Course.module.css";

export default function Course({
  id,
  code,
  name,
  selected,
  onClick,
}: CourseType & { onClick: () => any; selected?: boolean }) {
  return (
    <button
      className={[styles.course, selected ? styles.selected : ``].join(` `)}
      onClick={onClick}
      disabled={!onClick}
    >
      <p>{name}</p>
      <svg width="16" height="16" viewBox="0 0 20 21" fill="none">
        <path
          d="M18 2.5L2 18.5M18 18.5L2 2.5"
          stroke="var(--background)"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
