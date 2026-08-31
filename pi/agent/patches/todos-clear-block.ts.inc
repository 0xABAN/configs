	/* configs:todos-clear */
	let lastUiCtx: ExtensionContext | undefined;
	const clearAllTodos = async (ctx?: ExtensionContext) => {
		const c = ctx ?? lastUiCtx;
		if (!c?.hasUI) {
			uiCtx?.notify("/todos-clear needs an interactive session", "error");
			return;
		}
		const sessionId = sid(c);
		const before = getState(sessionId).tasks.length;
		const result = applyTaskMutation(getState(sessionId), "clear", {});
		commitState(sessionId, result.state);
		const built = buildToolResult("clear", {}, result.state, result.op);
		(c.sessionManager as { appendMessage?: (m: unknown) => string }).appendMessage?.({
			role: "toolResult",
			toolCallId: `todos-clear-${Date.now().toString(36)}`,
			toolName: TOOL_NAME,
			content: built.content,
			details: built.details,
			isError: false,
			timestamp: Date.now(),
		});
		todoOverlay?.dispose();
		todoOverlay = undefined;
		c.ui.setWidget("rpiv-todos", undefined);
		c.ui.notify(
			before === 0 ? "No todos to clear" : `Cleared ${before} todo${before === 1 ? "" : "s"}`,
			"info",
		);
	};
	pi.registerCommand("todos-clear", {
		description: "Clear all todos and hide the overlay (dd)",
		handler: async (_args, ctx) => {
			lastUiCtx = ctx;
			await clearAllTodos(ctx);
		},
	});
	pi.registerCommand("clear-todos", {
		description: "Clear all todos and hide the overlay (dd)",
		handler: async (_args, ctx) => {
			lastUiCtx = ctx;
			await clearAllTodos(ctx);
		},
	});
	// Vim-style dd — consume keys so the editor never sees them.
	let pendingClearD: ReturnType<typeof setTimeout> | undefined;
	let unsubClearChord: (() => void) | undefined;
	const CLEAR_CHORD_MS = 500;
	const hasClearableTodos = () =>
		getRenderState().tasks.some(
			(t) => t.status === "pending" || t.status === "in_progress" || t.status === "completed",
		);
	const flushPendingD = () => {
		if (!pendingClearD) return;
		clearTimeout(pendingClearD);
		pendingClearD = undefined;
		const ui = lastUiCtx?.ui ?? uiCtx;
		if (ui) ui.setEditorText(`${ui.getEditorText()}d`);
	};
	const bindClearChord = (ctx: ExtensionContext) => {
		if (!ctx.hasUI) return;
		lastUiCtx = ctx;
		unsubClearChord?.();
		unsubClearChord = ctx.ui.onTerminalInput((data) => {
			// Kitty can emit press + release for one key; only count presses.
			if (isKeyRelease(data) || isKeyRepeat(data)) {
				return { consume: false };
			}
			const isD = matchesKey(data, "d") || matchesKey(data, "D") || data === "d" || data === "D";
			if (!isD) {
				if (pendingClearD) flushPendingD();
				return;
			}
			if (pendingClearD) {
				clearTimeout(pendingClearD);
				pendingClearD = undefined;
				void clearAllTodos(lastUiCtx);
				return { consume: true };
			}
			if (!hasClearableTodos() && !todoOverlay?.isRegistered()) return;
			pendingClearD = setTimeout(flushPendingD, CLEAR_CHORD_MS);
			return { consume: true };
		});
	};

