/** Joins class names, skipping falsy values. */
export const cx = (...names: Array<string | false | null | undefined>) => names.filter(Boolean).join(" ");

/**
 * Forced visual state, used by the kit catalogue to show hover/pressed/focus
 * without interaction. Real interaction uses :hover / :active / :focus-visible.
 */
export type ForcedState = "hover" | "pressed" | "focus";
