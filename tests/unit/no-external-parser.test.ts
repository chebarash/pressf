import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The site never calls a hosted model: syllabi and faces are read by the
 * operator and submitted as data. Nothing in the app, its scripts, config or
 * dependencies may reach the Anthropic API or carry its SDK or key.
 */
const ROOT = join(__dirname, "..", "..");
const SCAN = ["src", "scripts", "drizzle", "public"];
const FILES = ["package.json", "package-lock.json", "next.config.ts", ".env.example", "vercel.json", "railway.json"];
const BANNED = [/api\.anthropic\.com/i, /@anthropic-ai\//i, /ANTHROPIC_API_KEY/, /from ["']anthropic["']/i, /claude-(opus|sonnet|haiku)/i];

function walk(dir: string): string[] {
  let out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out = out.concat(walk(path));
    else if (/\.(ts|tsx|js|mjs|cjs|json|sql|md|css|env|example|yml|yaml)$/.test(name)) out.push(path);
  }
  return out;
}

const readable = (path: string) => {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
};

describe("no hosted model calls", () => {
  it("has no Anthropic API host, SDK, key or model id anywhere in the app", () => {
    const files = [...SCAN.map((d) => join(ROOT, d)).filter(isDir).flatMap(walk), ...FILES.map((f) => join(ROOT, f))];
    expect(files.length).toBeGreaterThan(50);
    const hits: string[] = [];
    for (const file of files) {
      const text = readable(file);
      if (text === null) continue;
      for (const re of BANNED) if (re.test(text)) hits.push(`${relative(ROOT, file)}: ${re}`);
    }
    expect(hits).toEqual([]);
  });
});

function isDir(path: string) {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}
