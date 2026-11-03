import tokens from "../../data/design-tokens.json";

/**
 * Builds CSS custom properties from the Figma tokens (data/design-tokens.json).
 * Light is the default; dark applies when the system or Telegram says so, and an
 * explicit data-theme on <html> always wins.
 */

type TypeToken = [family: "serif" | "sans", size: number, lineHeight: number, tracking: number, weight?: number];

const name = (key: string) => `--${key.replace(/\//g, "-")}`;
const colors = (mode: 0 | 1) => Object.entries(tokens.color).map(([k, v]) => `  ${name(k)}: ${v[mode]};`).join("\n");

export function tokensCss() {
  const space = Object.entries(tokens.space).map(([k, v]) => `  --space-${k}: ${v}px;`).join("\n");
  const radius = Object.entries(tokens.radius).map(([k, v]) => `  --radius-${k}: ${v}px;`).join("\n");
  const shadow = Object.entries(tokens.shadow).map(([k, v]) => `  --shadow-${k}: 0 ${v}px 0 var(--shadow-key);`).join("\n");
  const duration = Object.entries(tokens.motion.duration).map(([k, v]) => `  --motion-${k}: ${v}ms;`).join("\n");
  const easing = Object.entries(tokens.motion.easing).map(([k, v]) => `  --ease-${k}: ${v};`).join("\n");
  const type = Object.entries(tokens.type as unknown as Record<string, TypeToken>)
    .map(([k, [family, size, lh, tracking, weight]]) =>
      [
        `.t-${k} {`,
        `  font-family: var(--font-${family});`,
        `  font-size: ${size}px;`,
        `  line-height: ${lh};`,
        tracking ? `  letter-spacing: ${tracking}em;` : null,
        weight ? `  font-weight: ${weight};` : null,
        k === "label-xs" ? "  text-transform: uppercase;" : null,
        "}",
      ].filter(Boolean).join("\n"))
    .join("\n");
  return `/* Generated from data/design-tokens.json by src/ui/build-tokens.ts — do not edit by hand. */
:root {
  color-scheme: light;
  --font-serif: "Instrument Serif", Georgia, serif;
  --font-sans: "Geologica", system-ui, sans-serif;
${colors(0)}
${space}
${radius}
${shadow}
${duration}
${easing}
}

/* Reduced motion: every duration token is zero, so transitions and animations built on them end at once. */
@media (prefers-reduced-motion: reduce) {
  :root {
${Object.keys(tokens.motion.duration).map((k) => `    --motion-${k}: 0ms;`).join("\n")}
  }
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    color-scheme: dark;
${colors(1).replace(/^ {2}/gm, "    ")}
  }
}

:root[data-theme="dark"] {
  color-scheme: dark;
${colors(1)}
}

${type}
`;
}

/** Light-mode hex values, for places without CSS (OG images, file covers, bot images). */
export const lightColor = (key: keyof typeof tokens.color) => tokens.color[key][0];
export const darkColor = (key: keyof typeof tokens.color) => tokens.color[key][1];
