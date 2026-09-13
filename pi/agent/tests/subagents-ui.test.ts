import { afterAll, expect } from "bun:test";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { applySdkPatches, checkProcess as check, copyPackageSources, copySdk, describePatch, patchModule, temporaryDirectory } from "./support/patch-fixtures";
import { nativeSuite } from "./support/native-suite";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const patcher = fileURLToPath(new URL("../patches/subagents-ui.py", import.meta.url));
const pkg = process.env.PI_SUBAGENTS_ROOT ?? join(homedir(), ".pi/agent/npm/node_modules/@tintinweb/pi-subagents");
const sdkSource = process.env.PI_SDK_ROOT;
const temp = temporaryDirectory("subagents-ui-test-");
const sdk = join(temp, "sdk");
const { child, unitTest: test, nativeTest: realTest } = nativeSuite(import.meta.path, !!sdkSource && existsSync(pkg));
// Some replacements introduce later anchors. Build minimal counted seams in
// patch order, then reverse them; guard fixtures need no installed package.
const { sources, module: modulePath } = describePatch<{ sources: Record<string, string>; module: string }>(
  patcher, "{'sources':sources,'module':m['MODULE']}", `
sources = {}
for name, edits in m['EDITS'].items():
    source = ''
    for old, new, count in edits:
        missing = count - source.count(old)
        assert missing >= 0, (name, old)
        source += '\\n' + (old + '\\n') * missing
        source = source.replace(old, new)
    sources[name] = m['transform'](name, source, True)
    assert m['transform'](name, sources[name]) == source
`);
const files = Object.keys(sources);
const run = (root: string) => Bun.spawnSync(["python3", "-B", patcher], { env: { ...process.env, PI_SUBAGENTS_ROOT: root, HOME: root } });
function sandbox(name: string, native = false) {
  const root = join(temp, name);
  mkdirSync(root, { recursive: true });
  if (!native) {
    for (const [file, source] of Object.entries(sources)) {
      mkdirSync(dirname(join(root, file)), { recursive: true });
      writeFileSync(join(root, file), source);
    }
    writeFileSync(join(root, "package.json"), '{"version":"0.19.0","type":"module"}');
    return root;
  }
  copyPackageSources(join(pkg, "src"), join(root, "src"));
  copyFileSync(join(pkg, "package.json"), join(root, "package.json"));
  // Normalize only a complete, validated installation. Live sources stay read-only.
  const result = patchModule(patcher, `
root=pathlib.Path(sys.argv[2])
s={n:(root/n).read_text() for n in m['EDITS']}
if (root/m['MODULE']).exists(): s[m['MODULE']]=(root/m['MODULE']).read_text()
m['patch_sources'](s)
if all(v.startswith(m['MARKER']) for n,v in s.items() if n in m['EDITS']):
 for n in m['EDITS']: (root/n).write_text(m['transform'](n,s[n].removeprefix(m['MARKER']+'\\n'),True))
 (root/m['MODULE']).unlink()
`, [root]);
  check(result);
  return root;
}

function contents(root: string) {
  return Object.fromEntries([...files, modulePath].map(file => [file,
    existsSync(join(root, file)) ? readFileSync(join(root, file), "utf8") : null]));
}

test("absent installation is skipped without creating it", () => {
  const root = join(temp, "absent");
  check(run(root));
  expect(existsSync(root)).toBe(false);
});

test("validate all sources before writes; exact backups, unrelated edits and repeatability", () => {
  const root = sandbox("backup");
  writeFileSync(join(root, "src/index.ts"), readFileSync(join(root, "src/index.ts"), "utf8") + "\n// unrelated local edit\n");
  const before = contents(root);
  check(run(root));
  const after = contents(root);
  const backups = readdirSync(join(root, ".config/theme-backups"));
  expect(backups).toHaveLength(1);
  for (const file of files) {
    expect(readFileSync(join(root, ".config/theme-backups", backups[0], file), "utf8")).toBe(before[file]!);
  }
  expect(after["src/index.ts"]).toContain("// unrelated local edit");
  expect(JSON.parse(readFileSync(join(root, ".config/theme-backups", backups[0], "added-files.json"), "utf8"))).toEqual([modulePath]);
  check(run(root));
  expect(contents(root)).toEqual(after);
  expect(readdirSync(join(root, ".config/theme-backups"))).toEqual(backups);
});

