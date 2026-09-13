import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { planModeHarness } from "./support/plan-mode-harness";

test("mode and thinking share softened build and purple plan gradients", async () => {
	const app = planModeHarness([], ["read", "bash", "edit", "write"]);
	const { statuses, ctx } = app;

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

	await app.event("session_start");
	check("agent-mode", "\uF121  build mode", "255;255;255", "243;238;223");
	const build = check("agent-thinking", "think:med", "255;255;255", "243;238;223");
	expect(build[4]).toBe("218;235;232");

	await app.toggle();
	check("agent-mode", "\uF022  plan mode", "255;255;255", "243;238;223");
	const plan = check("agent-thinking", "think:med", "255;255;255", "243;238;223");
	expect(plan[4]).toBe("196;160;230");

	for (const level of ["off", "minimal", "low", "high", "xhigh", "max"]) {
		ctx.thinkingLevel = level;
		await app.event("thinking_level_select");
		check("agent-thinking", `think:${level === "minimal" ? "min" : level}`, "255;255;255", "243;238;223");
	}

	const { colors } = JSON.parse(readFileSync(new URL("../extensions/powerline-footer/theme.json", import.meta.url), "utf8"));
	expect(colors.model).toBe("#D8DAD8");
	expect(colors.gitClean).toBe("#dedec5");
	expect(colors.context).toBe("#439187");
	expect(colors.queue).toBe("#439187");
	expect(colors.thinkingLow).toBe("#439187");
	expect(colors.thinkingMedium).toBe("#439187");
	expect(colors.border).toBe("#326d65");
	expect(colors.path).toBe("#dedec5");
	expect(colors.contextError).toBe("#c7837c");
});
