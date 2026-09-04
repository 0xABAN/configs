import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(process.env.HOME!, ".pi/agent/npm/node_modules/@juicesharp/rpiv-todo");
const read = (path: string) => readFileSync(join(root, path), "utf8");

test("removes todo dependency controls", () => {
	const types = read("tool/types.ts");
	const todo = read("todo.ts");
	const format = read("view/format.ts");
	const selectors = read("state/selectors.ts");

	expect(types).not.toContain("blockedBy: Type.Optional");
	expect(types).not.toContain("addBlockedBy: Type.Optional");
	expect(types).not.toContain("removeBlockedBy: Type.Optional");
	expect(todo).toContain("delete input.blockedBy");
	expect(todo).not.toContain("change status/fields/dependencies");
	expect(format).not.toContain("⛓");
	expect(selectors).toContain("selectShowTaskIds(_state: TaskState)");
});
