import { expect, mock, test } from "bun:test";

mock.module("@earendil-works/pi-ai", () => ({
	getSupportedThinkingLevels: () => ["off", "high", "xhigh"],
}));

const { default: extension } = await import("../extensions/effort.ts");

test("selects from thinking levels supported by the active model", async () => {
	let command: { handler: (args: string, ctx: unknown) => Promise<void> } | undefined;
	let selectedLevel: string | undefined;

	extension({
		registerCommand(_name: string, value: typeof command) {
			command = value;
		},
		getThinkingLevel: () => "high",
		setThinkingLevel(level: string) {
			selectedLevel = level;
		},
	} as never);

	await command!.handler("", {
		model: { reasoning: true },
		ui: {
			select: async (_title: string, levels: string[]) => {
				expect(levels).toEqual(["off", "high (current)", "xhigh"]);
				return "xhigh";
			},
		},
	});

	expect(selectedLevel).toBe("xhigh");
});
