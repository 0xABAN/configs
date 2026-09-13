import { expect } from "bun:test";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { applySdkPatches, copySdk, describePatch, temporaryDirectory } from "./support/patch-fixtures";
import { nativeSuite } from "./support/native-suite";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const patcher = fileURLToPath(new URL("../patches/pi-transcript.py", import.meta.url));
const { edits, module: modulePath } = describePatch<{ edits: Record<string, [string, string][]>; module: string }>(
  patcher, "{'edits':m['EDITS'],'module':m['MODULE']}");
const temp = temporaryDirectory("pi-transcript-");
const sdk = process.env.PI_SDK_ROOT;
const { unitTest: test, nativeTest: realTest } = nativeSuite(import.meta.path, !!sdk);
const run = (root: string) => Bun.spawnSync(["python3", "-B", patcher], { env: { ...process.env, PI_SDK_ROOT: root, HOME: root } });

function sandbox(name: string) {
  const root = join(temp, name);
  mkdirSync(root, { recursive: true });
  writeFileSync(join(root, "package.json"), '{"version":"0.84.2","type":"module"}');
  for (const [file, changes] of Object.entries(edits)) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), changes.map(([old]) => old).join("\n") + "\n// unrelated edit\n");
  }
  return root;
}

function contents(root: string) {
  return Object.fromEntries([...Object.keys(edits), modulePath].map(file => [file,
    existsSync(join(root, file)) ? readFileSync(join(root, file), "utf8") : null]));
}

test("complete previous revisions migrate together with exact backups; mixed revisions refuse", () => {
  const legacyEdits = JSON.parse(readFileSync(new URL("../patches/payloads/host/legacy/transcript-edits-v1.json", import.meta.url), "utf8")) as typeof edits;
  const preMetricsEdits = JSON.parse(readFileSync(new URL("../patches/payloads/host/legacy/transcript-edits-before-metrics.json", import.meta.url), "utf8")) as typeof edits;
  const revisions = [
    { changes: legacyEdits, helper: "transcript.js.inc" },
    { changes: legacyEdits, helper: "transcript-before-compact.js.inc" },
    { changes: preMetricsEdits, helper: "transcript-before-yellow-icon.js.inc" },
    { changes: preMetricsEdits, helper: "transcript-before-metrics.js.inc" },
  ];
  for (const { changes, helper } of revisions) {
    const root = sandbox(helper);
    for (const [file, changesForFile] of Object.entries(changes)) {
      let source = readFileSync(join(root, file), "utf8");
      for (const [old, patched] of changesForFile) source = source.replace(old, patched);
      writeFileSync(join(root, file), source);
    }
    const legacy = readFileSync(new URL(`../patches/payloads/host/legacy/${helper}`, import.meta.url), "utf8");
    writeFileSync(join(root, modulePath), legacy);
    // A recognizable old helper must not authorize a partially applied producer patch.
    const producer = "dist/core/tools/read.js";
    const source = readFileSync(join(root, producer), "utf8");
    writeFileSync(join(root, producer), source.replace(...edits[producer][0]));
    const mixed = contents(root);
    expect(run(root).exitCode).not.toBe(0);
    expect(contents(root)).toEqual(mixed);
    expect(existsSync(join(root, ".config/theme-backups"))).toBe(false);
    writeFileSync(join(root, producer), source);

    const before = contents(root);
    expect(run(root).exitCode).toBe(0);
    const backups = join(root, ".config/theme-backups");
    const names = readdirSync(backups);
    expect(names).toHaveLength(1);
    for (const [file, source] of Object.entries(before)) {
      expect(readFileSync(join(backups, names[0], file), "utf8")).toBe(source!);
    }
    expect(JSON.parse(readFileSync(join(backups, names[0], "added-files.json"), "utf8"))).toEqual([]);
    const after = contents(root);
    expect(run(root).exitCode).toBe(0);
    expect(contents(root)).toEqual(after);
    expect(readdirSync(backups)).toEqual(names);

    // A known old helper is not compatible with the new host imports by itself.
    for (const source of [legacy, legacy + "\n// local helper edit"]) {
      writeFileSync(join(root, modulePath), source);
      expect(run(root).exitCode).not.toBe(0);
      expect(readFileSync(join(root, modulePath), "utf8")).toBe(source);
      expect(readdirSync(backups)).toEqual(names);
    }
  }
});

for (const helper of ["transcript-before-tool-rows.js.inc", "transcript-before-native-padding.js.inc"]) {
  test(`${helper} upgrades alone and refuses mixed or modified sources`, () => {
    const previous = readFileSync(new URL(`../patches/payloads/host/legacy/${helper}`, import.meta.url), "utf8");
    const root = sandbox(helper);
    expect(run(root).exitCode).toBe(0);
    const current = contents(root);
    writeFileSync(join(root, modulePath), previous);
    const backupRoot = join(root, ".config/theme-backups");
    const originalBackups = readdirSync(backupRoot);

    expect(run(root).exitCode).toBe(0);
    expect(contents(root)).toEqual(current);
    const backups = readdirSync(backupRoot);
    const added = backups.filter(name => !originalBackups.includes(name));
    expect(added).toHaveLength(1);
    expect(readFileSync(join(backupRoot, added[0], modulePath), "utf8")).toBe(previous);
    expect(JSON.parse(readFileSync(join(backupRoot, added[0], "added-files.json"), "utf8"))).toEqual([]);
    expect(run(root).exitCode).toBe(0);
    expect(contents(root)).toEqual(current);
    expect(readdirSync(backupRoot)).toEqual(backups);

    for (const state of ["modified-helper", "partial-producer"]) {
      const invalid = sandbox(`${helper}-${state}`);
      expect(run(invalid).exitCode).toBe(0);
      writeFileSync(join(invalid, modulePath), previous + (state === "modified-helper" ? "\n// local edit" : ""));
      if (state === "partial-producer") {
        const file = "dist/core/tools/read.js";
        const [old, patched] = edits[file][0];
        writeFileSync(join(invalid, file), readFileSync(join(invalid, file), "utf8").replace(patched, old));
      }
      const before = contents(invalid);
      expect(run(invalid).exitCode).not.toBe(0);
      expect(contents(invalid)).toEqual(before);
      expect(readdirSync(join(invalid, ".config/theme-backups"))).toHaveLength(1);
    }
  });
}

