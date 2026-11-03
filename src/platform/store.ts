/**
 * Tiny client stores shared by the Telegram bridge and the web fallbacks in
 * `src/ui/shell`. One place holds the bottom buttons and the open web dialog,
 * whichever front end ends up drawing them.
 */

export type BottomButton = {
  text: string;
  onClick: () => void;
  /** Greyed out and not clickable. */
  disabled?: boolean;
  /** Spinner instead of the label (Telegram showProgress). */
  loading?: boolean;
  /** Telegram's shine for asks we want noticed (rating). */
  shine?: boolean;
  /** Secondary button only: where Telegram puts it next to the main one. */
  position?: "left" | "right" | "top" | "bottom";
};

export type DialogRequest =
  | { kind: "confirm"; title?: string; message: string; ok?: string; cancel?: string; destructive?: boolean; resolve: (ok: boolean) => void }
  | { kind: "popup"; title?: string; message: string; buttons: { id: string; text: string; type?: "default" | "destructive" | "cancel" }[]; resolve: (id: string | null) => void };

function createStore<T>(initial: T) {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set(next: T) {
      value = next;
      listeners.forEach((l) => l());
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export const mainButton = createStore<BottomButton | null>(null);
export const secondaryButton = createStore<BottomButton | null>(null);
export const dialog = createStore<DialogRequest | null>(null);
/** The Telegram SDK finished its setup (insets, colours, buttons wired). */
export const telegramReady = createStore(false);
/** A screen's override of Telegram's BackButton (default: shown off the root, goes back). */
export const backButton = createStore<{ visible: boolean; onBack?: () => void } | null>(null);
