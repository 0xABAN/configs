import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

/** Latest main-agent response throughput, including request wait but not tool execution. */
export default function responseTps(pi: ExtensionAPI): void {
	let startedAt: number | undefined;

	function reset(_event: unknown, ctx: ExtensionContext): void {
		startedAt = undefined;
		if (ctx.hasUI) ctx.ui.setStatus("agent-tps", "— TPS");
	}

	pi.on("session_start", reset);
	pi.on("session_tree", reset);

	pi.on("context", () => {
		// This runs before provider I/O for each response. message_start can arrive
		// after the HTTP/prefill wait, so timing from it would overstate throughput.
		startedAt = performance.now();
	});

	pi.on("message_end", (event, ctx) => {
		if (event.message.role !== "assistant" || startedAt === undefined) return;
		const elapsed = performance.now() - startedAt;
		startedAt = undefined;

		// Failed, cancelled and deferred attempts do not replace the last completion.
		if (!["stop", "length", "toolUse"].includes(event.message.stopReason)) return;
		const tokens = event.message.usage?.output;
		const rate = Number.isSafeInteger(tokens) && tokens > 0 && Number.isFinite(elapsed) && elapsed > 0
			? tokens / (elapsed / 1000) : NaN;

		// Output already includes reasoning tokens. Zero may mean unreported usage;
		// a completed response without a valid measurement must not show stale TPS.
		if (ctx.hasUI) ctx.ui.setStatus("agent-tps", Number.isFinite(rate) ? `${rate.toFixed(1)} TPS` : "— TPS");
	});

	pi.on("agent_end", () => { startedAt = undefined; });
	pi.on("session_shutdown", (_event, ctx) => {
		startedAt = undefined;
		if (ctx.hasUI) ctx.ui.setStatus("agent-tps", undefined);
	});
}