test("transcript patch validates, backs up exact originals, and repeats without writes", () => {
  const root = sandbox("valid");
  const before = contents(root);
  expect(run(root).exitCode).toBe(0);
  const after = contents(root);
  const backupRoot = join(root, ".config/theme-backups");
  const backups = readdirSync(backupRoot);
  expect(backups).toHaveLength(1);
  for (const file of Object.keys(edits)) {
    expect(readFileSync(join(backupRoot, backups[0], file), "utf8")).toBe(before[file]!);
    expect(after[file]).toContain("// unrelated edit");
  }
  expect(JSON.parse(readFileSync(join(backupRoot, backups[0], "added-files.json"), "utf8"))).toEqual([modulePath]);
  expect(run(root).exitCode).toBe(0);
  expect(contents(root)).toEqual(after);
  expect(readdirSync(backupRoot)).toEqual(backups);
});

test("partial hosts, changed modules, duplicate anchors and wrong versions refuse all writes", () => {
  const last = Object.keys(edits).at(-1)!;
  for (const state of ["partial", "duplicate", "version", "missing-module", "changed-module", "unexpected-module", "residual-original"]) {
    const root = sandbox(state);
    if (state === "version") writeFileSync(join(root, "package.json"), '{"version":"0.85.0"}');
    else if (state === "partial") writeFileSync(join(root, last), edits[last][0][1]);
    else if (state === "duplicate") writeFileSync(join(root, last), edits[last][0][0].repeat(2));
    else if (state === "unexpected-module") writeFileSync(join(root, modulePath), "user-owned module");
    else {
      expect(run(root).exitCode).toBe(0);
      if (state === "missing-module") rmSync(join(root, modulePath));
      else if (state === "residual-original") writeFileSync(join(root, last), readFileSync(join(root, last), "utf8") + edits[last][0][0]);
      else writeFileSync(join(root, modulePath), "user-owned edit");
    }
    const before = contents(root);
    expect(run(root).exitCode).not.toBe(0);
    expect(contents(root)).toEqual(before);
  }
  expect(run(join(temp, "absent")).exitCode).toBe(0);
});

const fixture = join(temp, "real-sdk");
let loaded: Promise<any> | undefined;
function real() {
  return loaded ??= (async () => {
    copySdk(sdk!, fixture);
    applySdkPatches(fixture, ["pi-horizontal-inset"]);
    // Apply the checkout's guarded migration to the disposable supported host.
    const result = run(fixture);
    if (result.exitCode) throw new Error(result.stderr.toString());
    const load = (file: string) => import(pathToFileURL(join(fixture, "dist/modes/interactive", file)).href);
    const tui = await import(pathToFileURL(join(fixture, "node_modules/@earendil-works/pi-tui/dist/index.js")).href);
    const colors = await load("theme/theme.js");
    colors.setThemeInstance(colors.loadThemeFromPath(fileURLToPath(new URL("../themes/osaka-jade.json", import.meta.url)), "truecolor"));
    return { ...await load("components/transcript.js"), ...await load("components/user-message.js"),
      ...await load("components/assistant-message.js"), ...await load("components/tool-execution.js"),
      ...await load("interactive-mode.js"), SessionManager: (await load("../../core/session-manager.js")).SessionManager, tui, colors };
  })();
}

const timestamp = 1_750_000_000_000;
const assistant = (content: any[], extra = {}) => ({ role: "assistant", content, timestamp, stopReason: "stop", ...extra });
const toolCall = (id: string, name: string, args: object) => ({ type: "toolCall", id, name, arguments: args });
const result = (id: string, name: string, text: string, isError = false) => ({ role: "toolResult", toolCallId: id, toolName: name,
  content: [{ type: "text", text }], isError, timestamp });

function host(m: any, sessionManager = m.SessionManager.inMemory(temp)) {
  const app = Object.create(m.InteractiveMode.prototype);
  Object.assign(app, {
    isInitialized: true, chatContainer: new m.TranscriptContainer(), pendingTools: new Map(),
    loadedResourcesContainer: new m.tui.Container(), toolOutputExpanded: false, outputPad: 1,
    hideThinkingBlock: true, hiddenThinkingLabel: "Thinking…", footer: { invalidate() {} },
    ui: { requestRender() {} }, runtimeHost: { session: { retryAttempt: 0,
      sessionManager,
      settingsManager: { getShowCacheMissNotices: () => false, getShowImages: () => true, getImageWidthCells: () => 60, getShowTerminalProgress: () => false },
    } },
    getRegisteredToolDefinition: () => undefined, getMarkdownThemeWithSettings: () => m.colors.getMarkdownTheme(),
    getMarkdownTransformers: () => [], updatePendingMessagesDisplay() {}, maybeShowCacheMissNotice() {}, showStatus() {}, showError() {}, clearStatusIndicator() {},
  });
  return app;
}

