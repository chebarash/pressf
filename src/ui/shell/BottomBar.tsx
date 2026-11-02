"use client";

import { BottomButtons, MainButton } from "@/ui/components/MainButton";
import { useBottomButtons, usePlatform } from "@/platform/hooks";
import type { BottomButton } from "@/platform/store";

const kitState = (b: BottomButton): "loading" | "disabled" | "shine" | "default" =>
  b.loading ? "loading" : b.disabled ? "disabled" : b.shine ? "shine" : "default";

/**
 * Web stand-in for Telegram's MainButton / SecondaryButton. Inside Telegram the
 * native buttons are used and this renders nothing. Phones get the UI kit's
 * TG/MainButton visuals; desktop gets keycap buttons at the end of the column.
 * This is the one place that decides how bottom actions look off Telegram.
 */
export function BottomBar() {
  const { telegram, mobile } = usePlatform();
  const { main, secondary } = useBottomButtons();
  if (telegram || (!main && !secondary)) return null;
  const run = (b: BottomButton) => () => { if (!b.loading && !b.disabled) b.onClick(); };

  if (mobile) {
    return (
      <div className="sh-bottombar sh-bottombar--kit">
        {main && secondary ? (
          <BottomButtons
            secondary={{ label: secondary.text, onClick: run(secondary) }}
            main={{ label: main.text, onClick: run(main), state: main.loading ? "loading" : main.disabled ? "disabled" : "default" }}
          />
        ) : main ? (
          <MainButton label={main.text} state={kitState(main)} onClick={run(main)} />
        ) : secondary ? (
          <MainButton label={secondary.text} onClick={run(secondary)} />
        ) : null}
      </div>
    );
  }

  return (
    <div className="sh-bottombar">
      {secondary && <DesktopButton button={secondary} secondary />}
      {main && <DesktopButton button={main} />}
    </div>
  );
}

function DesktopButton({ button, secondary }: { button: BottomButton; secondary?: boolean }) {
  return (
    <button
      type="button"
      className={`sh-mainbtn${secondary ? " sh-mainbtn--secondary" : ""}${button.shine ? " sh-mainbtn--shine" : ""}`}
      disabled={button.disabled}
      aria-busy={button.loading || undefined}
      onClick={() => { if (!button.loading) button.onClick(); }}
    >
      {button.loading ? <span className="sh-spinner" aria-label="Loading" /> : button.text}
    </button>
  );
}
