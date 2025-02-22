import Professors from "@/components/Professors";
import styles from "./page.module.css";
import { getProfessors } from "@/lib/professor";
import Image from "next/image";

export default async function Home() {
  const { professors } = await getProfessors();
  return (
    <main className={styles.main}>
      <div className={styles.bg}>
        <Image src="/cover.png" alt="Backgroud>" fill priority />
      </div>
      <section>
        <h1>Press F to pay respects</h1>
        <p>Not all heroes wear capes… Some just teach really well.</p>
      </section>
      <section>
        <h2>
          Tired of guessing which professor will make your semester amazing?
        </h2>
        <p>
          Press F helps you find the best<span>*</span> professor in NUU with
          real, anonymous student reviews.
        </p>
      </section>
      {professors ? (
        <Professors professors={professors} />
      ) : (
        <div className={styles.error}>Error loading professors</div>
      )}
    </main>
  );
}