function transcript(m: any, app: any, width = 90) {
  return app.chatContainer.render(width).map(m.tui.stripTerminalSequences).join("\n");
}

realTest("only the Pi speaker icon uses warning yellow", async () => {
  const m = await real();
  const theme = m.colors.theme;
  const header = m.speakerHeader("Pi", undefined, 1, 80);
  expect(header).toContain(theme.fg("warning", "●"));
  expect(header).toContain(theme.bold(theme.fg("text", "Pi")));
  expect(m.speakerHeader("You", undefined, 1, 80)).toContain(theme.fg("accent", "◆"));
  expect(m.actionLines({ toolName: "read", args: { path: "a.ts" } }, 80)[0]).toContain(theme.fg("accent", "□"));
});

realTest("real streaming and replay share Pi/You headers, grouped actions and narration boundaries", async () => {
  const m = await real();
  const user = { role: "user", content: "Trace authentication.", timestamp };
  const call1 = assistant([{ type: "text", text: "I’ll inspect the handler." }, toolCall("a", "read", { path: "session.ts" }), toolCall("b", "grep", { pattern: "expiry", path: "src" })]);
  const middle = assistant([{ type: "text", text: "Now verify the failure." }, toolCall("c", "bash", { command: "bun test auth" })]);
  const done = assistant([{ type: "text", text: "The expiry check is incorrect." }]);
  const a = result("a", "read", "SECRET_EXPANDED_DETAIL");
  const b = result("b", "grep", "src/session.ts:5: expiry");
  const c = result("c", "bash", "Expected an active session", true);
  const items = [user, call1, a, b, middle, c, done];
  const live = host(m);
  await live.handleEvent({ type: "message_start", message: user });
  for (const [message, results] of [[call1, [b, a]], [middle, [c]], [done, []]] as const) {
    await live.handleEvent({ type: "message_start", message });
    await live.handleEvent({ type: "message_update", message });
    await live.handleEvent({ type: "message_end", message });
    for (const item of results) {
      await live.handleEvent({ type: "tool_execution_start", toolCallId: item.toolCallId, toolName: item.toolName, args: {} });
      await live.handleEvent({ type: "tool_execution_end", toolCallId: item.toolCallId, result: item, isError: item.isError });
      live.sessionManager.appendMessage(item);
    }
  }
  const history = host(m, live.sessionManager);
  history.renderSessionItems(items);
  expect(transcript(m, live)).toBe(transcript(m, history));
  const text = transcript(m, live);
  expect(text.match(/● Pi/g)).toHaveLength(1);
  expect(text.match(/◆ You/g)).toHaveLength(1);
  expect(text).toContain("2 actions");
  expect(text).toContain("1 action");
  expect(text).toContain("├─ ✓ □ Read");
  expect(text).toContain("╰─ × ↯ Run");
  expect(text).toContain("Expected an active session");
  expect(text).not.toContain("SECRET_EXPANDED_DETAIL");
  expect(text.indexOf("session.ts")).toBeLessThan(text.indexOf("expiry"));
  expect(text.indexOf("expiry")).toBeLessThan(text.indexOf("Now verify"));
  expect(text.indexOf("Now verify")).toBeLessThan(text.indexOf("bun test auth"));
  expect(text.indexOf("bun test auth")).toBeLessThan(text.indexOf("The expiry check"));

  const children = [...live.chatContainer.children];
  live.setToolsExpanded(true);
  expect(transcript(m, live)).toContain("SECRET_EXPANDED_DETAIL");
  expect(transcript(m, live)).not.toContain("2 actions");
  live.setToolsExpanded(false);
  expect(transcript(m, live)).toBe(text);
  expect(live.chatContainer.children).toEqual(children);
  expect(call1.content).toHaveLength(3);

  // Clearing/rebuilding and changing the theme's caches must not retain a speaker.
  live.chatContainer.clear();
  live.renderSessionItems(items);
  live.chatContainer.invalidate();
  expect(transcript(m, live)).toBe(text);
});

