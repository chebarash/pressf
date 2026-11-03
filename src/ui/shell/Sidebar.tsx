"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { modLabel } from "@/platform/keys";
import { setTheme } from "@/platform/PlatformProvider";
import { Icon } from "./icons";
import { isActive, NAV } from "./nav";
import type { QrData } from "./qr";
import { LiveInviteQr } from "./LiveInviteQr";

export type SidebarProps = {
  user: { name: string; subtitle: string; telegramLinked: boolean; syncedAt: string | null } | null;
  unread?: number;
  /** "Feb": when next semester's courses open (Next semester item). */
  nextLabel?: string;
  inviteQr: QrData;
  onSearch: () => void;
  onShortcuts: () => void;
  onLinkTelegram: () => void;
};

function subscribeTheme(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}

const noSubscribe = () => () => {};

function syncedLabel(iso: string, now: number) {
  const minutes = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000));
  if (minutes < 1) return "LMS synced just now";
  if (minutes < 60) return `LMS synced ${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return hours < 24 ? `LMS synced ${hours} h ago` : `LMS synced ${Math.round(hours / 24)} d ago`;
}

/** Nav/Sidebar (Figma 4214:8738): Telegram=Linked, or Not linked with the invite card. */
export function Sidebar({ user, unread = 0, nextLabel = "Feb", inviteQr, onSearch, onShortcuts, onLinkTelegram }: SidebarProps) {
  const pathname = usePathname();
  const dark = useSyncExternalStore(subscribeTheme, () => document.documentElement.dataset.theme === "dark", () => false);
  const mod = useSyncExternalStore(noSubscribe, modLabel, () => "⌘");
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const timer = setInterval(tick, 60_000);
    return () => { clearTimeout(first); clearInterval(timer); };
  }, []);

  const item = (n: (typeof NAV)[number]) => {
    const active = isActive(n.href, pathname);
    return (
      <Link key={n.href} href={n.href} prefetch className="sh-nav-item" aria-current={active ? "page" : undefined}>
        <Icon name={n.icon} size={18} />
        <span>{n.label}</span>
        {n.badge === "new" && nextLabel && <span className="sh-pill-new">{nextLabel}</span>}
        {n.badge === "count" && unread > 0 && <span className="sh-badge">{unread}</span>}
        {n.badge !== "new" && <kbd className="sh-kbd" aria-label={`Shortcut F then ${n.key.toUpperCase()}`}>F {n.key.toUpperCase()}</kbd>}
      </Link>
    );
  };

  return (
    <nav className="sh-sidebar" aria-label="Press F">
      <Link href="/" prefetch className="sh-logo" aria-label="Press F, Today">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/mascot.png" alt="" width={40} height={40} />
        <span>Press F</span>
      </Link>
      <button type="button" className="sh-sidebar__search" onClick={onSearch}>
        <Icon name="search" size={16} />
        <span>Search</span>
        <kbd className="sh-kbd">{mod}K</kbd>
      </button>
      <div className="sh-spacer" />
      {NAV.filter((n) => n.group === "main").map(item)}
      <div className="sh-divider" />
      {NAV.filter((n) => n.group === "browse").map(item)}
      <div className="sh-grow" />
      {user && !user.telegramLinked && (
        <section className="sh-invite" aria-label="Press F in Telegram">
          <div className="sh-invite__head">
            <button type="button" className="sh-invite__qr" onClick={onLinkTelegram} aria-label="Show the sign-in code for Telegram">
              <LiveInviteQr fallback={inviteQr} size={56} />
            </button>
            <div>
              <p className="sh-invite__title">Press F in Telegram</p>
              <p className="sh-invite__sub">Scan with your phone</p>
            </div>
          </div>
          <p className="sh-invite__body">Class reminders, QR check-in and alerts the moment a grade lands.</p>
          <button type="button" className="sh-invite__btn" onClick={onLinkTelegram}>
            <Icon name="send" size={14} />
            Open in Telegram
          </button>
        </section>
      )}
      {user?.syncedAt && now !== null && user.telegramLinked && (
        <p className="sh-synced" data-stale={now - Date.parse(user.syncedAt) > 3 * 3600_000 ? "true" : undefined}>{syncedLabel(user.syncedAt, now)}</p>
      )}
      <div className="sh-utilities">
        <button type="button" className="sh-utility" onClick={onShortcuts}>
          Shortcuts <kbd className="sh-kbd">?</kbd>
        </button>
        <button type="button" className="sh-utility" onClick={() => setTheme(dark ? "light" : "dark")} aria-pressed={dark}>
          <Icon name={dark ? "sun" : "moon"} size={16} />
          {dark ? "Light" : "Dark"}
        </button>
      </div>
      {user ? (
        <Link href="/me" className="sh-profile" aria-current={pathname.startsWith("/me") ? "page" : undefined}>
          {/* Students get the drawn mascot face too: no real photos anywhere. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/mascot.png" alt="" width={36} height={36} />
          <span className="sh-profile__text">
            <span className="sh-profile__name">{user.name}</span>
            <span className="sh-profile__sub">{user.subtitle}</span>
          </span>
          <Icon name="chevron-right" size={16} />
        </Link>
      ) : (
        <Link href={`/sign-in?next=${encodeURIComponent(pathname)}`} className="sh-profile">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/mascot.png" alt="" width={36} height={36} />
          <span className="sh-profile__text">
            <span className="sh-profile__name">Sign in with LMS</span>
            <span className="sh-profile__sub">Your timetable, grades and files</span>
          </span>
          <Icon name="chevron-right" size={16} />
        </Link>
      )}
    </nav>
  );
}
