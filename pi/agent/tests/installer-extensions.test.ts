import { afterAll, expect, test } from "bun:test";
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = mkdtempSync(join(tmpdir(), "configs-installer-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));
const installer = new URL("../../../install.sh", import.meta.url);

function sandbox(name: string) {
  const cwd = join(root, name);
  const home = join(cwd, "home");
  const bin = join(cwd, "bin");
  mkdirSync(join(cwd, "pi/agent"), { recursive: true });
  mkdirSync(home);
  mkdirSync(bin);
  copyFileSync(installer, join(cwd, "install.sh"));
  writeFileSync(join(cwd, "pi/agent/mcp.json.example"), "{}\n");
  // Keep this installer test offline; assert the exact clone request and provide its output.
  writeFileSync(join(bin, "git"), `#!/bin/sh
set -eu
[ "$1" = clone ]
[ "$2" = https://github.com/0xABAN/pi-extensions.git ]
[ "$3" = "$HOME/dev/pi-extensions" ]
echo clone >> "$HOME/clone.log"
mkdir -p "$3/inline-skills"
echo '{}' > "$3/inline-skills/package.json"
`);
  chmodSync(join(bin, "git"), 0o755);
  const run = () => Bun.spawnSync(["bash", "install.sh"], {
    cwd, env: { ...process.env, HOME: home, PATH: `${bin}:${process.env.PATH}` },
  });
  return { home, run };
}

test("installer provisions missing extensions and never reclones an existing checkout", () => {
  const { home, run } = sandbox("fresh");
  expect(run().exitCode).toBe(0);
  const checkout = join(home, "dev/pi-extensions");
  expect(existsSync(join(checkout, "inline-skills/package.json"))).toBe(true);
  writeFileSync(join(checkout, "local-work.txt"), "keep my edits");
  expect(run().exitCode).toBe(0);
  expect(readFileSync(join(home, "clone.log"), "utf8")).toBe("clone\n");
  expect(readFileSync(join(checkout, "local-work.txt"), "utf8")).toBe("keep my edits");
});

test("installer rejects an outdated checkout before changing existing configs", () => {
  const { home, run } = sandbox("outdated");
  mkdirSync(join(home, "dev/pi-extensions"), { recursive: true });
  writeFileSync(join(home, ".zshrc"), "original");
  const result = run();
  expect(result.exitCode).toBe(1);
  expect(result.stderr.toString()).toContain("update the checkout");
  expect(readFileSync(join(home, ".zshrc"), "utf8")).toBe("original");
  expect(existsSync(join(home, "clone.log"))).toBe(false);
});
