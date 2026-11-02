import { writeFileSync } from "node:fs";
import { tokensCss } from "../src/ui/build-tokens";

/** Regenerates src/ui/tokens.css after data/design-tokens.json changes (npm run tokens). */
writeFileSync(new URL("../src/ui/tokens.css", import.meta.url), tokensCss());
console.log("src/ui/tokens.css written");
