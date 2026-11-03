import Link from "next/link";
import { SearchLink } from "./SearchLink";

/**
 * App/TopBar (Figma 4156:2809): search field that opens Search, and the avatar
 * that opens Profile (or sign-in for guests). No logo: Telegram shows the name.
 */
export function TopBar({ signedIn }: { signedIn: boolean }) {
  return (
    <div className="sh-topbar">
      <SearchLink />
      <Link href={signedIn ? "/me" : "/sign-in"} className="sh-avatar" aria-label={signedIn ? "Profile" : "Sign in"}>
        {/* Drawn face, never a photo. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/mascot.png" alt="" width={40} height={40} />
      </Link>
    </div>
  );
}