realTest("parallel timings persist outside model context and replay from only the active branch", async () => {
  const m = await real();
  const manager = m.SessionManager.create(temp, join(temp, "timing-sessions"));
  const app = host(m, manager);
  const user = { role: "user", content: "Read both files.", timestamp };
  const call = assistant([toolCall("a", "read", { path: "a.ts" }), toolCall("b", "read", { path: "b.ts" })]);
  manager.appendMessage(user);
  const branchPoint = manager.appendMessage(call);
  const results = [
    { ...result("a", "read", "one\ntwo\n"), details: { configsTranscript: { lines: 2 } } },
    { ...result("b", "read", "three\n"), details: { configsTranscript: { lines: 1 } } },
  ];

  for (const id of ["a", "b"]) {
    await app.handleEvent({ type: "tool_execution_start", toolCallId: id, toolName: "read", args: { path: `${id}.ts` } });
  }
  await app.handleEvent({ type: "tool_execution_update", toolCallId: "a", toolName: "read", partialResult: results[0] });
  expect(manager.configsToolTimings.size).toBe(0);
  const liveTools = new Map(app.pendingTools);
  // Completion order differs from call/result-message order, as in parallel execution.
  for (const item of [results[1], results[0]]) {
    await app.handleEvent({ type: "tool_execution_end", toolCallId: item.toolCallId, toolName: "read", result: item, isError: false });
  }
  expect([...manager.configsToolTimings.keys()]).toEqual(["b", "a"]);
  for (const item of results) manager.appendMessage(item);
  expect(manager.configsToolTimings.size).toBe(0);
  const timings = manager.getBranch().filter((entry: any) => entry.configsToolTiming);
  expect(timings.map((entry: any) => entry.configsToolTiming.toolCallId)).toEqual(["a", "b"]);
  expect(timings.every((entry: any) => Number.isFinite(entry.configsToolTiming.durationMs) && entry.configsToolTiming.durationMs >= 0)).toBe(true);
  expect(manager.buildSessionContext().messages).toEqual([user, call, ...results]);

  const reopened = m.SessionManager.open(manager.getSessionFile());
  const replay = host(m, reopened);
  replay.renderSessionEntries(reopened.buildContextEntries());
  const replayTools = replay.chatContainer.children.filter((child: any) => child.transcriptRole === "tool");
  expect(replayTools).toHaveLength(2);
  for (const component of replayTools) {
    const live = liveTools.get(component.toolCallId);
    expect(component.transcriptDurationMs).toBe(live.transcriptDurationMs);
    for (const width of [90, 40, 24]) expect(m.actionLines(component, width)).toEqual(m.actionLines(live, width));
  }
  expect(transcript(m, replay)).not.toContain(m.TOOL_TIMING_FIELD);

  // Message-only rebuilds have no entry-wrapper metadata of their own.
  replay.chatContainer.clear();
  replay.renderSessionItems([call, ...results]);
  expect(replay.chatContainer.children.filter((child: any) => child.transcriptRole === "tool")
    .map((child: any) => child.transcriptDurationMs)).toEqual(replayTools.map((child: any) => child.transcriptDurationMs));

  reopened.appendCompaction("Earlier context summarized", branchPoint, 1000);
  replay.chatContainer.clear();
  replay.renderSessionEntries(reopened.buildContextEntries());
  expect(replay.chatContainer.children.filter((child: any) => child.transcriptRole === "tool")
    .map((child: any) => child.transcriptDurationMs)).toEqual(replayTools.map((child: any) => child.transcriptDurationMs));

  // Pi 0.84.2 keeps entries via firstKeptEntryId; verify an actual compacted-file reopen.
  const compactedManager = m.SessionManager.open(reopened.getSessionFile());
  const compactedReplay = host(m, compactedManager);
  compactedReplay.renderSessionEntries(compactedManager.buildContextEntries());
  expect(compactedReplay.chatContainer.children.filter((child: any) => child.transcriptRole === "tool")
    .map((child: any) => child.transcriptDurationMs)).toEqual(replayTools.map((child: any) => child.transcriptDurationMs));

  reopened.branch(branchPoint);
  replay.chatContainer.clear();
  replay.renderSessionEntries(reopened.buildContextEntries());
  expect(replay.chatContainer.children.filter((child: any) => child.transcriptRole === "tool")
    .every((child: any) => child.transcriptDurationMs === undefined)).toBe(true);
});

realTest("calls cancelled before starting never queue a timing", async () => {
  const m = await real();
  const queued = host(m);
  const message = assistant([toolCall("queued", "read", { path: "queued.ts" })]);
  await queued.handleEvent({ type: "message_start", message });
  await queued.handleEvent({ type: "message_update", message });
  const pending = queued.pendingTools.get("queued");
  await queued.handleEvent({ type: "message_end", message: { ...message, stopReason: "aborted" } });
  expect(pending.result.isError).toBe(true);
  expect(pending.transcriptDurationMs).toBeUndefined();
  expect(queued.sessionManager.configsToolTimings.size).toBe(0);
});

realTest("timing adds no independent writes or history nodes and shares the canonical result write", async () => {
  const m = await real();
  const directory = join(temp, "timing-single-write");
  const manager = m.SessionManager.create(temp, directory);
  const user = { role: "user", content: "Read a.ts", timestamp };
  const call = assistant([toolCall("a", "read", { path: "a.ts" })]);
  const output = { ...result("a", "read", "file content"), details: "custom scalar details stay intact" };
  manager.appendMessage(user);
  manager.appendMessage(call);
  const originalEntries = manager.getEntries();
  const originalLeaf = manager.getLeafId();
  const originalFile = readFileSync(manager.getSessionFile(), "utf8");
  const writes: any[] = [];
  const persist = manager._persist;
  manager._persist = function (entry: any) {
    writes.push(entry);
    return persist.call(this, entry);
  };
  const app = host(m, manager);
  await app.handleEvent({ type: "tool_execution_start", toolCallId: "a", toolName: "read", args: { path: "a.ts" } });
  // A timing observation must not touch disk, even when session storage is unavailable.
  renameSync(directory, `${directory}-offline`);
  try {
    await app.handleEvent({ type: "tool_execution_end", toolCallId: "a", toolName: "read", result: output, isError: false });
  } finally {
    renameSync(`${directory}-offline`, directory);
  }
  expect(writes).toHaveLength(0);
  expect(manager.getEntries()).toEqual(originalEntries);
  expect(manager.getLeafId()).toBe(originalLeaf);
  expect(readFileSync(manager.getSessionFile(), "utf8")).toBe(originalFile);
  const id = manager.appendMessage(output);
  expect(writes).toHaveLength(1);
  expect(manager.getEntry(id).message).toBe(output);
  expect(manager.getEntry(id).configsToolTiming.toolCallId).toBe("a");
  expect(output.details).toBe("custom scalar details stay intact");
  expect(manager.configsToolTimings.size).toBe(0);
  const reopened = m.SessionManager.open(manager.getSessionFile());
  expect(reopened.buildSessionContext().messages).toEqual([user, call, output]);
  expect(m.collectToolTimings(reopened.getBranch()).size).toBe(1);

  // Native canonical-write errors remain visible to the caller, never swallowed/retried.
  const failing = m.SessionManager.inMemory(temp);
  failing.configsToolTimings.set("a", { toolCallId: "a", toolName: "read", durationMs: 100 });
  failing._persist = () => { throw new Error("canonical write failed"); };
  expect(() => failing.appendMessage(output)).toThrow("canonical write failed");
});

