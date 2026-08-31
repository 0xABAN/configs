#!/usr/bin/env python3
"""Re-apply rpiv-todo local tweaks after npm package install."""
from __future__ import annotations

import os
import re
from pathlib import Path

ROOT = Path(os.environ.get("HOME", "")) / ".pi/agent/npm/node_modules/@juicesharp/rpiv-todo"
FMT = ROOT / "view/format.ts"
OV = ROOT / "todo-overlay.ts"
INDEX = ROOT / "index.ts"
HERE = Path(__file__).resolve().parent
CLEAR_BLOCK = (HERE / "todos-clear-block.ts.inc").read_text()
CLEAR_MARKER = "/* configs:todos-clear */"
NUDGE_BLOCK = (HERE / "todo-nudge-block.ts.inc").read_text()
NUDGE_MARKER = "/* configs:todo-nudge */"


def patch_format() -> None:
	if not FMT.exists():
		return
	t = FMT.read_text()
	t2 = t
	# pending → dark gray; in_progress → white (accent); done → dim
	# in_progress glyph is ○ (same as pending), not ◐
	t2 = t2.replace('in_progress: "◐",', 'in_progress: "○",')
	for old, new in (
		(
			't.status === "in_progress" ? "accent" : t.status === "completed" || t.status === "deleted" ? "muted" : "text";',
			't.status === "in_progress" ? "accent" : t.status === "completed" || t.status === "deleted" ? "dim" : "thinkingText";',
		),
		(
			't.status === "in_progress" ? "muted" : t.status === "completed" || t.status === "deleted" ? "dim" : "muted";',
			't.status === "in_progress" ? "accent" : t.status === "completed" || t.status === "deleted" ? "dim" : "thinkingText";',
		),
		(
			't.status === "completed" || t.status === "deleted" ? "dim" : "syntaxString";',
			't.status === "in_progress" ? "accent" : t.status === "completed" || t.status === "deleted" ? "dim" : "thinkingText";',
		),
		(
			't.status === "completed" || t.status === "deleted" ? "dim" : "thinkingText";',
			't.status === "in_progress" ? "accent" : t.status === "completed" || t.status === "deleted" ? "dim" : "thinkingText";',
		),
		('return theme.fg("dim", "○");', 'return theme.fg("thinkingText", "○");'),
		('return theme.fg("accent", "○");', 'return theme.fg("thinkingText", "○");'),
		('return theme.fg("syntaxString", "○");', 'return theme.fg("thinkingText", "○");'),
		('return theme.fg("warning", "◐");', 'return theme.fg("accent", "○");'),
		('return theme.fg("muted", "◐");', 'return theme.fg("accent", "○");'),
		('return theme.fg("syntaxString", "◐");', 'return theme.fg("accent", "○");'),
		('return theme.fg("thinkingText", "◐");', 'return theme.fg("accent", "○");'),
		('return theme.fg("success", "✓");', 'return theme.fg("dim", "✓");'),
		('return theme.fg("error", "✗");', 'return theme.fg("dim", "✗");'),
	):
		t2 = t2.replace(old, new)
	if t2 != t:
		FMT.write_text(t2)
		print("patched", FMT)


def patch_overlay() -> None:
	if not OV.exists():
		return
	o = OV.read_text()
	o2 = re.sub(r"const headingColor = [^;]+;", 'const headingColor = "accent";', o, count=1)
	# Bottom padding: empty "" can be stripped by the host; use two space rows.
	old_spacer = (
		"\tprivate withTrailingSpacer(lines: string[]): string[] {\n"
		"\t\tif (lines.length === 0) return lines;\n"
		"\t\tlines.push(\"\");\n"
		"\t\treturn lines;\n"
		"\t}"
	)
	new_spacer = (
		"\tprivate withTrailingSpacer(lines: string[]): string[] {\n"
		"\t\tif (lines.length === 0) return lines;\n"
		"\t\tlines.push(\" \", \" \");\n"
		"\t\treturn lines;\n"
		"\t}"
	)
	if old_spacer in o2:
		o2 = o2.replace(old_spacer, new_spacer, 1)
	elif 'lines.push(" ", " ");' not in o2 and 'lines.push("");' in o2:
		o2 = o2.replace('lines.push("");', 'lines.push(" ", " ");', 1)
	if o2 != o:
		OV.write_text(o2)
		print("patched", OV)


