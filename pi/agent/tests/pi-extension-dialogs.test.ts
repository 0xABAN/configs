import { afterAll, expect, mock, test } from "bun:test";
import { copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const patcher = fileURLToPath(new URL("../patches/pi-extension-dialogs.py", import.meta.url));
const sdk = process.env.PI_SDK_ROOT;
const child = process.env.CONFIGS_DIALOGS_TEST_CHILD === "1";
const temp = mkdtempSync(join(tmpdir(), "pi-extension-dialogs-test-"));
afterAll(() => rmSync(temp, { recursive: true, force: true }));
const described = Bun.spawnSync(["python3", "-B", "-c", "import runpy,json,sys; m=runpy.run_path(sys.argv[1]); print(json.dumps({'edits':m['EDITS'],'module':m['MODULE'],'marker':m['MARKER']}))", patcher]);
if (described.exitCode) throw new Error(described.stderr.toString());
const { edits, module: modulePath, marker } = JSON.parse(described.stdout.toString()) as {
  edits: Record<string, [string, string, number][]>; module: string; marker: string;
};
const files = Object.keys(edits);
const run = (root: string) => Bun.spawnSync(["python3", "-B", patcher], { env: { ...process.env, PI_SDK_ROOT: root, HOME: root } });
function check(result: ReturnType<typeof run>) {
  if (result.exitCode) throw new Error(result.stderr.toString() + result.stdout.toString());
}
function sandbox(name: string) {
  const root = join(temp, name);
  mkdirSync(root, { recursive: true });
  writeFileSync(join(root, "package.json"), '{"version":"0.84.2","type":"module"}');
  for (const [file, replacements] of Object.entries(edits)) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), replacements.flatMap(([old, , count]) => Array(count).fill(old)).join("\n") + "\n// unrelated source edit\n");
  }
  return root;
}
function contents(root: string) {
  return Object.fromEntries([...files, modulePath].map(file => [file,
    existsSync(join(root, file)) ? readFileSync(join(root, file), "utf8") : null]));
}

test("native dialog patch validates every source, backs up exact originals and repeats without writing", () => {
  const root = sandbox("valid");
  const before = contents(root);
  check(run(root));
  const after = contents(root);
  const backupRoot = join(root, ".config/theme-backups");
  const backups = readdirSync(backupRoot);
  expect(backups).toHaveLength(1);
  for (const file of files) {
    expect(readFileSync(join(backupRoot, backups[0], file), "utf8")).toBe(before[file]!);
    expect(after[file]).toContain("// unrelated source edit");
  }
  expect(JSON.parse(readFileSync(join(backupRoot, backups[0], "added-files.json"), "utf8"))).toEqual([modulePath]);
  check(run(root));
  expect(contents(root)).toEqual(after);
  expect(readdirSync(backupRoot)).toEqual(backups);
});

test("partial, incompatible, duplicate and changed-helper installations refuse all writes", () => {
  for (const mode of ["version", "changed", "duplicate", "partial", "missing-helper", "changed-helper", "unexpected-helper", "residual-original", "moved-marker"]) {
    const root = sandbox(mode);
    const target = join(root, files.at(-1)!);
    const original = readFileSync(target, "utf8");
    if (mode === "version") writeFileSync(join(root, "package.json"), '{"version":"0.85.0"}');
    else if (mode === "changed") writeFileSync(target, original.replace("extends Container", "extends OtherContainer"));
    else if (mode === "duplicate") writeFileSync(target, original + "extends Container {");
    else if (mode === "unexpected-helper") writeFileSync(join(root, modulePath), "unrelated file");
    else {
      check(run(root));
      if (mode === "partial") writeFileSync(target, original);
      else if (mode === "missing-helper") rmSync(join(root, modulePath));
      else if (mode === "changed-helper") writeFileSync(join(root, modulePath), "changed helper");
      else if (mode === "moved-marker") writeFileSync(target, readFileSync(target, "utf8").replace(marker + "\n", "") + marker);
      else writeFileSync(target, readFileSync(target, "utf8") + "extends Container {");
    }
    const before = contents(root);
    expect(run(root).exitCode).not.toBe(0);
    expect(contents(root)).toEqual(before);
  }
  const absent = join(temp, "absent");
  check(run(absent));
  expect(existsSync(absent)).toBe(false);
});

