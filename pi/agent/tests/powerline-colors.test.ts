import { expect, mock, test } from "bun:test";
import { readFileSync } from "node:fs";

mock.module("@earendil-works/pi-tui", () => ({
	Key: { ctrlAlt: (key: string) => `ctrl+alt+${key}` },
}));

const { default: planMode } = await import("../extensions/plan-mode/index.ts");

test("mode and thinking keep original gradients alongside the jade footer", async () => {
	const handlers = new Map<string, Function>();
	const commands = new Map<string, { handler: Function }>();
	const statuses = new Map<string, string>();
	const ctx = {
		hasUI: true,
		thinkingLevel: "medium",
		ui: { setStatus: (key: string, value: string) => statuses.set(key, value) },
		sessionManager: { getEntries: () => [] },
	};

	planMode({
		registerFlag() {},
		registerShortcut() {},
		registerCommand: (name: string, command: { handler: Function }) => commands.set(name, command),
		on: (name: string, handler: Function) => handlers.set(name, handler),
		getFlag: () => false,
		getActiveTools: () => ["read", "bash", "edit", "write"],
		setActiveTools() {},
		appendEntry() {},
	} as never);

	function check(key: string, label: string, first: string, last: string) {
		const rendered = statuses.get(key)!;
		const colors = [...rendered.matchAll(/\x1b\[38;2;(\d+;\d+;\d+)m/g)].map((match) => match[1]);
		expect(rendered.replace(/\x1b\[[0-9;]*m/g, "")).toBe(label);
		expect(colors[0]).toBe(first);
		expect(colors.at(-1)).toBe(last);
		expect(new Set(colors).size).toBeGreaterThan(3);
		expect(rendered.endsWith("\x1b[0m")).toBe(true);
		return colors;
	}

	await handlers.get("session_start")!({}, ctx);
	check("agent-mode", "\uF121  build mode", "255;255;255", "243;238;223");
	const build = check("agent-thinking", "think:med", "255;255;255", "243;238;223");
	expect(build[4]).toBe("175;225;235");

	await commands.get("plan")!.handler("", ctx);
	check("agent-mode", "\uF022  plan mode", "255;255;255", "243;238;223");
	const plan = check("agent-thinking", "think:med", "255;255;255", "243;238;223");
	expect(plan[4]).toBe("196;160;230");

	for (const level of ["off", "minimal", "low", "high", "xhigh", "max"]) {
		ctx.thinkingLevel = level;
		await handlers.get("thinking_level_select")!({}, ctx);
		check("agent-thinking", `think:${level === "minimal" ? "min" : level}`, "255;255;255", "243;238;223");
	}

	const { colors } = JSON.parse(readFileSync(new URL("../extensions/powerline-footer/theme.json", import.meta.url), "utf8"));
	expect(colors.model).toBe("#5fa876");
	expect(colors.path).toBe("#dedec5");
	expect(colors.contextError).toBe("#c7837c");
});