realTest("pending timing queues clear on run and session boundaries; persisted branch copies retain metadata", async () => {
  const m = await real();
  const timing = { toolCallId: "a", toolName: "read", durationMs: 1250 };
  const manager = m.SessionManager.create(temp, join(temp, "timing-boundaries"));
  manager.appendMessage(assistant([toolCall("a", "read", { path: "a.ts" })]));
  manager.configsToolTimings.set("a", timing);
  const resultId = manager.appendMessage(result("a", "read", "ok"));
  const savedFile = manager.getSessionFile();

  const mutations = [
    () => manager.createBranchedSession(resultId),
    () => manager.setSessionFile(savedFile),
    () => manager.branch(resultId),
    () => manager.resetLeaf(),
    () => manager.newSession(),
  ];
  for (const mutate of mutations) {
    manager.configsToolTimings.set("abandoned", { ...timing, toolCallId: "abandoned" });
    mutate();
    expect(manager.configsToolTimings.size).toBe(0);
  }
  const original = m.SessionManager.open(savedFile);
  const copiedFile = original.createBranchedSession(resultId);
  const copied = m.SessionManager.open(copiedFile);
  expect(m.collectToolTimings(copied.getBranch()).get("a")).toEqual(timing);

  const memory = m.SessionManager.inMemory(temp);
  const memoryId = memory.appendMessage({ role: "user", content: "branch", timestamp });
  memory.configsToolTimings.set("a", timing);
  memory.createBranchedSession(memoryId);
  expect(memory.configsToolTimings.size).toBe(0);
  const app = host(m, memory);
  memory.configsToolTimings.set("abandoned", timing);
  await app.handleEvent({ type: "agent_end" });
  expect(memory.configsToolTimings.size).toBe(0);
});

realTest("session entries attach only valid matching primitive timing fields", async () => {
  const m = await real();
  const manager = m.SessionManager.inMemory(temp);
  const timing = { toolCallId: "a", toolName: "read", durationMs: 100 };
  for (const record of [null, { ...timing, toolCallId: "wrong" }, { ...timing, toolName: "edit" },
    { ...timing, durationMs: -1 }, { ...timing, durationMs: Infinity }, { ...timing, durationMs: "100" }]) {
    manager.configsToolTimings.set("a", record);
    const id = manager.appendMessage(result("a", "read", "ok"));
    expect(manager.getEntry(id).configsToolTiming).toBeUndefined();
    expect(manager.configsToolTimings.size).toBe(0);
  }
  manager.configsToolTimings.set("a", { ...timing, extra: { notPersisted: true } });
  const id = manager.appendMessage(result("a", "read", "ok"));
  expect(manager.getEntry(id).configsToolTiming).toEqual(timing);
  manager.configsToolTimings.set("a", timing);
  const userId = manager.appendMessage({ role: "user", content: "No timing on users", toolCallId: "a", toolName: "read", timestamp });
  expect(manager.getEntry(userId).configsToolTiming).toBeUndefined();
});

realTest("historical result timestamps never become inferred timings", async () => {
  const m = await real();
  const app = host(m);
  app.renderSessionItems([
    assistant([toolCall("old", "read", { path: "old.ts" })]),
    { ...result("old", "read", "old content"), timestamp: timestamp + 10_000 },
  ]);
  const tool = app.chatContainer.children.find((child: any) => child.transcriptRole === "tool");
  expect(tool.transcriptDurationMs).toBeUndefined();
  expect(m.tui.stripTerminalSequences(m.actionLines(tool, 40)[0])).not.toMatch(/\d+(?:\.\d+)?s/);
});

realTest("partial calls, unsafe arguments, error-only turns and narrow Unicode rows stay readable", async () => {
  const m = await real();
  const app = host(m);
  const component = new m.ToolExecutionComponent("read", "pending", {}, {}, undefined, app.ui, temp);
  app.chatContainer.addChild(component);
  expect(transcript(m, app)).toContain("○ □ Read");
  component.markExecutionStarted();
  component.updateArgs({ path: "界🙂\n\x1b[31msecret\x1b]0;injected\x07.ts", offset: 4 });
  expect(transcript(m, app)).toContain("◌ □ Read");
  expect(transcript(m, app)).not.toContain("injected");
  component.updateResult(result("pending", "read", "Operation aborted", true));
  expect(transcript(m, app)).toContain("Operation aborted");
  app.chatContainer.addChild(new m.AssistantMessageComponent(assistant([{ type: "text", text: "Stopped." }])));
  expect(transcript(m, app).match(/● Pi/g)).toHaveLength(1);
  app.chatContainer.addChild(new m.UserMessageComponent("界🙂 Hello"));
  app.chatContainer.addChild(new m.AssistantMessageComponent(assistant([{ type: "text", text: "界🙂 Hello" }])));
  for (const width of [90, 40, 20, 12, 8, 7, 6, 5, 4, 90]) {
    const rows = app.chatContainer.render(width);
    expect(rows.every((line: string) => m.tui.visibleWidth(line) <= width)).toBe(true);
  }
  const errorOnly = new m.AssistantMessageComponent(assistant([], { stopReason: "error", errorMessage: "Request failed" }));
  expect(errorOnly.render(80).map(m.tui.stripTerminalSequences).join("\n")).toContain("Request failed");
  const answer = new m.AssistantMessageComponent(assistant([{ type: "text", text: "Answer." }]));
  expect(answer.render(80).join("")).toContain("\x1b]133;A\x07");
  expect(answer.render(80).join("")).toContain("\x1b]133;C\x07");
});