test("unknown versions, changed/duplicate anchors and partial installations refuse before writes", () => {
  for (const mode of ["version", "changed", "duplicate", "partial", "missing-helper", "changed-helper", "unexpected-helper", "residual-original"]) {
    const root = sandbox(mode);
    if (mode === "version") writeFileSync(join(root, "package.json"), '{"version":"0.20.0"}');
    else if (mode === "changed") writeFileSync(join(root, "src/index.ts"), readFileSync(join(root, "src/index.ts"), "utf8").replace('renderCall(args, theme, context) {', 'renderCall( args, theme, context) {'));
    else if (mode === "duplicate") writeFileSync(join(root, "src/index.ts"), readFileSync(join(root, "src/index.ts"), "utf8") + 'renderCall(args, theme, context) {');
    else if (mode === "unexpected-helper") writeFileSync(join(root, modulePath), "user-owned file");
    else {
      const original = readFileSync(join(root, "src/index.ts"), "utf8");
      check(run(root));
      if (mode === "partial") writeFileSync(join(root, "src/index.ts"), original);
      else if (mode === "missing-helper") rmSync(join(root, modulePath));
      else if (mode === "changed-helper") writeFileSync(join(root, modulePath), "user-owned changed helper");
      else writeFileSync(join(root, "src/index.ts"), readFileSync(join(root, "src/index.ts"), "utf8") + 'renderCall(args, theme, context) {');
    }
    const before = contents(root);
    expect(run(root).exitCode).not.toBe(0);
    expect(contents(root)).toEqual(before);
  }
});

