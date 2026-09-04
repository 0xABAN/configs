import { getSupportedThinkingLevels, type ModelThinkingLevel } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
	pi.registerCommand("effort", {
		description: "Select the thinking effort",
		handler: async (_args, ctx) => {
			if (!ctx.model) {
				ctx.ui.notify("No active model", "warning");
				return;
			}

			const current = pi.getThinkingLevel();
			const levels = getSupportedThinkingLevels(ctx.model);
			const labels = levels.map((level) => (level === current ? `${level} (current)` : level));
			const selected = await ctx.ui.select("Thinking effort", labels);
			const level = levels[labels.indexOf(selected ?? "")] as ModelThinkingLevel | undefined;

			if (level) pi.setThinkingLevel(level);
		},
	});
}