realTest("regular and fullscreen hosts render the same transcript inside the existing inset", async () => {
  const m = await real();
  for (const mode of ["regular", "fullscreen"] as const) {
    const app = host(m);
    app.renderSessionItems([
      { role: "user", content: "Inspect session.ts", timestamp },
      assistant([toolCall("r", "read", { path: "session.ts" })]),
      result("r", "read", "FULL DETAIL"),
      assistant([{ type: "text", text: "Verified the session." }]),
    ]);
    const terminal = { columns: 90, rows: 30, write() {}, hideCursor() {}, showCursor() {}, start() {}, stop() {} };
    const tui = m.createInteractiveTui({ tuiMode: mode, terminal });
    tui.requestRender = () => {};
    tui.requestImmediateRender = () => {};
    const footer = new m.tui.Text("UNCHANGED FOOTER", 0, 0);
    if (mode === "regular") {
      tui.addChild(app.chatContainer);
      tui.addChild(footer);
    } else {
      tui.altScreenActive = true;
      tui.setLayoutRoot(new m.tui.VStack([
        { component: new m.tui.ScrollView(app.chatContainer, { scrollbar: "always" }), basis: 0, grow: 1 },
        { component: footer, basis: 1 },
      ]));
    }
    for (const width of [90, 40, 20]) {
      terminal.columns = width;
      tui.renderNow();
      const lines = mode === "regular" ? tui.previousLines : tui.previousScreen;
      const text = lines.map(m.tui.stripTerminalSequences).join("\n");
      expect(text).toContain("Pi");
      expect(text).toContain("You");
      expect(text).toContain("Read");
      expect(text).toContain("UNCHANGED FOOTER");
      expect(lines.every((line: string) => m.tui.visibleWidth(line) <= width)).toBe(true);
    }
  }
});

realTest("default tool bodies share transcript gutters without clipping wrapped Intercom output", async () => {
  const m = await real();
  const app = host(m);
  let outerPad = 1;
  app.chatContainer = new m.TranscriptContainer(() => outerPad);
  const intercom = {
    renderCall: () => new m.tui.Text(m.colors.theme.fg("accent", "intercom list-cwd"), 0, 0),
    renderResult: (output: any) => new m.tui.Text(m.colors.theme.fg("text", output.content[0].text), 0, 0),
  };
  // Intercom's actual renderer uses zero-padding Text components inside Pi's Box.
  // The generic fallback uses the host's Text instead; both share the same gutter.
  for (const definition of [intercom, undefined]) {
    const tool = new m.ToolExecutionComponent("intercom", "padding", {}, {}, definition, app.ui, temp);
    if (!definition) tool.setExpanded(true); // Generic fallback bodies are otherwise compacted.
    const output = result("padding", "intercom", "Current session:\n" + "界🙂 long session description ".repeat(20));
    tool.updateResult(output);
    app.chatContainer.clear();
    app.chatContainer.addChild(tool);
    const children = [...app.chatContainer.children];
    const state = tool.rendererState;

    for (const [width, pad] of [[120, 1], [90, 1], [80, 1], [79, 1], [40, 1], [12, 1], [8, 1], [90, 5], [90, 1]]) {
      outerPad = pad;
      const expectedPad = width < 80 ? 1 : pad + 2;
      const lines = app.chatContainer.render(width);
      const native = tool.render(width);
      const text = native.map(m.tui.stripTerminalSequences).filter((line: string) => line.trim());
      expect(text[0].match(/^ */)[0].length).toBe(expectedPad);
      expect(text.every((line: string) => line.startsWith(" ".repeat(expectedPad)) && line.endsWith(" ".repeat(expectedPad)))).toBe(true);
      expect(lines.every((line: string) => m.tui.visibleWidth(line) <= width)).toBe(true);
      expect(lines.slice(-native.length)).toEqual(native);
      expect(app.chatContainer.children).toEqual(children);
      expect(tool.result).toBe(output);
      expect(tool.rendererState).toBe(state);
    }
    tool.setExpanded(true);
    const expanded = app.chatContainer.render(90).map(m.tui.stripTerminalSequences);
    expect(expanded.find((line: string) => line.trimStart().startsWith("intercom"))).toMatch(/^   intercom/);
  }
});

realTest("native gutter changes leave self-framed and image bodies unchanged", async () => {
  const m = await real();
  const app = host(m);
  const definition = {
    renderCall: () => new m.tui.Text("native call", 0, 0),
    renderResult: () => new m.tui.Text("native result", 0, 0),
  };
  for (const renderShell of ["default", "self"]) {
    const create = () => new m.ToolExecutionComponent("custom", "native-padding", {}, { showImages: false },
      { ...definition, renderShell }, app.ui, temp);
    const tool = create();
    app.chatContainer.clear();
    app.chatContainer.addChild(tool);
    tool.updateResult(result("native-padding", "custom", "text first"));
    app.chatContainer.render(90);

    // A streamed image result must restore the native gutter, not retain the text gutter.
    const output = { content: [{ type: "image", data: "AA==", mimeType: "image/png" }], isError: false };
    tool.updateResult(output);
    const untouched = create();
    untouched.updateResult(output);
    const lines = app.chatContainer.render(90);
    const native = untouched.render(90);
    expect(lines.slice(-native.length)).toEqual(native);
    expect(tool.render(90)).toEqual(native);
  }
});

