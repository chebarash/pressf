import Link from "next/link";

export default function Footer() {
  return (
    <footer>
      <h3>
        <Link href="https://chebarash.uz" target="_blank">
          made with love by chebarash
        </Link>
      </h3>
      <p>
        In case of any issues or suggestions,
        <br />
        feel free to reach out via{" "}
        <Link href="https://chebarash.t.me" target="_blank">
          Telegram
        </Link>
        .
      </p>
    </footer>
  );
}
