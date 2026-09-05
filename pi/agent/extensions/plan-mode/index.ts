/**
 * Plan Mode Extension
 *
 * Read-only exploration mode for safe code analysis.
 * When enabled, built-in write tools are disabled.
 *
 * Features:
 * - /plan command or Shift+Tab to toggle
 * - Bash restricted to allowlisted read-only commands
 * - On execute: remind to seed an rpiv-todo list (no hard gate)
 */

import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { AssistantMessage, TextContent } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Key } from "@earendil-works/pi-tui";
import { extractPlanSteps, isSafeCommand } from "./utils.ts";

function isAssistantMessage(m: AgentMessage): m is AssistantMessage {
	return m.role === "assistant" && Array.isArray(m.content);
}

function getTextContent(message: AssistantMessage): string {
	return message.content
		.filter((block): block is TextContent => block.type === "text")
		.map((block) => block.text)
		.join("\n");
}

// Tools
const PLAN_MODE_TOOLS = ["read", "bash", "grep", "find", "ls", "questionnaire"];
const NORMAL_MODE_TOOLS = ["read", "bash", "edit", "write"];
const PLAN_MODE_DISABLED_TOOLS = new Set<string>(["edit", "write"]);
const PLAN_MANAGED_TOOLS = new Set<string>([...PLAN_MODE_TOOLS, ...NORMAL_MODE_TOOLS]);

interface PlanModeState {
	enabled: boolean;
	toolsBeforePlanMode?: string[];
}

