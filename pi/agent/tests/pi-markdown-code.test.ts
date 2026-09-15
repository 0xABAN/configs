import { expect } from "bun:test";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { copySdk, describePatch, temporaryDirectory } from "./support/patch-fixtures";
import { nativeSuite } from "./support/native-suite";

const patcher = fileURLToPath(new URL("../patches/pi-markdown-code.py", import.meta.url));
const { MARKDOWN, THEME, EDITS } = describePatch<{
  MARKDOWN: string;
  THEME: string;
  EDITS: Record<string, [string, string][]>;
}>(patcher, "{'MARKDOWN':m['MARKDOWN'],'THEME':m['THEME'],'EDITS':m['EDITS']}");
const temp = temporaryDirectory("pi-markdown-code-");
const sdk = process.env.PI_SDK_ROOT;
const { unitTest: test, nativeTest: realTest } = nativeSuite(import.meta.path, !!sdk && existsSync(join(sdk!, "node_modules/@earendil-works/pi-tui")));

function run(root: string) {
  return Bun.spawnSync(["python3", "-B", patcher], {
    env: { ...process.env, PI_SDK_ROOT: root, HOME: root },
  });
}

function contents(root: string) {
  return Object.fromEntries(Object.keys(EDITS).map((name) => [name, readFileSync(join(root, name), "utf8")]));
}

function fixture(name: string) {
  if (!sdk) throw new Error("PI_SDK_ROOT is required");
  const root = join(temp, name);
  copySdk(sdk, root);
  for (const [name, edits] of Object.entries(EDITS)) {
    const path = join(root, name);
    let source = readFileSync(path, "utf8");
    for (const [old, next] of edits) source = source.replace(next, old);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, source);
  }
  return root;
}

test("patches native Markdown code panels idempotently", () => {
  const root = fixture("valid");
  const before = contents(root);
  expect(run(root).exitCode).toBe(0);
  const after = contents(root);
  expect(after[MARKDOWN]).toContain("CODE_BLOCK_MARKER");
  expect(after[THEME]).toContain("codeBlockBackground");
  expect(readdirSync(join(root, ".config/theme-backups"))).toHaveLength(1);
  expect(run(root).exitCode).toBe(0);
  expect(contents(root)).toEqual(after);
  expect(before[MARKDOWN]).not.toBe(after[MARKDOWN]);
});

test("rejects partial Markdown code patches without writing", () => {
  const root = fixture("partial");
  const path = join(root, MARKDOWN);
  const [old, next] = EDITS[MARKDOWN]![0]!;
  writeFileSync(path, readFileSync(path, "utf8").replace(old, next));
  const before = contents(root);
  expect(run(root).exitCode).not.toBe(0);
  expect(contents(root)).toEqual(before);
});

realTest("native Markdown hides fences and fills wrapped code rows", async () => {
  const root = fixture("real");
  expect(run(root).exitCode).toBe(0);
  const { Markdown, stripTerminalSequences, visibleWidth } = await import(
    pathToFileURL(join(root, "node_modules/@earendil-works/pi-tui/dist/index.js")).href,
  );
  const syntax = "\x1b[38;2;95;168;118m";
  const background = "\x1b[48;2;24;26;32m";
  const theme = {
    heading: (text: string) => text,
    link: (text: string) => text,
    linkUrl: (text: string) => text,
    code: (text: string) => text,
    codeBlock: (text: string) => text,
    codeBlockBorder: (text: string) => text,
    codeBlockBackground: (text: string) => `${background}${text}\x1b[49m`,
    quote: (text: string) => text,
    quoteBorder: (text: string) => text,
    hr: (text: string) => text,
    listBullet: (text: string) => text,
    bold: (text: string) => text,
    italic: (text: string) => text,
    strikethrough: (text: string) => text,
    underline: (text: string) => text,
    highlightCode: (code: string) => code.split("\n").map((line) => `${syntax}${line}\x1b[39m`),
  };
  const lines = new Markdown("```ts\nconst value = 42;\n\n```", 0, 0, theme).render(40);
  const codeLines = lines.filter((line: string) => line.includes(background));
  expect(lines.join("\n")).not.toContain("```");
  expect(lines.join("\n")).not.toContain("ts");
  expect(codeLines).toHaveLength(2);
  expect(codeLines.every((line: string) => visibleWidth(line) === 40)).toBe(true);
  expect(codeLines[0]).toContain(syntax);
  expect(stripTerminalSequences(codeLines[0])).toContain("const value = 42;");

  const wrapped = new Markdown("```ts\nconst " + "x".repeat(80) + "\n```", 0, 0, theme).render(40);
  expect(wrapped.length).toBeGreaterThan(1);
  expect(wrapped.every((line: string) => line.includes(background) && visibleWidth(line) === 40)).toBe(true);
});
