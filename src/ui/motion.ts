/**
 * Client-side motion state shared by small animated leaves.
 * `appHydrated` turns true once the first page has hydrated: anything that
 * mounts later arrived by navigation and may animate in; anything rendered on
 * the server shows its final state, so the first paint never flashes.
 */
export let appHydrated = false;

export function markHydrated() {
  appHydrated = true;
}

export const reducedMotion = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