// Other test files mock bare pi-tui process-wide. Keep these native checks isolated.
if (sdk && !child) {
  test("real selector/input/editor checks pass in an isolated process", () => {
    const result = Bun.spawnSync([process.execPath, "test", import.meta.path], {
      env: { ...process.env, CONFIGS_DIALOGS_TEST_CHILD: "1", PI_CODING_AGENT_DIR: join(temp, "agent") }, timeout: 30_000,
    });
    if (result.exitCode) throw new Error(result.stderr.toString() + result.stdout.toString());
    expect(result.stderr.toString()).toContain("0 fail");
  });
}
function realTest(name: string, run: () => Promise<void>) {
  if (child) test(name, run);
}

const fixture = join(temp, "sdk");
let loaded: Promise<any> | undefined;
let externalResult: { status: string; content?: string } | Error = { status: "complete", content: "edited outside" };
const externalCalls: any[] = [];
function real() {
  return loaded ??= (async () => {
    mkdirSync(fixture);
    cpSync(join(sdk!, "dist"), join(fixture, "dist"), { recursive: true });
    copyFileSync(join(sdk!, "package.json"), join(fixture, "package.json"));
    symlinkSync(join(sdk!, "node_modules"), join(fixture, "node_modules"));
    // Work on original fixtures whether the live host is original or patched.
    const normalize = Bun.spawnSync(["python3", "-B", "-c", `
import runpy,pathlib,sys
m=runpy.run_path(sys.argv[1]); root=pathlib.Path(sys.argv[2])
s={n:(root/n).read_text() for n in m['EDITS']}
if (root/m['MODULE']).exists(): s[m['MODULE']]=(root/m['MODULE']).read_text()
m['patch_sources'](s)
if all(s[n].startswith(m['MARKER']) for n in m['EDITS']):
 for n in m['EDITS']: (root/n).write_text(m['transform'](n,s[n].removeprefix(m['MARKER']+'\\n'),True))
 (root/m['MODULE']).unlink()
`, patcher, fixture]);
    check(normalize);
    const originals = contents(fixture);
    check(run(fixture));
    // Only external process launching is replaced; native component methods,
    // input, editor, TUI text rendering, theme and countdown are real.
    mock.module(join(fixture, "dist/modes/interactive/external-editor.js"), () => ({
      editInExternalEditor: async (options: any) => {
        externalCalls.push(options);
        if (externalResult instanceof Error) throw externalResult;
        return externalResult;
      },
    }));
    const load = (file: string) => import(pathToFileURL(join(fixture, "dist/modes/interactive", file)).href);
    const tui = await import(pathToFileURL(join(sdk!, "node_modules/@earendil-works/pi-tui/dist/index.js")).href);
    const { KEYBINDINGS } = await import(pathToFileURL(join(fixture, "dist/core/keybindings.js")).href);
    tui.setKeybindings(new tui.KeybindingsManager(KEYBINDINGS));
    const colors = await load("theme/theme.js");
    colors.setThemeInstance(colors.loadThemeFromPath(fileURLToPath(new URL("../themes/osaka-jade.json", import.meta.url)), "truecolor"));
    return { originals, tui, colors,
      ...await load("components/extension-selector.js"), ...await load("components/extension-input.js"),
      ...await load("components/extension-editor.js"), ...await load("interactive-mode.js"),
    };
  })();
}
const preview: string[] = [];
afterAll(() => {
  if (child && process.env.PI_DIALOGS_PREVIEW && preview.length) writeFileSync(process.env.PI_DIALOGS_PREVIEW, preview.join("\n") + "\n");
});
const plain = (m: any, lines: string[]) => lines.map(m.tui.stripTerminalSequences).join("\n");
function bounded(m: any, component: any, width: number, cursor = false) {
  const lines = component.render(width);
  for (const line of lines) expect(m.tui.visibleWidth(line)).toBeLessThanOrEqual(width);
  if (cursor) {
    const marked = lines.filter((line: string) => line.includes(m.tui.CURSOR_MARKER));
    expect(marked).toHaveLength(1);
    const column = m.tui.visibleWidth(marked[0].split(m.tui.CURSOR_MARKER)[0]);
    expect(column).toBeLessThan(width);
  }
  return lines;
}
const widths = [1, 2, 4, 8, 20, 80];
const hostTui = () => ({ terminal: { rows: 30, columns: 200 }, requestRender() {}, stop() {}, start() {} });

