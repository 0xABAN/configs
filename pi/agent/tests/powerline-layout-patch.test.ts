import { afterAll, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const patcher = fileURLToPath(new URL("../patches/powerline-layout.py", import.meta.url));
const describe = Bun.spawnSync(["python3", "-B", "-c", `
import importlib.util,json,sys
spec=importlib.util.spec_from_file_location('patcher',sys.argv[1])
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
m.EDITS['segments.ts'].append(m.UNSTAGED_EDIT)
m.EDITS['index.ts'].append(m.SEPARATOR_ARGUMENT_EDIT)
m.EDITS['index.ts'].append(m.SEPARATOR_EDIT)
print(json.dumps({'edits':m.EDITS,'align':m.ALIGN,'meter':m.METER,'legacyAlign':m.LEGACY_ALIGN,'legacySeparator':m.LEGACY_SEPARATOR}))
`, patcher]);
if (describe.exitCode !== 0) throw new Error(describe.stderr.toString());
const { edits, align, meter, legacyAlign, legacySeparator } = JSON.parse(describe.stdout.toString()) as {
  edits: Record<string, [string, string][]>; align: string; meter: string;
  legacyAlign: string; legacySeparator: string;
};
const root = mkdtempSync(join(tmpdir(), "powerline-layout-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

function sandbox(name: string) {
  const home = join(root, name);
  const dir = join(home, ".pi/agent/git/github.com/nicobailon/pi-powerline-footer");
  mkdirSync(dir, { recursive: true });
  for (const [file, replacements] of Object.entries(edits)) {
    writeFileSync(join(dir, file), replacements.map(([old]) => old).join("\n") + "\n// existing DJ patch\n");
  }
  const run = () => Bun.spawnSync(["python3", "-B", patcher], { env: { ...process.env, HOME: home } });
  const contents = () => Object.fromEntries(Object.keys(edits).map(file => [file, readFileSync(join(dir, file), "utf8")]));
  return { dir, run, contents };
}

test("patch is repeatable and preserves existing changes", () => {
  const app = sandbox("valid");
  expect(app.run().exitCode).toBe(0);
  const patched = app.contents();
  expect(Object.values(patched).every(s => s.includes("// existing DJ patch"))).toBe(true);
  expect(app.run().exitCode).toBe(0);
  expect(app.contents()).toEqual(patched);
});

test("existing layouts upgrade only the unstaged count color", () => {
  const app = sandbox("count-color");
  expect(app.run().exitCode).toBe(0);
  const current = app.contents();
  const [oldCount, newCount] = edits["segments.ts"].at(-1)!;
  writeFileSync(join(app.dir, "segments.ts"), current["segments.ts"].replace(newCount, oldCount));
  expect(app.run().exitCode).toBe(0);
  expect(app.contents()).toEqual(current);
  writeFileSync(join(app.dir, "segments.ts"), current["segments.ts"].replace(newCount, "unknown count renderer"));
  const before = app.contents();
  expect(app.run().exitCode).not.toBe(0);
  expect(app.contents()).toEqual(before);
});

test("existing layouts upgrade their chevron renderer", () => {
  const app = sandbox("chevron");
  expect(app.run().exitCode).toBe(0);
  const current = app.contents();
  const [oldSeparator, newSeparator] = edits["index.ts"].at(-1)!;
  writeFileSync(join(app.dir, "index.ts"), current["index.ts"].replace(newSeparator, oldSeparator));
  expect(app.run().exitCode).toBe(0);
  expect(app.contents()).toEqual(current);
});

test("existing right-hand groups upgrade to the green ball separator", () => {
  const app = sandbox("context-ball");
  expect(app.run().exitCode).toBe(0);
  const current = app.contents();
  const [oldArgument, newArgument] = edits["index.ts"].at(-2)!;
  const [, newSeparator] = edits["index.ts"].at(-1)!;
  writeFileSync(join(app.dir, "index.ts"), current["index.ts"]
    .replace(align, legacyAlign).replace(newSeparator, legacySeparator).replace(newArgument, oldArgument));
  expect(app.run().exitCode).toBe(0);
  expect(app.contents()).toEqual(current);
});

test("changed or partial anchors refuse all writes", () => {
  for (const partial of [false, true]) {
    const app = sandbox(String(partial));
    const file = join(app.dir, "types.ts");
    writeFileSync(file, partial ? edits["types.ts"][0][1] : "unknown upstream source");
    const before = app.contents();
    expect(app.run().exitCode).not.toBe(0);
    expect(app.contents()).toEqual(before);
  }
});

const transpiler = new Bun.Transpiler({ loader: "ts" });
const helpers = new Function("visibleWidth", "buildContentFromParts", "ansi", transpiler.transformSync(align + meter) +
  "\nreturn { buildAlignedContent, contextMeter };")(
  Bun.stringWidth,
  (parts: string[], _style: string, separator = "·") => parts.length ? " " + parts.join(` ${separator} `) + " " : "",
  { getFgAnsi: (r: number, g: number, b: number) => `\x1b[38;2;${r};${g};${b}m`, reset: "\x1b[0m" },
);

test("groups align by visible width without stripping gradients", () => {
  const left = "\x1b[38;2;95;168;118m模型\x1b[0m";
  const parts = [{ content: left, right: false }, { content: "20%", right: true }];
  const row = helpers.buildAlignedContent(parts, "dot", 40);
  expect(Bun.stringWidth(row)).toBe(40);
  expect(row).toContain(left);
  expect(row.endsWith("20% ")).toBe(true);
  expect(helpers.buildAlignedContent([], "dot", 0)).toBe("");
  expect(helpers.buildAlignedContent([parts[0]], "dot", 40)).toBe(` ${left} `);
  expect(Bun.stringWidth(helpers.buildAlignedContent([parts[1]], "dot", 40))).toBe(40);
  expect(Bun.stringWidth(helpers.buildAlignedContent(parts, "dot", 12))).toBe(12);
});

test("cost stays neutral while the ball and context stay jade", () => {
  const reset = "\x1b[0m";
  const green = "\x1b[38;2;95;168;118m";
  const cost = `\x1b[38;2;133;135;126m$52.14${reset}`;
  const context = `${green}[▰▰▰▱▱] 52% context${reset}`;
  const row = helpers.buildAlignedContent([
    { content: "model", right: false },
    { content: cost, right: true },
    { content: context, right: true },
  ], "chevron", 80);
  expect(row).toContain(`${cost} ${green}●${reset} ${context}`);
  expect(Bun.stringWidth(row)).toBe(80);
});

test("context meter clamps fill and preserves unknown and approximate usage", () => {
  const meter = helpers.contextMeter;
  expect(meter(0, false)).toBe("[▱▱▱▱▱] 0% context");
  expect(meter(20, false)).toBe("[▰▱▱▱▱] 20% context");
  expect(meter(100, false)).toBe("[▰▰▰▰▰] 100% context");
  expect(meter(120, true)).toBe("[▰▰▰▰▰] ~120% context");
  expect(meter(-20, false)).toBe("[▱▱▱▱▱] -20% context");
  expect(meter(null, false)).toBe("[-----] ? context");
  expect(meter(NaN, false)).toBe("[-----] ? context");
});

// Exercise the actual installed renderer, not a second implementation of its packing.
const installed = join(homedir(), ".pi/agent/git/github.com/nicobailon/pi-powerline-footer/index.ts");
test.skipIf(!existsSync(installed))("configured chevron uses the requested glyph without changing other styles", () => {
  const settings = JSON.parse(readFileSync(new URL("../settings.json", import.meta.url), "utf8"));
  expect(settings.powerline.separator).toBe("chevron");
  const source = readFileSync(installed, "utf8");
  const start = source.indexOf("function buildContentFromParts(");
  const end = source.indexOf("\n}\n", start) + 2;
  const render = new Function("getSeparator", "getFgAnsiCode", "ansi",
    transpiler.transformSync(source.slice(start, end)) + "\nreturn buildContentFromParts;")(
    (style: string) => ({ left: style === "chevron" ? "›" : "·" }), () => "", { reset: "" },
  );
  expect(render(["model", "main"], settings.powerline.separator)).toBe(" model ❯ main ");
  expect(render(["model", "main"], "dot")).toBe(" model · main ");
});

test.skipIf(!existsSync(installed))("installed unstaged count uses sage without changing its label", () => {
  const source = readFileSync(join(installed, "../segments.ts"), "utf8");
  const count = source.split("\n").find(line => line.includes('`*${gitStatus.unstaged}`'))!;
  const indicators: string[] = [];
  new Function("indicators", "applyColor", "ctx", "gitStatus", count)(
    indicators, (_theme: unknown, color: string, text: string) => `${color}:${text}`, { theme: {} }, { unstaged: 3 },
  );
  expect(indicators).toEqual(["#85877e:*3"]);
});
test.skipIf(!existsSync(installed))("installed layout preserves right alignment through narrow overflow", () => {
  const source = readFileSync(installed, "utf8");
  const start = source.indexOf("/** Render a single segment");
  const end = source.indexOf("// Extension\n", start);
  expect(start).toBeGreaterThan(0);
  expect(end).toBeGreaterThan(start);
  const js = transpiler.transformSync(source.slice(start, end));
  const config = { separator: "dot" };
  const compute = new Function("config", "renderSegment", "visibleWidth", "getSeparator", "getFgAnsiCode", "ansi", "mergeSegmentsWithCustomItems",
    js + "\nreturn computeResponsiveLayout;")(
    config, (id: string) => ({ visible: id !== "hidden", content: id }), Bun.stringWidth,
    () => ({ left: "·" }), () => "", { reset: "", getFgAnsi: () => "" },
    () => ({ leftSegments: ["model", "branch", "hidden"], rightSegments: ["cost", "meter"], secondarySegments: ["mode"] }),
  );
  const wide = compute({}, {}, 80);
  expect(wide.topContent).toBe(" model · branch · mode" + " ".repeat(45) + "cost ● meter ");
  expect(Bun.stringWidth(wide.topContent)).toBe(80);
  for (const width of [0, 7, 16, 25, 40]) {
    const rows = compute({}, {}, width);
    expect(Bun.stringWidth(rows.topContent)).toBeLessThanOrEqual(width);
    expect(Bun.stringWidth(rows.secondaryContent)).toBeLessThanOrEqual(width);
  }
  expect(compute({}, {}, 16).secondaryContent.endsWith("cost ● meter ")).toBe(true);
});