let loaded: Promise<any> | undefined;
function real() {
  return loaded ??= (async () => {
    copySdk(sdkSource!, sdk);
    applySdkPatches(sdk, ["pi-horizontal-inset", "pi-transcript"]);
    const root = sandbox("real", true);
    check(run(root));
    // Package dependencies remain read-only. Resolve SDK peers to Pi's own copy.
    const modules = join(root, "node_modules");
    mkdirSync(join(modules, "@earendil-works"), { recursive: true });
    for (const name of ["@sinclair", "croner", "nanoid", "typebox"]) {
      symlinkSync(join(dirname(dirname(pkg)), name), join(modules, name));
    }
    for (const name of ["pi-coding-agent", "pi-tui", "pi-ai", "pi-agent-core"]) {
      const target = name === "pi-coding-agent" ? sdk! : join(sdk!, "node_modules/@earendil-works", name);
      symlinkSync(target, join(modules, "@earendil-works", name));
    }
    const load = (file: string) => import(pathToFileURL(join(root, "src", file)).href);
    const tui = await import(pathToFileURL(join(sdk!, "node_modules/@earendil-works/pi-tui/dist/index.js")).href);
    const colors = await import(pathToFileURL(join(sdk!, "dist/modes/interactive/theme/theme.js")).href);
    colors.setThemeInstance(colors.loadThemeFromPath(fileURLToPath(new URL("../themes/osaka-jade.json", import.meta.url)), "truecolor"));
    return { root, load, tui, colors, theme: colors.theme,
      ...await load("agent-color.ts"), ...await load("ui/agent-chrome.ts"), ...await load("ui/agent-widget.ts"),
      ...await load("ui/fleet-list.ts"), ...await load("ui/conversation-viewer.ts"), ...await load("ui/workflow-card.ts"),
      ...await load("ui/workflow-dialog.ts"), ...await load("ui/select-item.ts"), ...await load("ui/agent-mention.ts"),
    };
  })();
}
const plain = (m: any, lines: string[]) => lines.map(m.tui.stripTerminalSequences).join("\n");
function within(m: any, lines: string[], width: number) {
  for (const line of lines) expect(m.tui.visibleWidth(line)).toBeLessThanOrEqual(width);
}
const noBackground = (lines: string[]) => expect(lines.join("\n")).not.toMatch(/\x1b\[(?:4[0-8]|10[0-7]|48;[^m]*)m/);
const record = (status = "running", id = "one") => ({
  id, type: "Explore", status, description: "Inspect 界 auth ◆ user content", startedAt: Date.now() - 12_000,
  completedAt: ["running", "queued"].includes(status) ? undefined : Date.now(),
  toolUses: 3, error: status === "error" ? "permission denied" : undefined,
  lifetimeUsage: { input: 100, output: 200, cacheRead: 0, cacheWrite: 0, totalTokens: 300, cost: { total: 0.02 } },
});
const preview: string[] = [];
afterAll(() => {
  if (child && process.env.SUBAGENTS_UI_PREVIEW && preview.length) writeFileSync(process.env.SUBAGENTS_UI_PREVIEW, preview.join("\n") + "\n");
});

realTest("shared foreground-only labels, geometric states and gutter preserve Unicode, images and cursor markers", async () => {
  const m = await real();
  const states = ["running", "queued", "completed", "steered", "stopped", "aborted", "error", "background"];
  const labels = states.map(status => m.agentState(status, m.theme));
  expect(plain(m, labels).split("\n")).toEqual(["◌", "○", "✓", "✓", "■", "×", "×", "◌"]);
  for (const color of ["red", "#439187", undefined]) {
    const name = m.renderAgentNameLabel("Worker 界", color, m.theme, { bold: true });
    expect(m.tui.stripTerminalSequences(name)).toBe("Worker 界");
    noBackground([name]);
  }
  const marker = "\x1b_pi:c\x07";
  for (const width of [1, 2, 4, 8, 12, 40, 80]) {
    const lines = m.renderAgentBody(width, () => [`${marker}◆ 界 more`]);
    within(m, lines, width);
    if (width > 1) expect(lines.join("\n")).toContain(marker);
  }
  const image = "\x1b_Ga=T,f=100;AAAA\x1b\\";
  expect(m.renderAgentBody(30, () => [image])[0]).toBe("   " + image);
});

realTest("AgentWidget uses render width, rounded branches, all states and real activity without badges", async () => {
  const m = await real();
  let component: any;
  const agents = [record("completed"), record("running", "two"), record("queued", "three")];
  const activity = new Map([["two", { activeTools: new Map([["read", "read"]]), toolUses: 2, responseText: "", turnCount: 2 }]]);
  const widget = new m.AgentWidget({ listAgents: () => agents }, activity);
  widget.setUICtx({ setStatus() {}, setWidget(_key: string, factory: any) {
    if (factory) component = factory({ terminal: { get columns() { throw new Error("must use render width"); } }, requestRender() {} }, m.theme);
  } });
  widget.update();
  for (const width of [1, 4, 8, 20, 80]) within(m, component.render(width), width);
  const lines = component.render(110);
  noBackground(lines);
  expect(plain(m, lines)).toContain("   ◈ Agents");
  expect(plain(m, lines)).toContain("╰─");
  expect(plain(m, lines)).toContain("1 queued");
  preview.push("AgentWidget", ...lines);
  for (const status of ["completed", "steered", "stopped", "aborted", "error"]) {
    agents.splice(0, agents.length, record(status));
    const rendered = plain(m, component.render(120));
    if (status !== "completed") expect(rendered).toContain(status === "steered" ? "turn limit" : status);
  }
  agents.splice(0, agents.length, record("running", "literal"));
  activity.set("literal", { activeTools: new Map(), toolUses: 0, responseText: "keep ├─ and ⎿ intact", turnCount: 1 });
  expect(plain(m, component.render(120))).toContain("keep ├─ and ⎿ intact");
  component.invalidate();
  widget.dispose();
});

realTest("FleetView keeps focus, selection, navigation and workflow rows inside the shared gutter", async () => {
  const m = await real();
  let component: any;
  const agents = [record("running")];
  agents[0].session = { messages: [], subscribe: () => () => {} };
  const tui = { focusedComponent: undefined, requestRender() {} };
  const fleet = new m.FleetList({ listAgents: () => agents }, new Map());
  fleet.setWorkflowSource(() => [{ id: "workflow", name: "Review 界", status: "running", doneCount: 1, totalCount: 3, startedAt: Date.now(), tokens: 42 }], () => {});
  fleet.setUICtx({ setWidget(_key: string, factory: any) { if (factory) component = factory(tui, m.theme); },
    onTerminalInput: () => () => {}, getEditorText: () => "", notify() {}, custom() { throw new Error("not opening a viewer"); } });
  fleet.update();
  for (const width of [1, 4, 8, 20, 80]) within(m, component.render(width), width);
  expect(plain(m, component.render(120))).toContain("   ● main");
  expect(fleet.handleKey("\x1b[B")).toEqual({ consume: true });
  expect(fleet.handleKey("\x1b[B")).toEqual({ consume: true });
  expect(plain(m, component.render(120))).toContain("● ◈ workflow");
  tui.focusedComponent = {};
  expect(fleet.handleKey("\x1b[B")).toBeUndefined();
  preview.push("FleetView", ...component.render(110));
  noBackground(component.render(110));
  fleet.dispose();
});

realTest("conversation viewer preserves Pi/You identity, literal user glyphs, markdown, steering cursor and stop controls", async () => {
  const m = await real();
  const messages = [{ role: "user", content: "Please keep ⎿ [Assistant] and 界 intact" },
    { role: "assistant", content: [{ type: "text", text: "**Found** the issue." }, { type: "toolCall", name: "read" }] },
    { role: "toolResult", content: [{ type: "text", text: "result 界" }] }];
  let steered = "";
  let stopped = 0;
  let closed = 0;
  const viewer = new m.ConversationViewer({ terminal: { rows: 40 }, requestRender() {} },
    { messages, subscribe: () => () => {} }, record(), undefined, m.theme, () => closed++, () => stopped++, undefined,
    (text: string) => steered = text);
  for (const width of [1, 4, 6, 8, 20, 80]) within(m, viewer.render(width), width);
  let lines = viewer.render(100);
  const text = plain(m, lines);
  expect(text).toContain("◆ You");
  expect(text).toContain("● Pi");
  expect(text).toContain("Please keep ⎿ [Assistant] and 界 intact");
  expect(text).toContain("Found the issue.");
  noBackground(lines);
  preview.push("Conversation", ...lines);
  viewer.handleInput("\r");
  lines = viewer.render(100);
  expect(lines.join("\n")).toContain("\x1b_pi:c\x07");
  viewer.handleInput("hello"); viewer.handleInput("\r");
  expect(steered).toBe("hello");
  viewer.handleInput("x"); expect(stopped).toBe(0);
  viewer.handleInput("x"); expect(stopped).toBe(1);
  expect(viewer.markdownCache.has(messages[1])).toBe(true);
  viewer.handleInput("m"); viewer.invalidate();
  expect(viewer.markdownCache.has(messages[1])).toBe(false);
  viewer.handleInput("\x1b"); expect(closed).toBe(1);
  viewer.dispose();
});

const workflowInput = () => ({
  task: { status: "running", workflowName: "Review authentication", startTime: Date.now() - 15_000 },
  progress: [
    { type: "workflow_agent", index: 0, label: "Inspect 界", state: "done", phaseIndex: 0, phaseTitle: "Review", tokens: 320, toolCalls: 3, durationMs: 2200 },
    { type: "workflow_agent", index: 1, label: "Verify", state: "start", phaseIndex: 1, phaseTitle: "Verify", promptPreview: "check\nthese\nfive\ninput\nlines", recordId: "child" },
  ], agentCount: 2,
});

realTest("workflow card/dialog keep geometric trees, all display states, narrow widths and dispatch", async () => {
  const m = await real();
  const input = workflowInput();
  const card = m.renderWorkflowCard(input, m.theme);
  const standalone = m.renderWorkflowCard({ ...input, showToolTitle: true }, m.theme);
  const actions: string[] = [];
  const dialog = new m.WorkflowDialog({ requestRender() {} }, () => input, m.theme, () => actions.push("close"),
    { onKill: () => actions.push("kill"), onPause: () => actions.push("pause"), onOpenAgent: () => actions.push("open") });
  for (const width of [1, 4, 8, 20, 80]) {
    within(m, card.render(width), width);
    within(m, standalone.render(width), width);
    within(m, dialog.render(width), width);
  }
  noBackground(card.render(100));
  expect(plain(m, standalone.render(100))).toContain("   ◈ SubagentWorkflow");
  expect(plain(m, card.render(100))).toContain("╰─");
  const states = ["done", "failed", "skipped", "blocked", "queued", "interrupted", "running"];
  expect(states.map(state => m.dialogRowGlyph(state, m.UNICODE_DIALOG_GLYPHS).color)).toEqual(
    ["muted", "error", "dim", "warning", "dim", "dim", "accent"]);
  dialog.handleInput("p"); dialog.handleInput("x"); dialog.handleInput("\x1b");
  expect(actions).toEqual(["pause", "kill", "close"]);
  preview.push("Workflow card", ...standalone.render(110), "Workflow dialog", ...dialog.render(110));
  dialog.dispose();
});

realTest("native menus retain plain original labels, unique numbering and mention insertion", async () => {
  const m = await real();
  const items = [{ id: 1 }, { id: 2 }];
  expect(await m.selectItem({ select: async (_title: string, rows: string[]) => {
    expect(rows).toEqual(["1. same", "2. same"]);
    return rows[1];
  } }, "Jobs", items, () => "same")).toBe(items[1]);
  const provider = m.createMentionProvider({ getSuggestions: async () => null,
    applyCompletion: (_lines: string[], _row: number, _col: number, item: any) => item.value },
    () => [{ kind: "type", handle: "explore", type: "Explore", description: "Inspect code" }], () => true);
  const result = await provider.getSuggestions(["@ex"], 0, 3);
  expect(result.items[0].label).toBe("◇ @explore");
  expect(provider.applyCompletion([], 0, 0, result.items[0], "@ex")).toBe("@explore");
});

realTest("schedule and workflow menus keep duplicate-row identity, confirmations and inspector callbacks", async () => {
  const m = await real();
  const schedules = await m.load("ui/schedule-menu.ts");
  const workflows = await m.load("ui/workflow-menu.ts");
  const jobs = ["first", "second"].map(id => ({ id, name: "same job", schedule: "0 * * * *", scheduleType: "cron",
    subagent_type: "Explore", prompt: "keep ◆ literal", enabled: true, runCount: 2, createdAt: "2026-09-13T00:00:00Z" }));
  let removed = "";
  await schedules.showSchedulesMenu({ ui: {
    select: async (title: string, rows: string[]) => { expect(title).toContain("Scheduled jobs"); return rows[1]; },
    confirm: async (_title: string, detail: string) => { expect(detail).toContain("keep ◆ literal"); return true; },
    notify() {},
  } }, { isActive: () => true, list: () => jobs, getNextRun: () => undefined, removeJob: (id: string) => removed = id });
  expect(removed).toBe("second");
  const tasks = ["first", "second"].map((id, index) => ({ ...workflowInput().task, id, startTime: index,
    meta: { name: "Same workflow" }, workflowProgress: [], agentCount: 0 }));
  let selectedId = "";
  await workflows.showWorkflowsMenu({ ui: {
    select: async (title: string, rows: string[]) => { expect(title).toBe("Workflows"); return rows.find(row => row.endsWith("first")); },
    custom: async (factory: any) => {
      const dialog = factory({ requestRender() {} }, m.theme, {}, () => {});
      selectedId = dialog.source().task.startTime === 0 ? "first" : "second";
      within(m, dialog.render(40), 40);
      dialog.dispose();
    },
  } }, { tasks: new Map(tasks.map(task => [task.id, task])), getRecord() {}, viewAgentConversation: async () => {}, getCtx() {} });
  expect(selectedId).toBe("first");
});

realTest("Agent call/results/streaming/notifications and workflow registrations retain details, expansion and theme changes", async () => {
  const m = await real();
  const tools: any[] = [];
  const messages = new Map();
  const commands = new Map();
  const entryRenderers = new Map();
  const handlers = new Map<string, any[]>();
  const api = { registerTool: (tool: any) => tools.push(tool),
    registerMessageRenderer: (name: string, render: any) => messages.set(name, render),
    registerEntryRenderer: (name: string, render: any) => entryRenderers.set(name, render),
    registerFlag() {}, registerCommand: (name: string, command: any) => commands.set(name, command),
    on: (name: string, callback: any) => handlers.set(name, [...handlers.get(name) ?? [], callback]),
    events: { on() {}, emit() {} }, getFlag() {}, getAllTools: () => [] };
  const extension = await m.load("index.ts");
  extension.default(api);
  const tool = tools.find(tool => tool.name === "Agent");
  const workflow = tools.find(tool => tool.name === "SubagentWorkflow");
  expect(tool.renderShell).toBe("self");
  expect(workflow.renderShell).toBe("self");
  const call = tool.renderCall({ subagent_type: "Explore", description: "Inspect auth 界" }, m.theme, {});
  expect(plain(m, call.render(100))).toContain("   ◈");
  preview.push("Inline Agent", ...call.render(110));
  for (const status of ["queued", "running", "background", "completed", "steered", "aborted", "stopped", "error"]) {
    const result = { details: { status, durationMs: 1500, toolUses: 3, tokens: "320 tokens", error: "denied", agentId: "one" },
      content: [{ type: "text", text: "literal ⎿ 界 output" }] };
    for (const expanded of [false, true]) {
      const component = tool.renderResult(result, { expanded, isPartial: status === "running" }, m.theme, {});
      for (const width of [1, 4, 8, 30, 100]) within(m, component.render(width), width);
      noBackground(component.render(100));
      if (status === "completed" && expanded) expect(plain(m, component.render(100))).toContain("literal ⎿ 界 output");
      if (status === "error") expect(plain(m, component.render(100))).toContain("Error: denied");
      if (!expanded) preview.push(...component.render(110));
    }
  }
  const notification = messages.get("subagent-notification")({ details: {
    description: "Reviewed auth", status: "completed", resultPreview: "literal ⎿ preview", toolUses: 3, totalTokens: 42, durationMs: 1200,
  } }, { expanded: false, outputPad: 2 }, m.theme);
  expect(plain(m, notification.render(100))).toContain("    ✓");
  expect(plain(m, notification.render(100))).toContain("literal ⎿ preview");
  preview.push("Completion notification", ...notification.render(110));
  noBackground(notification.render(100));
  for (const width of [1, 4, 8, 30, 100]) within(m, notification.render(width), width);
  // Native composition must not add its old box/pad around renderShell:self.
  const native = await import(pathToFileURL(join(sdk!, "dist/modes/interactive/components/tool-execution.js")).href);
  const shell = new native.ToolExecutionComponent("Agent", "test", { subagent_type: "Explore", description: "native shell" },
    { showImages: false }, tool, { requestRender() {} }, temp);
  shell.updateResult({ content: [{ type: "text", text: "full literal output" }], details: { status: "completed", durationMs: 1000, toolUses: 1 } });
  shell.setExpanded(true);
  expect(plain(m, shell.render(80))).toContain("   ◈");
  expect(plain(m, shell.render(80))).toContain("full literal output");
  noBackground(shell.render(80));
  const failed = tool.renderResult({ content: [{ type: "text", text: "blocked by policy" }] },
    { expanded: false }, m.theme, { isError: true });
  expect(failed.render(100).join("\n")).toContain(m.theme.fg("error", "blocked by policy"));

  // Native /agents owns the menu chrome; settings/type-list inputs
  // remain forwarded to their original SettingsList instances.
  for (const menu of ["Agent types", "Settings"]) {
    let selected = false;
    let shown = false;
    await commands.get("agents").handler("", { cwd: temp, ui: {
      notify() {}, select: async (_title: string, rows: string[]) => {
        if (selected) return undefined;
        selected = true;
        return rows.find(row => row.startsWith(menu));
      }, custom: async (factory: any) => {
        const component = factory({}, m.theme, {}, () => {});
        for (const width of [1, 2, 4, 8, 30, 60]) within(m, component.render(width), width);
        component.handleInput("\x1b[B");
        component.invalidate();
        within(m, component.render(30), 30);
        preview.push(menu + " menu", ...component.render(110));
        const beforeTheme = plain(m, component.render(80));
        m.colors.setThemeInstance(m.colors.loadThemeFromPath(fileURLToPath(new URL("../themes/woody.json", import.meta.url)), "truecolor"));
        component.invalidate();
        expect(plain(m, component.render(80))).toBe(beforeTheme);
        expect(component.render(80).join("\n")).not.toContain("\x1b[38;2;67;145;135m");
        m.colors.setThemeInstance(m.colors.loadThemeFromPath(fileURLToPath(new URL("../themes/osaka-jade.json", import.meta.url)), "truecolor"));
        shown = true;
        return undefined;
      },
    } });
    expect(shown).toBe(true);
  }
  const before = call.render(100).join("\n");
  const alternate = m.colors.loadThemeFromPath(fileURLToPath(new URL("../themes/woody.json", import.meta.url)), "truecolor");
  m.colors.setThemeInstance(alternate);
  call.invalidate();
  expect(call.render(100).join("\n")).not.toBe(before);
  m.colors.setThemeInstance(m.colors.loadThemeFromPath(fileURLToPath(new URL("../themes/osaka-jade.json", import.meta.url)), "truecolor"));
  // Do not run tools, session_start, or their persistence callbacks in UI tests.
  for (const callback of handlers.get("session_shutdown") ?? []) await callback({}, {});
});
