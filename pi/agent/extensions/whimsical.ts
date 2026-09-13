import type {
	ExtensionAPI,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { Loader } from "@earendil-works/pi-tui";

import { INTERVAL_MS, randomFrames } from "./whimsical/animation.ts";
import { installCompactionIndicator } from "./whimsical/compaction-loader.ts";

// Preserve the original import-time, process-wide compatibility installation.
installCompactionIndicator();

const WIDGET_KEY = "whimsical-working";

export default function (pi: ExtensionAPI) {
	// Built-in working line sits in statusContainer *above* extension widgets.
	// Hide it; render sparkles as aboveEditor widget so stack is:
	//   rpiv-todo → whimsical spinner → editor
	// clear+set bumps this key to the end of the widget Map (just above the editor).
	let frames = randomFrames();
	let active = false;

	const show = (ctx: ExtensionContext, reshuffle: boolean) => {
		if (!ctx.hasUI) return;
		if (reshuffle) frames = randomFrames();
		ctx.ui.setWorkingVisible(false);
		ctx.ui.setWorkingMessage("");
		ctx.ui.setWidget(WIDGET_KEY, undefined);
		ctx.ui.setWidget(WIDGET_KEY, (tui) => {
			// Loader.render() prefixes a blank row (meant for statusContainer).
			// Drop it so we don't stack empty lines under the todo panel.
			const loader = new Loader(
				tui,
				(s) => s,
				(t) => t,
				"",
				{ frames, intervalMs: INTERVAL_MS },
			);
			const baseRender = loader.render.bind(loader);
			loader.render = (width: number) => {
				const lines = baseRender(width);
				return lines[0] === "" ? lines.slice(1) : lines;
			};
			return Object.assign(loader, { dispose: () => loader.stop() });
		});
		active = true;
	};

	const hide = (ctx: ExtensionContext) => {
		if (!ctx.hasUI) return;
		ctx.ui.setWidget(WIDGET_KEY, undefined);
		ctx.ui.setWorkingVisible(true);
		active = false;
	};

	pi.on("agent_start", async (_event, ctx) => show(ctx, true));
	pi.on("turn_start", async (_event, ctx) => show(ctx, true));
	// After todo overlay updates, re-append spinner so it stays under the list.
	pi.on("tool_result", async (event, ctx) => {
		if (!active) return;
		if (event.toolName !== "todo") return;
		show(ctx, false);
	});
	pi.on("agent_end", async (_event, ctx) => hide(ctx));
}
