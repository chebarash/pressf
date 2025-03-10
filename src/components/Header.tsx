import Image from "next/image";
import styles from "@/styles/Header.module.css";

export default function Header() {
  return (
    <>
      <div className={styles.bgBox}>
        <div className={styles.bg}>
          <Image src="/cover.png" alt="Backgroud>" fill priority />
        </div>
      </div>
      <section>
        <h1>Press F to pay respects</h1>
        <p>Not all heroes wear capes… Some just teach really well.</p>
      </section>
      <section>
        <h2>
          Tired of guessing which professor will make your semester amazing?
        </h2>
        <div>
          Press F helps you find the best
          <span className={styles.star}>
            *
            <div>
              <svg width="23" height="8" viewBox="0 0 23 8" fill="none">
                <path
                  fillRule="evenodd"
                  clipRule="evenodd"
                  d="M23 8H0L6.44014 1.96426C9.23462 -0.65475 13.7654 -0.654752 16.5599 1.96425L23 8Z"
                  fill="black"
                />
              </svg>
              or avoid the worst
            </div>
          </span>{" "}
          professor in New Uzbekistan University with real, anonymous student
          reviews.
        </div>
      </section>
    </>
  );
}
