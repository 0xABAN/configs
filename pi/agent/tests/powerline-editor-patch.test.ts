import { afterAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const patcher = fileURLToPath(new URL("../patches/powerline-editor.py", import.meta.url));
const describe = Bun.spawnSync(["python3", "-B", "-c", `
import runpy,json,sys
patch = runpy.run_path(sys.argv[1])
edits = patch['EDITS']
edits['index.ts'].append(patch['PROMPT_EDIT'])
print(json.dumps({'edits': edits, 'border': patch['BORDER_EDIT'], 'legacyPrompt': patch['LEGACY_PROMPT']}))
`, patcher]);
if (describe.exitCode !== 0) throw new Error(describe.stderr.toString());
const { edits, border, legacyPrompt } = JSON.parse(describe.stdout.toString()) as {
  edits: Record<string, [string, string][]>;
  border: [string, string];
  legacyPrompt: string;
};
const root = mkdtempSync(join(tmpdir(), "powerline-editor-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

function sandbox(name: string) {
  const home = join(root, name);
  const dir = join(home, ".pi/agent/git/github.com/nicobailon/pi-powerline-footer");
  for (const [file, replacements] of Object.entries(edits)) {
    const path = join(dir, file);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, replacements.map(([old]) => old).join("\n") + "\n// preserve footer layout\n");
  }
  return {
    dir,
    contents: () => Object.fromEntries(Object.keys(edits).map(file => [file, readFileSync(join(dir, file), "utf8")])),
    run: () => Bun.spawnSync(["python3", "-B", patcher], { env: { ...process.env, HOME: home } }),
  };
}

test("powerline owns the final editor after pi-pretty installs its prompt", () => {
  const settings = JSON.parse(readFileSync(new URL("../settings.json", import.meta.url), "utf8"));
  const packages = settings.packages.map((entry: string | { source: string }) =>
    typeof entry === "string" ? entry : entry.source);
  const pretty = packages.findIndex((source: string) => source.startsWith("npm:@heyhuynhgiabuu/pi-pretty"));
  const powerline = packages.findIndex((source: string) => source.includes("nicobailon/pi-powerline-footer"));
  expect(pretty).toBeGreaterThanOrEqual(0);
  expect(powerline).toBeGreaterThan(pretty);
  expect(Object.values(settings.powerline.layout).flat()).not.toContain("custom:mode");
  expect(Object.values(settings.powerline.layout).flat()).not.toContain("custom:thinking");
});

test("editor patch is idempotent and preserves unrelated changes", () => {
  const app = sandbox("valid");
  expect(app.run().exitCode).toBe(0);
  const patched = app.contents();
  expect(patched["index.ts"]).toContain("// preserve footer layout");
  expect(app.run().exitCode).toBe(0);
  expect(app.contents()).toEqual(patched);
});

test("existing editor inset migrates without double-padding the shared viewport", () => {
  const app = sandbox("legacy-inset");
  expect(app.run().exitCode).toBe(0);
  const current = app.contents();
  writeFileSync(join(app.dir, "index.ts"), current["index.ts"].replace(
    "const margin = 0; // The Pi host owns the shared outer inset.",
    "const margin = Math.max(2, Math.floor(width * 0.04));",
  ));
  expect(app.run().exitCode).toBe(0);
  expect(app.contents()).toEqual(current);
});

test("existing framed prompt upgrades to a diamond and rejects unknown prompts", () => {
  const app = sandbox("legacy-prompt");
  expect(app.run().exitCode).toBe(0);
  const current = app.contents();
  const [oldPrompt, newPrompt] = edits["index.ts"].at(-1)!;
  for (const previous of [oldPrompt, legacyPrompt]) {
    writeFileSync(join(app.dir, "index.ts"), current["index.ts"].replace(newPrompt, previous));
    expect(app.run().exitCode).toBe(0);
    expect(app.contents()).toEqual(current);
  }
  writeFileSync(join(app.dir, "index.ts"), current["index.ts"].replace(newPrompt, "unknown prompt"));
  const before = app.contents();
  expect(app.run().exitCode).not.toBe(0);
  expect(app.contents()).toEqual(before);
});

test("existing plain border upgrades without disturbing other source", () => {
  const app = sandbox("legacy-border");
  expect(app.run().exitCode).toBe(0);
  const current = app.contents();
  for (const previous of [border[0], border[1].replace('join(" ❯ ")', 'join(" · ")')]) {
    writeFileSync(join(app.dir, "index.ts"), current["index.ts"].replace(border[1], previous));
    expect(app.run().exitCode).toBe(0);
    expect(app.contents()).toEqual(current);
  }
});

test("partial or unknown editor sources fail before any write", () => {
  for (const partial of [false, true]) {
    const app = sandbox(String(partial));
    writeFileSync(join(app.dir, "bash-mode/editor.ts"), partial ? edits["bash-mode/editor.ts"][0][1] : "changed source");
    const before = app.contents();
    expect(app.run().exitCode).not.toBe(0);
    expect(app.contents()).toEqual(before);
  }
});

// Opt-in integration tests use the actual installed host/editor, not a geometry mock.
// PI_SDK_ROOT=/path/to/@earendil-works/pi-coding-agent bun test <this file>
const sdk = process.env.PI_SDK_ROOT;
const installed = join(homedir(), ".pi/agent/git/github.com/nicobailon/pi-powerline-footer");
const transpiler = new Bun.Transpiler({ loader: "ts" });
const marker = "\x1b_pi:c\x07";
const plain = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "").replaceAll(marker, "");

async function host() {
  return import(pathToFileURL(join(sdk!, "node_modules/@earendil-works/pi-tui/dist/index.js")).href);
}

test.skipIf(!sdk)("real package resolver preserves editor ownership order", async () => {
  const { DefaultPackageManager } = await import(pathToFileURL(join(sdk!, "dist/core/package-manager.js")).href);
  const { SettingsManager } = await import(pathToFileURL(join(sdk!, "dist/core/settings-manager.js")).href);
  const settings = JSON.parse(readFileSync(new URL("../settings.json", import.meta.url), "utf8"));
  const packages = settings.packages.filter((entry: string | { source: string }) => {
    const source = typeof entry === "string" ? entry : entry.source;
    return source.includes("pi-pretty") || source.includes("pi-powerline-footer");
  });
  const manager = new DefaultPackageManager({
    cwd: process.cwd(), agentDir: join(homedir(), ".pi/agent"),
    settingsManager: SettingsManager.inMemory({ packages }),
  });
  // Never install or update anything as part of a test.
  const resources = await manager.resolve(async () => "error");
  const paths = resources.extensions.filter((entry: { enabled: boolean; path: string }) =>
    entry.enabled && (entry.path.includes("pi-pretty") || entry.path.includes("pi-powerline-footer")))
    .map((entry: { path: string }) => entry.path);
  expect(paths).toHaveLength(2);
  expect(paths[0]).toContain("pi-pretty");
  expect(paths[1]).toContain("pi-powerline-footer");
});

test.skipIf(!sdk)("real editor fills the shared viewport through wrapping, scrolling, completion and paste", async () => {
  const { Editor, visibleWidth, truncateToWidth } = await host();
  const source = readFileSync(join(installed, "index.ts"), "utf8");
  const start = source.indexOf("      // configs:powerline-editor-v1");
  expect(start).toBeGreaterThan(0);
  const end = source.indexOf("\n      return editor;", start);
  const wrap = new Function("editor", "tui", "getFgAnsiCode", "ansi", "bashModeActive", "isSigilIdeaDraft", "captureSigilGlyph",
    "footerDataRef", "visibleWidth", "truncateToWidth",
    transpiler.transformSync(source.slice(start, end)) + "\nreturn editor;");
  const statuses = new Map([
    ["agent-mode", "\u001b[36mbuild mode\u001b[0m"],
    ["agent-thinking", "\u001b[36mthink:med\u001b[0m"],
  ]);
  const footer = { getExtensionStatuses: () => statuses };
  const tui = { terminal: { rows: 20 }, requestRender() {} };
  const editor = wrap(new Editor(tui, { borderColor: (s: string) => s, selectList: {} }, { paddingX: 1 }),
    tui, () => "\x1b[38;2;95;168;118m",
    { reset: "\x1b[0m", getFgAnsi: (r: number, g: number, b: number) => `\x1b[38;2;${r};${g};${b}m` },
    false, () => false, () => "+", footer, visibleWidth, truncateToWidth);
  editor.focused = true;
  expect(editor.render(80)[1]).toContain("\x1b[38;2;94;158;128m◆\x1b[0m");
  for (const [bashMode, captureMode, glyph] of [[true, false, "$"], [false, true, "+"]] as const) {
    const special = wrap(new Editor(tui, { borderColor: (s: string) => s, selectList: {} }),
      tui, () => "\x1b[38;2;95;168;118m",
      { reset: "\x1b[0m", getFgAnsi: (r: number, g: number, b: number) => `\x1b[38;2;${r};${g};${b}m` },
      bashMode, () => captureMode, () => "+",
      undefined, visibleWidth, truncateToWidth);
    const row = special.render(80)[1];
    expect(plain(row)).toStartWith(`│ ${glyph} `);
    expect(row).toContain(`\x1b[38;2;${bashMode ? "200;200;200" : "95;168;118"}m${glyph}\x1b[0m`);
  }

  for (const text of ["", "hello", "界🙂".repeat(30), "───\nsecond line", Array.from({ length: 20 }, (_, i) => `line ${i}`).join("\n")]) {
    editor.setText(text);
    for (const width of [16, 40, 80, 160]) {
      const rows = editor.render(width);
      const margin = 0;
      expect(plain(rows[0]).startsWith(" ".repeat(margin) + "╭")).toBe(true);
      expect(plain(rows.at(-1)).endsWith("╯")).toBe(true);
      expect(rows.every((s: string) => visibleWidth(s) <= width)).toBe(true);
      expect(visibleWidth(rows[0])).toBe(width - margin);
      expect(rows.join("").split(marker).length - 1).toBe(1);
      expect(editor.getText()).toBe(text);
    }
  }
  editor.setText("");
  const top = editor.render(80)[0];
  expect(plain(top)).toEndWith(" build mode ❯ think:med ──╮");
  expect(top).toContain(statuses.get("agent-mode")!);
  expect(top).toContain(statuses.get("agent-thinking")!);
  expect(visibleWidth(top)).toBe(80);
  expect(plain(editor.render(16)[0])).not.toContain("build mode");
  statuses.set("agent-mode", "plan mode");
  statuses.set("agent-thinking", "think:high");
  expect(plain(editor.render(80)[0])).toEndWith(" plan mode ❯ think:high ──╮");
  editor.setText(Array.from({ length: 20 }, (_, i) => `line ${i}`).join("\n"));
  expect(editor.render(9).every((s: string) => visibleWidth(s) <= 9)).toBe(true);
  expect(plain(editor.render(80)[0])).toContain("↑");

  editor.setText("/a");
  editor.autocompleteState = {};
  editor.autocompleteList = { render: () => ["completion", "───"] };
  const completed = editor.render(80).map(plain);
  expect(completed[2].endsWith("╯")).toBe(true);
  expect(completed[3].trim()).toBe("completion");
  expect(completed[4].trim()).toBe("───");
  // Four columns for the frame/prompt, plus the host's one-column input padding.
  expect(completed[3].indexOf("completion")).toBe(5);
  editor.autocompleteState = null;
  editor.autocompleteList = null;
  editor.setText("");
  editor.handleInput("\x1b[200~hello\nworld\x1b[201~");
  expect(editor.getExpandedText()).toBe("hello\nworld");
  expect(editor.render(40).join("")).toContain(marker);
});

test.skipIf(!sdk)("bash ghost text preserves padded cursor and avoids overwriting wrapped input", async () => {
  const { Editor, visibleWidth, truncateToWidth } = await host();
  const source = readFileSync(join(installed, "bash-mode/editor.ts"), "utf8");
  const start = source.indexOf("  render(width: number): string[] {");
  const end = source.indexOf("  private isShellCompletionContext", start);
  const TestEditor = new Function("Editor", "visibleWidth", "truncateToWidth", transpiler.transformSync(
    `class TestEditor extends Editor { ghost = { value: 'echo hello' }; isShellCompletionContext() { return true; }\n${source.slice(start, end)}\n}`,
  ) + "\nreturn TestEditor;")(Editor, visibleWidth, truncateToWidth);
  const editor = new TestEditor({ terminal: { rows: 30 }, requestRender() {} }, { borderColor: (s: string) => s }, { paddingX: 1 });
  editor.focused = true;
  editor.setText("echo");
  const rows = editor.render(40);
  expect(rows[1]).toContain(marker);
  expect(plain(rows[1]).startsWith(" echo")).toBe(true);
  expect(plain(rows[1])).toContain("hello");
  expect(visibleWidth(rows[1])).toBe(40);
  editor.setText("echo ".repeat(20));
  editor.ghost.value = editor.getText() + "suffix";
  const wrapped = editor.render(25);
  expect(wrapped[1]).not.toContain("suffix");
  expect(wrapped.join("")).toContain(marker);
});
