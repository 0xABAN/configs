import { expect } from "bun:test";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
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

test("complete previous helper migrates with an exact backup; modified helpers still refuse", () => {
  const root = sandbox("previous-helper");
  expect(run(root).exitCode).toBe(0);
  const current = readFileSync(join(root, modulePath), "utf8");
  const legacy = readFileSync(new URL("../patches/payloads/host/legacy/transcript.js.inc", import.meta.url), "utf8");
  const backups = join(root, ".config/theme-backups");
  const before = readdirSync(backups);
  writeFileSync(join(root, modulePath), legacy);
  expect(run(root).exitCode).toBe(0);
  expect(readFileSync(join(root, modulePath), "utf8")).toBe(current);
  const added = readdirSync(backups).filter(name => !before.includes(name));
  expect(added).toHaveLength(1);
  expect(readFileSync(join(backups, added[0], modulePath), "utf8")).toBe(legacy);
  expect(JSON.parse(readFileSync(join(backups, added[0], "added-files.json"), "utf8"))).toEqual([]);
  expect(run(root).exitCode).toBe(0);
  expect(readdirSync(backups)).toHaveLength(before.length + 1);

  writeFileSync(join(root, modulePath), legacy + "\n// local helper edit");
  expect(run(root).exitCode).not.toBe(0);
  expect(readFileSync(join(root, modulePath), "utf8")).toBe(legacy + "\n// local helper edit");
  expect(readdirSync(backups)).toHaveLength(before.length + 1);
});

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
    // Make repeat runs work after the preview is installed, using the guarded anchors.
    for (const [file, changes] of Object.entries(edits)) {
      let source = readFileSync(join(fixture, file), "utf8");
      for (const [old, patched] of changes) source = source.replace(patched, old);
      writeFileSync(join(fixture, file), source);
    }
    rmSync(join(fixture, modulePath), { force: true });
    const result = run(fixture);
    if (result.exitCode) throw new Error(result.stderr.toString());
    const load = (file: string) => import(pathToFileURL(join(fixture, "dist/modes/interactive", file)).href);
    const tui = await import(pathToFileURL(join(fixture, "node_modules/@earendil-works/pi-tui/dist/index.js")).href);
    const colors = await load("theme/theme.js");
    colors.setThemeInstance(colors.loadThemeFromPath(fileURLToPath(new URL("../themes/osaka-jade.json", import.meta.url)), "truecolor"));
    return { ...await load("components/transcript.js"), ...await load("components/user-message.js"),
      ...await load("components/assistant-message.js"), ...await load("components/tool-execution.js"),
      ...await load("interactive-mode.js"), tui, colors };
  })();
}

const timestamp = 1_750_000_000_000;
const assistant = (content: any[], extra = {}) => ({ role: "assistant", content, timestamp, stopReason: "stop", ...extra });
const toolCall = (id: string, name: string, args: object) => ({ type: "toolCall", id, name, arguments: args });
const result = (id: string, name: string, text: string, isError = false) => ({ role: "toolResult", toolCallId: id, toolName: name,
  content: [{ type: "text", text }], isError, timestamp });

function host(m: any) {
  const app = Object.create(m.InteractiveMode.prototype);
  Object.assign(app, {
    isInitialized: true, chatContainer: new m.TranscriptContainer(), pendingTools: new Map(),
    loadedResourcesContainer: new m.tui.Container(), toolOutputExpanded: false, outputPad: 1,
    hideThinkingBlock: true, hiddenThinkingLabel: "Thinking…", footer: { invalidate() {} },
    ui: { requestRender() {} }, runtimeHost: { session: { retryAttempt: 0,
      sessionManager: { getCwd: () => temp },
      settingsManager: { getShowCacheMissNotices: () => false, getShowImages: () => true, getImageWidthCells: () => 60 },
    } },
    getRegisteredToolDefinition: () => undefined, getMarkdownThemeWithSettings: () => m.colors.getMarkdownTheme(),
    getMarkdownTransformers: () => [], updatePendingMessagesDisplay() {}, maybeShowCacheMissNotice() {}, showStatus() {},
  });
  return app;
}

function transcript(m: any, app: any, width = 90) {
  return app.chatContainer.render(width).map(m.tui.stripTerminalSequences).join("\n");
}

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
    }
  }
  const history = host(m);
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

realTest("builtin-name overrides stay native unless their known formatter source opts in", async () => {
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
        expect(transcript(m, app)).not.toContain("1 action");
        expect(transcript(m, app)).toContain("CUSTOM");
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
  expect(transcript(m, app)).not.toContain("1 action");
  const hidden = new m.ToolExecutionComponent("read", "hidden", {}, {}, {
    renderShell: "self", renderCall: () => ({ render: () => [], invalidate() {} }),
  }, app.ui, temp);
  app.chatContainer.addChild(hidden);
  expect(transcript(m, app)).not.toContain("Read");

  const image = new m.ToolExecutionComponent("read", "image", { path: "test.png" }, { showImages: false }, undefined, app.ui, temp);
  image.updateResult({ content: [{ type: "image", data: "AA==", mimeType: "image/png" }], isError: false });
  app.chatContainer.addChild(image);
  expect(app.chatContainer.render(90).join("\n")).toContain(image.render(90).join("\n"));
  expect(transcript(m, app)).not.toContain("1 action");

  const contexts: any[] = [];
  const transform = (text: string, context: any) => { contexts.push(context); return text.replace("user text", "TRANSFORMED"); };
  const user = new m.UserMessageComponent("user text", undefined, 1, [transform]);
  const rendered = user.render(80).join("");
  expect(rendered).toContain("TRANSFORMED");
  expect(rendered).toContain("\x1b]133;A\x07");
  expect(contexts[0].messageType).toBe("user");
  expect(contexts[0].availableWidth).toBeLessThan(80);
});

realTest("simplified connectors match the previous helper for every narrow and error-row combination", async () => {
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
      for (let width = 1; width <= 80; width++) expect(current.render(width)).toEqual(old.render(width));
    }
  }
});
