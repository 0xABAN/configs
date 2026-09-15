import { expect, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { copySdk, describePatch, temporaryDirectory } from "./support/patch-fixtures";

const patcher = fileURLToPath(new URL("../patches/pi-editor-gap.py", import.meta.url));
const { HOST, SOURCE, EDIT, MARKER } = describePatch<{
  HOST: string;
  SOURCE: string;
  EDIT: [string, string, number];
  MARKER: string;
}>(patcher, "{'HOST':m['HOST'],'SOURCE':m['SOURCE'],'EDIT':m['EDIT'],'MARKER':m['MARKER']}");
const sdk = process.env.PI_SDK_ROOT;
const temp = temporaryDirectory("pi-editor-gap-");

function run(root: string) {
  return Bun.spawnSync(["python3", "-B", patcher], {
    env: { ...process.env, PI_SDK_ROOT: root, HOME: root },
  });
}

function fixture(name: string) {
  if (!sdk) throw new Error("PI_SDK_ROOT is required");
  const root = join(temp, name);
  copySdk(sdk, root);
  const path = join(root, HOST);
  writeFileSync(path, readFileSync(path, "utf8").replace(SOURCE, EDIT[0]));
  return root;
}

test("adds an idle editor gap without separating active loaders", () => {
  const root = fixture("valid");
  expect(run(root).exitCode).toBe(0);
  const patched = readFileSync(join(root, HOST), "utf8");
  expect(patched).toContain(MARKER);
  expect(patched).toContain("this.session.isCompacting");
  expect(patched).toContain("this.extensionWidgetsAbove.size > 0");
  expect(run(root).exitCode).toBe(0);
  expect(readFileSync(join(root, HOST), "utf8")).toBe(patched);
});

test("rejects a partial editor gap patch", () => {
  const root = fixture("partial");
  const path = join(root, HOST);
  writeFileSync(path, readFileSync(path, "utf8").replace(EDIT[0], EDIT[0] + "\n" + MARKER));
  const before = readFileSync(path, "utf8");
  expect(run(root).exitCode).not.toBe(0);
  expect(readFileSync(path, "utf8")).toBe(before);
});