realTest("builtin-name overrides keep native cards beneath their invocation unless their formatter opts in", async () => {
  const m = await real();
  const app = host(m);
  const renderCall = () => new m.tui.Text("CUSTOM CALL CARD", 0, 0);
  const renderResult = () => new m.tui.Text("CUSTOM RESULT CARD", 0, 0);
  for (const slots of [{ renderCall }, { renderResult }, { renderCall, renderResult }]) {
    const definition = { renderShell: "self", ...slots };
    for (const owner of ["builtin", "npm:@heyhuynhgiabuu/pi-pretty", "npm:@heyhuynhgiabuu/pi-pretty@1.0.0", "project-extension"]) {
      app.runtimeHost.session.getToolDefinition = () => definition;
      app.runtimeHost.session.getAllTools = () => [{ name: "read", sourceInfo: { source: owner } }];
      const registered = m.InteractiveMode.prototype.getRegisteredToolDefinition.call(app, "read");
      expect(registered.configsTranscriptCompact).toBe(owner !== "project-extension");
      expect((definition as any).configsTranscriptCompact).toBeUndefined();
      const component = new m.ToolExecutionComponent("read", "override", { path: "a.ts" }, {}, registered, app.ui, temp);
      component.updateResult(result("override", "read", "result body"));
      app.chatContainer.clear();
      app.chatContainer.addChild(component);
      if (owner === "project-extension") {
        expect(transcript(m, app)).toContain("1 action");
        expect(transcript(m, app)).toContain("CUSTOM");
        const native = component.render(90);
        expect(app.chatContainer.render(90).slice(-native.length)).toEqual(native);
      } else {
        expect(transcript(m, app)).toContain("1 action");
        component.setExpanded(true);
        expect(transcript(m, app)).toContain("CUSTOM");
      }
    }
  }
});

realTest("custom renderers, hidden tools, image output and Markdown transformations are preserved", async () => {
  const m = await real();
  const app = host(m);
  const card = new m.ToolExecutionComponent("workflow", "card", {}, {}, {
    renderShell: "self", renderCall: () => ({ render: () => ["CUSTOM INTERACTIVE CARD"], invalidate() {} }),
  }, app.ui, temp);
  app.chatContainer.addChild(Object.freeze({ render: () => ["CUSTOM NOTICE"], invalidate() {} }));
  app.chatContainer.addChild(card);
  expect(transcript(m, app)).toContain("CUSTOM NOTICE");
  expect(transcript(m, app)).toContain("CUSTOM INTERACTIVE CARD");
  expect(transcript(m, app)).toContain("1 action");
  expect(transcript(m, app)).toMatch(/⌇ Tool\s+workflow/);
  expect(transcript(m, app).indexOf("Tool")).toBeLessThan(transcript(m, app).indexOf("CUSTOM INTERACTIVE CARD"));
  const hidden = new m.ToolExecutionComponent("read", "hidden", {}, {}, {
    renderShell: "self", renderCall: () => ({ render: () => [], invalidate() {} }),
  }, app.ui, temp);
  app.chatContainer.addChild(hidden);
  expect(transcript(m, app)).toContain("Read");

  const image = new m.ToolExecutionComponent("read", "image", { path: "test.png" }, { showImages: false }, undefined, app.ui, temp);
  image.updateResult({ content: [{ type: "image", data: "AA==", mimeType: "image/png" }], isError: false });
  app.chatContainer.addChild(image);
  expect(app.chatContainer.render(90).join("\n")).toContain(image.render(90).join("\n"));
  expect(transcript(m, app)).toContain("2 actions");

  const contexts: any[] = [];
  const transform = (text: string, context: any) => { contexts.push(context); return text.replace("user text", "TRANSFORMED"); };
  const user = new m.UserMessageComponent("user text", undefined, 1, [transform]);
  const rendered = user.render(80).join("");
  expect(rendered).toContain("TRANSFORMED");
  expect(rendered).toContain("\x1b]133;A\x07");
  expect(contexts[0].messageType).toBe("user");
  expect(contexts[0].availableWidth).toBeLessThan(80);
});