realTest("selector/confirm chrome is inset and width-safe while original options and controls survive", async () => {
  const m = await real();
  const selected: string[] = [];
  let cancelled = 0;
  let expanded = 0;
  const options = ["First ◆ literal 界", "Second", "Yes", "No"];
  const selector = new m.ExtensionSelectorComponent("Agents 界", options, (value: string) => selected.push(value), () => cancelled++,
    { onToggleToolsExpanded: () => expanded++ });
  for (const width of widths) bounded(m, selector, width);
  const lines = selector.render(80);
  expect(plain(m, lines)).toContain("   ╭");
  expect(plain(m, lines)).toContain("   ◈ Agents 界");
  expect(plain(m, lines)).toContain("   ◆ First ◆ literal 界");
  expect(plain(m, lines)).toContain("   ◇ Second");
  expect(plain(m, lines)).not.toContain("→ ");
  selector.handleInput("j"); selector.handleInput("\n");
  expect(selected).toEqual(["Second"]);
  selector.handleInput("k"); selector.handleInput("\n");
  expect(selected.at(-1)).toBe(options[0]);
  selector.handleInput("\x0f"); expect(expanded).toBe(1);
  selector.handleInput("\x1b"); expect(cancelled).toBe(1);
  preview.push("Native selector", ...lines);
  // The host's actual confirm adapter delegates to this selector and maps Yes/No.
  let offered: string[] | undefined;
  const confirmHost = { showExtensionSelector: async (_title: string, values: string[]) => { offered = values; return "Yes"; } };
  expect(await m.InteractiveMode.prototype.showExtensionConfirm.call(confirmHost, "Delete?", "Keep ◆ detail")).toBe(true);
  expect(offered).toEqual(["Yes", "No"]);
  confirmHost.showExtensionSelector = async () => "No";
  expect(await m.InteractiveMode.prototype.showExtensionConfirm.call(confirmHost, "Delete?", "detail")).toBe(false);
  selector.dispose();
});

realTest("single-line input keeps editing, focus, paste and IME markers through tiny widths", async () => {
  const m = await real();
  let submitted = "";
  let cancelled = 0;
  const input = new m.ExtensionInputComponent("Agent name", "", (value: string) => submitted = value, () => cancelled++);
  input.focused = true;
  expect(input.input.focused).toBe(true);
  input.handleInput("\x1b[200~界🧪 literal ◆\x1b[201~");
  const value = input.input.getValue();
  for (const width of widths) bounded(m, input, width, true);
  expect(input.input.getValue()).toBe(value);
  input.invalidate();
  input.handleInput("\n"); expect(submitted).toBe(value);
  input.handleInput("\x1b"); expect(cancelled).toBe(1);
  input.focused = false;
  expect(input.render(80).join("\n")).not.toContain(m.tui.CURSOR_MARKER);
  preview.push("Native input", ...input.render(80));
  input.dispose();
});

