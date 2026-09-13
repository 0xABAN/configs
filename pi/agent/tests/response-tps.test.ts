import { expect, spyOn, test } from "bun:test";
import responseTps from "../extensions/response-tps";

function harness() {
	const handlers = new Map<string, Function>();
	const statuses = new Map<string, string>();
	const ctx = { hasUI: true, ui: { setStatus(key: string, value?: string) {
		if (value === undefined) statuses.delete(key);
		else statuses.set(key, value);
	} } };
	responseTps({ on: (name: string, handler: Function) => handlers.set(name, handler) } as never);
	return {
		ctx,
		value: () => statuses.get("agent-tps"),
		emit: (name: string, event = {}) => handlers.get(name)?.(event, ctx),
	};
}

const reply = (output: unknown = 100, stopReason = "stop") => ({ message: {
	role: "assistant", stopReason, timestamp: 1,
	usage: { output, input: 9000, reasoning: 60, totalTokens: 9100 },
} });

test("TPS includes request wait, excludes tools, and keeps only the latest completed response", () => {
	let now = 0;
	const clock = spyOn(performance, "now").mockImplementation(() => now);
	try {
		const app = harness();
		app.emit("session_start");
		expect(app.value()).toBe("— TPS");
		expect(app.emit("context")).toBeUndefined(); // Never replace model context.
		now = 1500;
		app.emit("message_start", reply()); // Waiting for this would lose first-token latency.
		app.emit("message_update", reply());
		now = 2000;
		app.emit("message_end", reply());
		expect(app.value()).toBe("50.0 TPS"); // Reasoning is not counted twice.
		app.emit("message_end", reply());
		expect(app.value()).toBe("50.0 TPS"); // A duplicate cannot settle twice.

		now = 100_000; // Long tool execution and idle time do not enter the next response.
		app.emit("message_end", { message: { role: "toolResult" } });
		app.emit("agent_end");
		expect(app.value()).toBe("50.0 TPS");
		app.emit("context");
		expect(app.value()).toBe("50.0 TPS");
		app.emit("message_end", { message: { role: "user" } });
		now = 100_500;
		app.emit("message_end", reply(30, "toolUse"));
		expect(app.value()).toBe("60.0 TPS");

		for (const reason of ["error", "aborted", "deferred", "pending"]) {
			app.emit("context");
			now += 1000;
			app.emit("message_end", reply(100, reason));
			expect(app.value()).toBe("60.0 TPS");
		}
		app.emit("context");
		now += 4000;
		app.emit("message_end", reply(10, "length"));
		expect(app.value()).toBe("2.5 TPS");
		app.emit("context");
		now += 1000;
		app.emit("message_end", reply(0));
		expect(app.value()).toBe("— TPS"); // Missing usage cannot masquerade as the latest rate.
	} finally {
		clock.mockRestore();
	}
});

test("invalid usage or clocks show unavailable; history and session boundaries never invent TPS", () => {
	let now = 0;
	const clock = spyOn(performance, "now").mockImplementation(() => now);
	try {
		const app = harness();
		for (const tokens of [undefined, null, "100", 0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
			app.emit("context");
			now += 1000;
			const event = reply();
			event.message.usage.output = tokens;
			app.emit("message_end", event);
			expect(app.value()).toBe("— TPS");
		}
		for (const elapsed of [0, -1, NaN, Infinity]) {
			now = 0;
			app.emit("context");
			now = elapsed;
			app.emit("message_end", reply());
			expect(app.value()).toBe("— TPS");
		}

		for (const boundary of ["session_start", "session_tree", "agent_end", "session_shutdown"]) {
			now = 0;
			app.emit("context");
			now = 1000;
			app.emit("message_end", reply());
			expect(app.value()).toBe("100.0 TPS");
			app.emit("context");
			app.emit(boundary);
			now = 2000;
			app.emit("message_end", reply());
			expect(app.value()).toBe(boundary === "agent_end" ? "100.0 TPS"
				: boundary === "session_shutdown" ? undefined : "— TPS");
		}

		app.ctx.hasUI = false;
		app.ctx.ui.setStatus = () => { throw new Error("headless UI write"); };
		app.emit("session_start");
		app.emit("context");
		now += 1000;
		app.emit("message_end", reply());
		app.emit("session_tree");
		app.emit("session_shutdown");
	} finally {
		clock.mockRestore();
	}
});