realTest("silent tools retain named invocation rows through execution, expansion, resize and replay", async () => {
  const m = await real();
  const definition = {
    renderShell: "self",
    renderCall: () => new m.tui.Text("", 0, 0),
    renderResult: () => new m.tui.Text("", 0, 0),
  };
  const app = host(m);
  app.getRegisteredToolDefinition = () => definition;
  const call = assistant([
    toolCall("s", "mcpScript", { query: "DO_NOT_ECHO_ARGUMENTS" }),
    toolCall("f", "quiet_tool", {}),
  ]);
  app.sessionManager.appendMessage(call);
  await app.handleEvent({ type: "message_start", message: call });
  await app.handleEvent({ type: "message_update", message: call });
  await app.handleEvent({ type: "message_end", message: call });
  expect(transcript(m, app)).toMatch(/○ ⌇ Tool\s+mcpScript/);
  expect(transcript(m, app)).toContain("2 actions");

  const results = [result("s", "mcpScript", "HIDDEN_RESULT"), result("f", "quiet_tool", "Permission denied", true)];
  for (const item of results) {
    const event = { toolCallId: item.toolCallId, toolName: item.toolName };
    await app.handleEvent({ type: "tool_execution_start", ...event, args: {} });
    expect(transcript(m, app)).toMatch(new RegExp(`◌ ⌇ Tool\\s+${item.toolName}`));
    await app.handleEvent({ type: "tool_execution_update", ...event, partialResult: { content: [{ type: "text", text: "PARTIAL_RESULT" }] } });
    expect(transcript(m, app)).toMatch(new RegExp(`◌ ⌇ Tool\\s+${item.toolName}`));
    await app.handleEvent({ type: "tool_execution_end", ...event, result: item, isError: item.isError });
    app.sessionManager.appendMessage(item);
  }
  const finished = transcript(m, app);
  expect(finished).toMatch(/✓ ⌇ Tool\s+mcpScript/);
  expect(finished).toMatch(/× ⌇ Tool\s+quiet_tool/);
  expect(finished).toContain("Permission denied");
  expect(finished).not.toContain("HIDDEN_RESULT");
  expect(finished).not.toContain("DO_NOT_ECHO_ARGUMENTS");

  const children = [...app.chatContainer.children];
  for (const expanded of [true, false]) {
    app.setToolsExpanded(expanded);
    for (const width of [40, 70, 120, 70, 40, 90]) {
      const rendered = app.chatContainer.render(width);
      const text = rendered.map(m.tui.stripTerminalSequences).join("\n");
      expect(text).toMatch(/⌇ Tool\s+mcpScript/);
      expect(text).toMatch(/⌇ Tool\s+quiet_tool/);
      expect(text).toContain("2 actions");
      expect(rendered.every((line: string) => m.tui.visibleWidth(line) <= width)).toBe(true);
      expect(app.chatContainer.children).toEqual(children);
    }
  }
  expect(transcript(m, app)).toBe(finished);
  const replay = host(m, app.sessionManager);
  replay.getRegisteredToolDefinition = () => definition;
  replay.renderSessionItems([call, ...results]);
  expect(transcript(m, replay)).toBe(finished);

  // Generic rows identify the registered tool, never infer labels from arbitrary arguments.
  const line = m.actionLines({ toolName: "constructor", args: { path: "DO_NOT_ECHO_ARGUMENTS" } }, 90)[0];
  expect(m.tui.stripTerminalSequences(line)).toMatch(/⌇ Tool\s+constructor/);
  expect(line).not.toContain("DO_NOT_ECHO_ARGUMENTS");
});

realTest("wide transcript output changes only the Pi icon color across error-row combinations", async () => {
  const m = await real();
  const previousPath = join(fixture, "dist/modes/interactive/components/transcript-previous.js");
  writeFileSync(previousPath, readFileSync(new URL("../patches/payloads/host/legacy/transcript.js.inc", import.meta.url), "utf8"));
  const previous = await import(pathToFileURL(previousPath).href);
  for (const count of [1, 2, 3]) {
    for (let failed = -1; failed < count; failed++) {
      const current = new m.TranscriptContainer();
      const old = new previous.TranscriptContainer();
      for (let index = 0; index < count; index++) {
        const component = () => ({
          transcriptRole: "tool", toolName: "read", args: { path: "src/界.ts" }, argsComplete: true,
          result: { isError: index === failed, content: [{ type: "text", text: "Permission denied" }] },
          render: () => ["native"], invalidate() {},
        });
        current.addChild(component());
        old.addChild(component());
      }
      for (const width of [80, 90, 120, 160]) {
        const withPreviousIcon = current.render(width).map((line: string) =>
          line.replace(m.colors.theme.fg("warning", "●"), m.colors.theme.fg("accent", "●")));
        expect(withPreviousIcon).toEqual(old.render(width));
      }
    }
  }
});

realTest("compact transcript reclaims gutters and blank rows without losing content or expansion", async () => {
  const m = await real();
  const app = host(m);
  let rows = 40;
  app.chatContainer = new m.TranscriptContainer(() => 1, () => rows);
  app.renderSessionItems([
    { role: "user", content: "Inspect 界.ts", timestamp },
    assistant([toolCall("r", "read", { path: "界.ts" })]),
    result("r", "read", "Permission denied\nFull native error details", true),
    assistant([{ type: "text", text: "The file could not be read." }]),
  ]);
  const children = [...app.chatContainer.children];
  const large = app.chatContainer.render(120);
  rows = 12;
  const short = app.chatContainer.render(120);
  const meaningful = (lines: string[]) => lines.map(m.tui.stripTerminalSequences).filter((line: string) => line.trim());
  expect(short.length).toBeLessThan(large.length);
  expect(meaningful(short)).toEqual(meaningful(large));

  for (const [width, height] of [[40, 12], [50, 16], [60, 20], [70, 12], [120, 12], [40, 40], [120, 40]]) {
    rows = height;
    const rendered = app.chatContainer.render(width);
    const text = rendered.map(m.tui.stripTerminalSequences).join("\n");
    expect(text).toContain("Permission denied");
    expect(text).toContain("界.ts");
    expect(rendered.every((line: string) => m.tui.visibleWidth(line) <= width)).toBe(true);
    expect(app.chatContainer.children).toEqual(children);
    for (const child of children.filter((c: any) => c.transcriptRole === "pi" || c.transcriptRole === "user")) {
      expect(child.outputPad).toBe(width < 80 ? 1 : 3);
    }
  }
  expect(app.chatContainer.render(120)).toEqual(large);
  const tool = children.find((child: any) => child.transcriptRole === "tool");
  tool.setExpanded(true);
  rows = 12;
  expect(transcript(m, app, 40)).toContain("Full native error details");
  expect(tool.expanded).toBe(true);
});
