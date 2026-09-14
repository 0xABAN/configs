import type {
	ExtensionAPI,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { Loader, stripTerminalSequences } from "@earendil-works/pi-tui";

import { INTERVAL_MS, randomFrames, sparkleFrames } from "./whimsical/animation.ts";
import { installCompactionIndicator } from "./whimsical/compaction-loader.ts";

// Preserve the original import-time, process-wide compatibility installation.
installCompactionIndicator();

const WIDGET_KEY = "whimsical-working";

type AssistantMessageLike = {
	role?: string;
	content?: unknown;
};

type ThinkingBlock = {
	type?: string;
	thinking?: unknown;
};

function cleanReasoningLine(line: string): string {
	return stripTerminalSequences(line)
		.replace(/[\u0000-\u001f\u007f-\u009f]/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

function latestReasoningLine(message: AssistantMessageLike): string | undefined {
	if (message.role !== "assistant" || !Array.isArray(message.content)) return;

	for (let index = message.content.length - 1; index >= 0; index -= 1) {
		const block = message.content[index] as ThinkingBlock;
		if (block?.type !== "thinking" || typeof block.thinking !== "string") continue;

		const lines = block.thinking
			.split(/\r?\n/)
			.map(cleanReasoningLine)
			.filter(Boolean);
		if (lines.length > 0) return lines.at(-1);
	}
}

export default function (pi: ExtensionAPI) {
	// Built-in working line sits in statusContainer *above* extension widgets.
	// Hide it; render sparkles as aboveEditor widget so stack is:
	//   rpiv-todo → whimsical spinner → editor
	// clear+set bumps this key to the end of the widget Map (just above the editor).
	let frames: string[] = [];
	let loader: Loader | undefined;
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
			const nextLoader = new Loader(
				tui,
				(s) => s,
				(t) => t,
				"",
				{ frames, intervalMs: INTERVAL_MS },
			);
			loader = nextLoader;
			const baseRender = nextLoader.render.bind(nextLoader);
			nextLoader.render = (width: number) => {
				const lines = baseRender(width);
				return lines[0] === "" ? lines.slice(1) : lines;
			};
			return Object.assign(nextLoader, {
				dispose: () => {
					nextLoader.stop();
					if (loader === nextLoader) loader = undefined;
				},
			});
		});
		active = true;
	};

	const hide = (ctx: ExtensionContext) => {
		if (!ctx.hasUI) return;
		ctx.ui.setWidget(WIDGET_KEY, undefined);
		ctx.ui.setWorkingVisible(true);
		active = false;
	};

	const updateReasoning = (ctx: ExtensionContext, message: AssistantMessageLike) => {
		if (!active || !ctx.hasUI) return;
		const reasoning = latestReasoningLine(message);
		if (!reasoning || !loader) return;

		frames = sparkleFrames(reasoning);
		// Loader copies frames at construction; mutate its live copy so changing
		// reasoning does not restart the 90ms animation on every token update.
		const liveFrames = (loader as unknown as { frames: string[] }).frames;
		liveFrames.splice(0, liveFrames.length, ...frames);
		loader.invalidate();
	};

	pi.registerMarkdownTransformer((markdown, { messageType }) =>
		messageType === "assistant-thinking" ? "" : markdown,
	);

	pi.on("agent_start", async (_event, ctx) => show(ctx, true));
	pi.on("turn_start", async (_event, ctx) => show(ctx, true));
	// After todo overlay updates, re-append spinner so it stays under the list.
	pi.on("tool_result", async (event, ctx) => {
		if (!active) return;
		if (event.toolName !== "todo") return;
		show(ctx, false);
	});
	pi.on("message_update", (event, ctx) => updateReasoning(ctx, event.message));
	pi.on("agent_end", async (_event, ctx) => hide(ctx));
}
