import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// CLAUDE.md: members never see wallet, SOL, gas, seed phrase, sign, or
// transaction. This scans screen code under app/ for those words in on-screen
// text: JSX text and quoted strings. Import lines are skipped.
const BANNED = [
  /\bwallets?\b/i,
  /\bSOL\b/, // case-sensitive so "solution" etc. don't trip it
  /\bgas\b/i,
  /\bseed phrase\b/i,
  /\bsign(ed|ing|s)?\b/i,
  /\btransactions?\b/i,
];

function screenFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "api" ? [] : screenFiles(path);
    return path.endsWith(".tsx") ? [path] : [];
  });
}

function visibleText(source: string): string[] {
  const lines = source.split("\n").filter((l) => !/^\s*import\s/.test(l));
  const code = lines.join("\n").replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  const jsxText = [...code.matchAll(/>([^<>{}]+)</g)].map((m) => m[1]);
  const strings = [...code.matchAll(/(["'`])((?:(?!\1)[^\\\n]|\\.)*)\1/g)].map((m) => m[2]);
  return [...jsxText, ...strings];
}

const isBanned = (text: string) => BANNED.some((re) => re.test(text));

describe("banned-word scanner", () => {
  it("catches banned words in JSX text and strings", () => {
    const sample = `<p>Your wallet</p>\nconst m = "Sign this transaction";`;
    expect(visibleText(sample).filter(isBanned)).toHaveLength(2);
  });

  it("ignores imports and identifiers", () => {
    const sample = `import { useWallets } from "@/lib/wallets/x";\nconst { wallets } = useWallets();`;
    expect(visibleText(sample).filter(isBanned)).toEqual([]);
  });
});

describe("on-screen text never uses banned crypto words", () => {
  const files = screenFiles(join(__dirname, "..", "app"));

  it("finds screen files to check", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)("%s", (file) => {
    const hits = visibleText(readFileSync(file, "utf8")).filter(isBanned);
    expect(hits).toEqual([]);
  });
});
