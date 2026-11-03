"use client";

import { useMainButton, useSecondaryButton } from "@/platform/hooks";
import { Icon } from "./icons";
import { Sheet } from "./overlays";

/** 1.8 Allow Telegram messages (requestWriteAccess). */
export function AlertsSheet({ onAllow, onSkip, busy }: { onAllow: () => void; onSkip: () => void; busy?: boolean }) {
  useMainButton({ text: "Allow messages", onClick: onAllow, loading: busy });
  return (
    <Sheet label="Alerts in Telegram" onClose={onSkip} className="sh-sheet--tight">
      <h2 className="sh-sheet__title">Alerts in Telegram</h2>
      <ul className="sh-bullets">
        <li><Icon name="send" size={18} />Your next class in 15 minutes, with the room</li>
        <li><Icon name="send" size={18} />A new grade the moment it&apos;s in LMS</li>
        <li><Icon name="send" size={18} />New files and messages from your teachers</li>
      </ul>
      <button type="button" className="sh-textbtn" onClick={onSkip}>Not now</button>
    </Sheet>
  );
}

/** 1.9 Add to home screen (addToHomeScreen), offered once. */
export function HomeScreenSheet({ onAdd, onClose }: { onAdd: () => void; onClose: () => void }) {
  useMainButton({ text: "Add to home screen", onClick: onAdd });
  useSecondaryButton({ text: "Not now", onClick: onClose, position: "left" });
  return (
    <Sheet label="Keep Press F one tap away" onClose={onClose} className="sh-sheet--tight">
      <div className="sh-appicon">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/mascot.png" alt="" width={44} height={44} />
      </div>
      <h2 className="sh-sheet__title">Keep Press F one tap away</h2>
      <p className="sh-sheet__body">Your classes, grades and absences open straight from the home screen, without finding the bot first.</p>
      <p className="sh-sheet__fine sh-sheet__fine--one">Offered once, after your first week. Also in Profile.</p>
    </Sheet>
  );
}
