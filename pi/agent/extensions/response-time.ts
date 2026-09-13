import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

export function formatDuration(seconds: number): string {
	if (!Number.isFinite(seconds) || seconds <= 0) return "—";
	const tenths = Math.round(seconds * 10) / 10;
	if (tenths < 10) return `${tenths.toFixed(1)}s`;

	const wholeSeconds = Math.round(seconds);
	if (wholeSeconds < 60) return `${wholeSeconds}s`;
	const minutes = Math.floor(wholeSeconds / 60);
	if (minutes < 60) return `${minutes}m ${String(wholeSeconds % 60).padStart(2, "0")}s`;

	const totalMinutes = Math.round(wholeSeconds / 60);
	return `${Math.floor(totalMinutes / 60)}h ${String(totalMinutes % 60).padStart(2, "0")}m`;
}

/** Latest main-agent response duration, including request wait but not tool execution. */
export default function responseTime(pi: ExtensionAPI): void {
	let startedAt: number | undefined;

	function reset(_event: unknown, ctx: ExtensionContext): void {
		startedAt = undefined;
		if (ctx.hasUI) ctx.ui.setStatus("agent-response-time", "—");
	}

	pi.on("session_start", reset);
	pi.on("session_tree", reset);

	pi.on("context", () => {
		// This runs before provider I/O for each response. message_start can arrive
		// after the HTTP/prefill wait, so timing from it would understate duration.
		startedAt = performance.now();
	});

	pi.on("message_end", (event, ctx) => {
		if (event.message.role !== "assistant" || startedAt === undefined) return;
		const elapsed = performance.now() - startedAt;
		startedAt = undefined;

		// Failed, cancelled and deferred attempts do not replace the last completion.
		if (!["stop", "length", "toolUse"].includes(event.message.stopReason)) return;
		const seconds = elapsed / 1000;
		if (ctx.hasUI) ctx.ui.setStatus("agent-response-time", formatDuration(seconds));
	});

	pi.on("agent_end", () => { startedAt = undefined; });
	pi.on("session_shutdown", (_event, ctx) => {
		startedAt = undefined;
		if (ctx.hasUI) ctx.ui.setStatus("agent-response-time", undefined);
	});
}