realTest("multiline editor preserves wrapping, text, focus and external-editor callbacks", async () => {
  const m = await real();
  const events: string[] = [];
  const tui = { ...hostTui(), stop: () => events.push("stop"), start: () => events.push("start"),
    requestRender: (force?: boolean) => events.push(force ? "render-force" : "render") };
  let submitted = "";
  let cancelled = 0;
  const editor = new m.ExtensionEditorComponent(tui, { matches: (data: string, key: string) => data === "external" && key === "app.editor.external" },
    "System prompt", "first 界\nsecond ◆\nthird", (value: string) => submitted = value, () => cancelled++, {}, "test-editor");
  editor.focused = true;
  expect(editor.editor.focused).toBe(true);
  for (const width of widths) bounded(m, editor, width, true);
  const text = editor.editor.getText();
  editor.invalidate();
  expect(editor.editor.getText()).toBe(text);
  preview.push("Native editor", ...editor.render(80));
  // Native keyboard input still owns edits and multiline/paste interpretation.
  editor.handleInput("\x1b[200~ added\nline\x1b[201~");
  expect(editor.editor.getText()).toContain("added");
  editor.editor.onSubmit(editor.editor.getText());
  expect(submitted).toContain("added");
  editor.handleInput("\x1b"); expect(cancelled).toBe(1);
  const beforeExternal = editor.editor.getText();
  await editor.handleOpenExternalEditor();
  expect(externalCalls.at(-1)).toEqual({ command: "test-editor", content: beforeExternal });
  expect(editor.editor.getText()).toBe("edited outside");
  expect(events.slice(-3)).toEqual(["stop", "start", "render-force"]);
  externalResult = { status: "cancelled" };
  await editor.handleOpenExternalEditor();
  expect(editor.editor.getText()).toBe("edited outside");
  externalResult = new Error("external editor failed");
  await expect(editor.handleOpenExternalEditor()).rejects.toThrow("external editor failed");
  expect(events.slice(-3)).toEqual(["stop", "start", "render-force"]);
  externalResult = { status: "complete", content: "edited outside" };
  let externalKey = false;
  editor.handleOpenExternalEditor = async () => { externalKey = true; };
  editor.handleInput("external"); expect(externalKey).toBe(true);
});

realTest("live theme refresh recolors titles/options/hints without resetting selection, input or countdown", async () => {
  const m = await real();
  let cancelled = 0;
  const selector = new m.ExtensionSelectorComponent("Choose", ["first", "second"], () => {}, () => cancelled++,
    { timeout: 60_000, tui: hostTui() });
  const input = new m.ExtensionInputComponent("Type", "", () => {}, () => cancelled++, { timeout: 60_000, tui: hostTui() });
  const editor = new m.ExtensionEditorComponent(hostTui(), { matches: () => false }, "Edit", "kept 界", () => {}, () => {});
  selector.handleInput("j");
  input.handleInput("unchanged 界");
  // Drive the real countdown's display callbacks, without waiting for wall time.
  selector.countdown.onTick(17);
  input.countdown.onTick(13);
  const before = [selector.render(80), input.render(80), editor.render(80)];
  const timers = [selector.countdown, input.countdown];
  const value = input.input.getValue();
  m.colors.setThemeInstance(m.colors.loadThemeFromPath(fileURLToPath(new URL("../themes/woody.json", import.meta.url)), "truecolor"));
  selector.invalidate(); input.invalidate(); editor.invalidate();
  const after = [selector.render(80), input.render(80), editor.render(80)];
  expect(editor.editor.getText()).toBe("kept 界");
  expect(selector.selectedIndex).toBe(1);
  expect(input.input.getValue()).toBe(value);
  expect(selector.countdown).toBe(timers[0]); expect(input.countdown).toBe(timers[1]);
  expect(plain(m, after[0])).toContain("Choose (17s)");
  expect(plain(m, after[1])).toContain("Type (13s)");
  for (let i = 0; i < 3; i++) {
    expect(plain(m, before[i])).toBe(plain(m, after[i]));
    expect(before[i].join("\n")).not.toBe(after[i].join("\n"));
    expect(after[i].join("\n")).not.toContain("\x1b[38;2;67;145;135m");
  }
  selector.countdown.onExpire(); input.countdown.onExpire();
  expect(cancelled).toBe(2);
  selector.dispose(); input.dispose();
  m.colors.setThemeInstance(m.colors.loadThemeFromPath(fileURLToPath(new URL("../themes/osaka-jade.json", import.meta.url)), "truecolor"));
});