export default function planModeExtension(pi: ExtensionAPI): void {
	let planModeEnabled = false;
	let toolsBeforePlanMode: string[] | undefined;

	pi.registerFlag("plan", {
		description: "Start in plan mode (read-only exploration)",
		type: "boolean",
		default: false,
	});

	/** White → mid → think:high start. Build mid = blue-cyan; plan mid = purple. */
	function shine(text: string, mid: [number, number, number]): string {
		const stops: [number, number, number][] = [
			[255, 255, 255], // white
			mid,
			[255, 216, 196], // think:high first (#ffd8c4)
		];
		const chars = [...text];
		const paint = chars.filter((c) => c !== " ");
		const n = Math.max(paint.length - 1, 1);
		let i = 0;
		let out = "";
		for (const ch of chars) {
			if (ch === " ") {
				out += ch;
				continue;
			}
			const t = i / n;
			const seg = Math.min(Math.floor(t * (stops.length - 1)), stops.length - 2);
			const local = t * (stops.length - 1) - seg;
			const a = stops[seg]!;
			const b = stops[seg + 1]!;
			const r = Math.round(a[0] + (b[0] - a[0]) * local);
			const g = Math.round(a[1] + (b[1] - a[1]) * local);
			const bl = Math.round(a[2] + (b[2] - a[2]) * local);
			out += `\x1b[38;2;${r};${g};${bl}m${ch}`;
			i++;
		}
		return `${out}\x1b[0m`;
	}

	function modeMid(): [number, number, number] {
		return planModeEnabled
			? [196, 160, 230] // pastel purple (plan)
			: [175, 225, 235]; // pastel blue-cyan (build)
	}

	function thinkingLabel(level: string): string {
		const labels: Record<string, string> = {
			off: "off",
			minimal: "min",
			low: "low",
			medium: "med",
			high: "high",
			xhigh: "xhigh",
			max: "max",
		};
		return `think:${labels[level] ?? level}`;
	}

	/** Use the same white→mid→peach gradient for every thinking level. */
	function thinkingStatus(level: string, mid: [number, number, number]): string {
		return shine(thinkingLabel(level), mid);
	}

	function updateStatus(ctx: ExtensionContext): void {
		const mid = modeMid();
		ctx.ui.setStatus(
			"agent-mode",
			shine(planModeEnabled ? "\uF022  plan mode" : "\uF121  build mode", mid),
		);
		ctx.ui.setStatus("agent-thinking", thinkingStatus(ctx.thinkingLevel || "off", mid));
	}

	function uniqueToolNames(toolNames: string[]): string[] {
		return [...new Set(toolNames)];
	}

	function withTodo(toolNames: string[]): string[] {
		// keep rpiv-todo's tool available across mode switches
		return uniqueToolNames([...toolNames, "todo"]);
	}

	function getPlanModeTools(activeToolNames: string[]): string[] {
		return withTodo([
			...activeToolNames.filter((name) => !PLAN_MODE_DISABLED_TOOLS.has(name)),
			...PLAN_MODE_TOOLS,
		]);
	}

	function getNormalModeTools(activeToolNames: string[]): string[] {
		return withTodo([
			...NORMAL_MODE_TOOLS,
			...activeToolNames.filter((name) => !PLAN_MANAGED_TOOLS.has(name)),
		]);
	}

	function enablePlanModeTools(): void {
		if (toolsBeforePlanMode === undefined) {
			toolsBeforePlanMode = pi.getActiveTools();
		}
		pi.setActiveTools(getPlanModeTools(toolsBeforePlanMode));
	}

	function restoreNormalModeTools(): void {
		pi.setActiveTools(withTodo(toolsBeforePlanMode ?? getNormalModeTools(pi.getActiveTools())));
		toolsBeforePlanMode = undefined;
	}

	function persistState(): void {
		pi.appendEntry("plan-mode", {
			enabled: planModeEnabled,
			toolsBeforePlanMode,
		});
	}

	function togglePlanMode(ctx: ExtensionContext): void {
		planModeEnabled = !planModeEnabled;

		if (planModeEnabled) {
			enablePlanModeTools();
		} else {
			restoreNormalModeTools();
		}
		updateStatus(ctx);
		persistState();
	}

	pi.registerCommand("plan", {
		description: "Toggle plan mode (read-only exploration)",
		handler: async (_args, ctx) => togglePlanMode(ctx),
	});

	pi.registerShortcut("shift+tab", {
		description: "Toggle plan mode",
		handler: async (ctx) => togglePlanMode(ctx),
	});

	// Keep Ctrl+Alt+P as a backup (doesn't steal thinking cycle)
	pi.registerShortcut(Key.ctrlAlt("p"), {
		description: "Toggle plan mode",
		handler: async (ctx) => togglePlanMode(ctx),
	});

	// Block destructive bash in plan mode
	pi.on("tool_call", async (event, _ctx) => {
		if (planModeEnabled && event.toolName === "bash") {
			const command = event.input.command as string;
			if (!isSafeCommand(command)) {
				return {
					block: true,
					reason: `Plan mode: command blocked (not allowlisted). Use /plan to disable plan mode first.\nCommand: ${command}`,
				};
			}
		}
	});

	// Filter out stale plan mode context when not in plan mode
	pi.on("context", async (event) => {
		return {
			messages: event.messages.filter((m) => {
				const msg = m as AgentMessage & { customType?: string };
				if (!planModeEnabled && msg.customType === "plan-mode-context") return false;
				if (planModeEnabled) return true;
				if (msg.role !== "user") return true;

				const content = msg.content;
				if (typeof content === "string") {
					return !content.includes("[PLAN MODE ACTIVE]");
				}
				if (Array.isArray(content)) {
					return !content.some(
						(c) => c.type === "text" && (c as TextContent).text?.includes("[PLAN MODE ACTIVE]"),
					);
				}
				return true;
			}),
		};
	});

	pi.on("before_agent_start", async (_event, _ctx) => {
		if (!planModeEnabled) return;
		return {
			message: {
				customType: "plan-mode-context",
				content:
					'Plan mode: read-only. Explore, ask questions, then output a numbered plan under a "Plan:" header. Do not modify files.',
				display: false,
			},
		};
	});

	// After a Plan: section, offer execute / stay / refine
	pi.on("agent_end", async (event, ctx) => {
		if (!planModeEnabled || !ctx.hasUI) return;

		const lastAssistant = [...event.messages].reverse().find(isAssistantMessage);
		if (!lastAssistant) return;

		const steps = extractPlanSteps(getTextContent(lastAssistant));
		if (steps.length === 0) return;

		const choice = await ctx.ui.select("Plan mode - what next?", [
			"Execute the plan",
			"Stay in plan mode",
			"Refine the plan",
		]);

		if (choice?.startsWith("Execute")) {
			planModeEnabled = false;
			restoreNormalModeTools();
			updateStatus(ctx);
			persistState();

			const list = steps.map((s, i) => `${i + 1}. ${s}`).join("\n");
			pi.sendMessage(
				{
					customType: "plan-mode-execute",
					content: `Execute the plan.

Reminder: seed these as todos first (one create per step), then work them in order.

${list}`,
					display: true,
				},
				{ triggerTurn: true, deliverAs: "followUp" },
			);
		} else if (choice === "Refine the plan") {
			const refinement = await ctx.ui.editor("Refine the plan:", "");
			if (refinement?.trim()) {
				pi.sendUserMessage(refinement.trim(), { deliverAs: "followUp" });
			}
		}
	});

	pi.on("thinking_level_select", async (_event, ctx) => {
		if (ctx.hasUI) updateStatus(ctx);
	});

	pi.on("session_start", async (_event, ctx) => {
		if (pi.getFlag("plan") === true) {
			planModeEnabled = true;
		}

		const entries = ctx.sessionManager.getEntries();
		const planModeEntry = entries
			.filter((e: { type: string; customType?: string }) => e.type === "custom" && e.customType === "plan-mode")
			.pop() as { data?: PlanModeState } | undefined;

		if (planModeEntry?.data) {
			planModeEnabled = planModeEntry.data.enabled ?? planModeEnabled;
			toolsBeforePlanMode = planModeEntry.data.toolsBeforePlanMode ?? toolsBeforePlanMode;
		}

		if (planModeEnabled) {
			enablePlanModeTools();
		}
		updateStatus(ctx);
	});
}
