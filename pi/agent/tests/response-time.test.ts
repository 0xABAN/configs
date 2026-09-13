import { expect, spyOn, test } from "bun:test";
import responseTime, { formatDuration } from "../extensions/response-time";

function harness() {
	const handlers = new Map<string, Function>();
	const statuses = new Map<string, string>();
	const ctx = { hasUI: true, ui: { setStatus(key: string, value?: string) {
		if (value === undefined) statuses.delete(key);
		else statuses.set(key, value);
	} } };
	responseTime({ on: (name: string, handler: Function) => handlers.set(name, handler) } as never);
	return {
		ctx,
		value: () => statuses.get("agent-response-time"),
		emit: (name: string, event = {}) => handlers.get(name)?.(event, ctx),
	};
}

const reply = (stopReason = "stop") => ({ message: {
	role: "assistant", stopReason, timestamp: 1,
	usage: { output: 100, input: 9000, reasoning: 60, totalTokens: 9100 },
} });

test("formats response durations compactly by unit", () => {
	expect(formatDuration(0.8)).toBe("0.8s");
	expect(formatDuration(12.4)).toBe("12s");
	expect(formatDuration(65)).toBe("1m 05s");
	expect(formatDuration(7320)).toBe("2h 02m");
	expect(formatDuration(0)).toBe("—");
	expect(formatDuration(Infinity)).toBe("—");
});

test("measures full response wait, excludes tools, and keeps the latest completion", () => {
	let now = 0;
	const clock = spyOn(performance, "now").mockImplementation(() => now);
	try {
		const app = harness();
		app.emit("session_start");
		expect(app.value()).toBe("—");
		app.emit("context");
		now = 2000;
		app.emit("message_start", reply());
		app.emit("message_update", reply());
		app.emit("message_end", reply());
		expect(app.value()).toBe("2.0s");
		app.emit("message_end", reply());
		expect(app.value()).toBe("2.0s");

		now = 100_000; // Long tool execution and idle time do not enter the next response.
		app.emit("message_end", { message: { role: "toolResult" } });
		app.emit("agent_end");
		expect(app.value()).toBe("2.0s");
		app.emit("context");
		now = 100_500;
		app.emit("message_end", reply("toolUse"));
		expect(app.value()).toBe("0.5s");

		for (const reason of ["error", "aborted", "deferred", "pending"]) {
			app.emit("context");
			now += 1000;
			app.emit("message_end", reply(reason));
			expect(app.value()).toBe("0.5s");
		}
		app.emit("context");
		now += 65_000;
		app.emit("message_end", reply("length"));
		expect(app.value()).toBe("1m 05s");
		app.emit("context");
		now += 1000;
		app.emit("message_end", reply());
		expect(app.value()).toBe("1.0s");
	} finally {
		clock.mockRestore();
	}
});

test("invalid clocks show unavailable; history and session boundaries never invent duration", () => {
	let now = 0;
	const clock = spyOn(performance, "now").mockImplementation(() => now);
	try {
		const app = harness();
		for (const elapsed of [0, -1, NaN, Infinity]) {
			now = 0;
			app.emit("context");
			now = elapsed;
			app.emit("message_end", reply());
			expect(app.value()).toBe("—");
		}

		now = 0;
		app.emit("context");
		now = 1000;
		app.emit("message_end", reply());
		expect(app.value()).toBe("1.0s");
		for (const boundary of ["session_start", "session_tree"]) {
			app.emit("context");
			app.emit(boundary);
			now = 2000;
			app.emit("message_end", reply());
			expect(app.value()).toBe("—");
		}
		app.emit("context");
		app.emit("agent_end");
		now = 3000;
		app.emit("message_end", reply());
		expect(app.value()).toBe("—");
		app.emit("session_shutdown");
		expect(app.value()).toBeUndefined();

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
