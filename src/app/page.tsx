import styles from "./page.module.css";
import LoginButton from "@/components/LoginButton";

export default function Home() {
  return (
    <div className={styles.page}>
      <LoginButton />
    </div>
  );
}