def patch_index_clear() -> None:
	if not INDEX.exists():
		return
	t = INDEX.read_text()

	if "applyTaskMutation" not in t:
		t = t.replace(
			'import { replayFromBranch } from "./state/replay.js";\n',
			'import { replayFromBranch } from "./state/replay.js";\n'
			'import { applyTaskMutation } from "./state/state-reducer.js";\n'
			'import { buildToolResult } from "./tool/response-envelope.js";\n',
		)
	if "commitState" not in t:
		t = t.replace("\treplaceState,\n", "\tcommitState,\n\tgetState,\n\treplaceState,\n")
	t = t.replace(
		'import type { ExtensionAPI, ExtensionUIContext } from "@earendil-works/pi-coding-agent";',
		'import type { ExtensionAPI, ExtensionContext, ExtensionUIContext } from "@earendil-works/pi-coding-agent";',
	)
	# matchesKey for dd chord (Kitty protocol)
	if "matchesKey" not in t:
		t = t.replace(
			'import type { KeyId } from "@earendil-works/pi-tui";',
			'import { isKeyRelease, isKeyRepeat, matchesKey, type KeyId } from "@earendil-works/pi-tui";',
		)
	t = t.replace(
		'import type { KeyId } from "@earendil-works/pi-tui";',
		'import { isKeyRelease, isKeyRepeat, matchesKey, type KeyId } from "@earendil-works/pi-tui";',
	)

	if CLEAR_MARKER in t:
		t = re.sub(
			r"\n\t/\* configs:todos-clear \*/.*?(?=\n\t/\* configs:todo-nudge \*/|\n\t// Collapse/expand hotkey)",
			"\n",
			t,
			count=1,
			flags=re.S,
		)
	if NUDGE_MARKER in t:
		t = re.sub(
			r"\n\t/\* configs:todo-nudge \*/.*?(?=\n\t// Collapse/expand hotkey)",
			"\n",
			t,
			count=1,
			flags=re.S,
		)

	needle = "\tregisterTodosCommand(pi);\n"
	if needle not in t:
		print("skip clear inject: anchor missing")
		INDEX.write_text(t)
		return

	t = t.replace(needle, needle + "\n" + CLEAR_BLOCK + "\n" + NUDGE_BLOCK + "\n", 1)

	# Bind chord when uiCtx is set
	if "bindClearChord(ctx)" not in t:
		t = t.replace(
			"\t\tuiCtx = ctx.ui;\n\t\tawait updateTodoOverlay(true, generation);\n",
			"\t\tuiCtx = ctx.ui;\n\t\tbindClearChord(ctx);\n\t\tawait updateTodoOverlay(true, generation);\n",
		)

	old_as = "\tpi.on(\"agent_start\", async () => {\n\t\ttodoOverlay?.hideCompletedTasksFromPreviousTurn();\n\t});"
	new_as = (
		"\tpi.on(\"agent_start\", async (_event, ctx) => {\n"
		"\t\tif (ctx.hasUI) bindClearChord(ctx);\n"
		"\t\ttodoOverlay?.hideCompletedTasksFromPreviousTurn();\n"
		"\t});"
	)
	if old_as in t:
		t = t.replace(old_as, new_as)

	INDEX.write_text(t)
	print("patched", INDEX, "clear dd chord + todo nudge")


def main() -> None:
	if not ROOT.exists():
		raise SystemExit(0)
	patch_format()
	patch_overlay()
	patch_index_clear()


if __name__ == "__main__":
	main()
