#!/usr/bin/env python3
"""Render fenced Markdown code as full-width dark code panels in Pi."""
import json
from pathlib import Path

from patch_support import backup_sources, discover_pi_root, write_sources

MARKDOWN = "node_modules/@earendil-works/pi-tui/dist/components/markdown.js"
THEME = "dist/modes/interactive/theme/theme.js"
TUI_PACKAGE = "node_modules/@earendil-works/pi-tui/package.json"

PAYLOADS = Path(__file__).with_name("payloads")
CODE_CASE = (PAYLOADS / "tui/markdown-code-case.js.inc").read_text().rstrip("\n")
LEGACY_CODE_CASE = (PAYLOADS / "tui/legacy/markdown-code-case.js.inc").read_text().rstrip("\n")

EDITS = {
    MARKDOWN: [
        (r'''const STRICT_STRIKETHROUGH_REGEX = /^(~~)(?=[^\s~])((?:\\.|[^\\])*?(?:\\.|[^\s~\\]))\1(?=[^~]|$)/;''',
         r'''const STRICT_STRIKETHROUGH_REGEX = /^(~~)(?=[^\s~])((?:\\.|[^\\])*?(?:\\.|[^\s~\\]))\1(?=[^~]|$)/;
const CODE_BLOCK_MARKER = "\x1b_PiCodeBlock\x07";'''),
        (r'''            case "code": {
                const indent = this.theme.codeBlockIndent ?? "  ";
                lines.push(this.theme.codeBlockBorder(`\`\`\`${token.lang || ""}`));
                if (this.theme.highlightCode) {
                    const highlightedLines = this.theme.highlightCode(token.text, token.lang);
                    for (const hlLine of highlightedLines) {
                        lines.push(`${indent}${hlLine}`);
                    }
                }
                else {
                    // Split code by newlines and style each line
                    const codeLines = token.text.split("\n");
                    for (const codeLine of codeLines) {
                        lines.push(`${indent}${this.theme.codeBlock(codeLine)}`);
                    }
                }
                lines.push(this.theme.codeBlockBorder("```"));
                if (nextTokenType && nextTokenType !== "space") {
                    lines.push(""); // Add spacing after code blocks (unless space token follows)
                }
                break;
            }''', CODE_CASE),
        (r'''        for (const line of renderedLines) {
            if (isImageLine(line)) {
                wrappedLines.push(line);
            }
            else {
                for (const wrappedLine of wrapTextWithAnsi(line, contentWidth)) {
                    wrappedLines.push(wrappedLine);
                }
            }
        }''',
         r'''        for (const line of renderedLines) {
            if (isImageLine(line)) {
                wrappedLines.push(line);
            }
            else {
                const isCodeBlockLine = line.includes(CODE_BLOCK_MARKER);
                const lineWithoutMarker = line.replaceAll(CODE_BLOCK_MARKER, "");
                for (const wrappedLine of wrapTextWithAnsi(lineWithoutMarker, contentWidth)) {
                    wrappedLines.push(isCodeBlockLine ? CODE_BLOCK_MARKER + wrappedLine : wrappedLine);
                }
            }
        }'''),
        (r'''        for (const line of wrappedLines) {
            if (isImageLine(line)) {
                contentLines.push(line);
                continue;
            }
            const lineWithMargins = leftMargin + line + rightMargin;
            if (bgFn) {
                contentLines.push(applyBackgroundToLine(lineWithMargins, width, bgFn));
            }
            else {
                // No background - just pad to width
                const visibleLen = visibleWidth(lineWithMargins);
                const paddingNeeded = Math.max(0, width - visibleLen);
                contentLines.push(lineWithMargins + " ".repeat(paddingNeeded));
            }
        }''',
         r'''        const codeBlockBgFn = this.theme.codeBlockBackground;
        for (const line of wrappedLines) {
            if (isImageLine(line)) {
                contentLines.push(line);
                continue;
            }
            const isCodeBlockLine = line.includes(CODE_BLOCK_MARKER);
            const lineWithoutMarker = line.replaceAll(CODE_BLOCK_MARKER, "");
            const lineWithMargins = leftMargin + lineWithoutMarker + rightMargin;
            if (isCodeBlockLine && codeBlockBgFn) {
                contentLines.push(applyBackgroundToLine(lineWithMargins, width, codeBlockBgFn));
            }
            else if (bgFn) {
                contentLines.push(applyBackgroundToLine(lineWithMargins, width, bgFn));
            }
            else {
                // No background - just pad to width
                const visibleLen = visibleWidth(lineWithMargins);
                const paddingNeeded = Math.max(0, width - visibleLen);
                contentLines.push(lineWithMargins + " ".repeat(paddingNeeded));
            }
        }'''),
    ],
    THEME: [
        ('''        codeBlock: (text) => theme.fg("mdCodeBlock", text),
        codeBlockBorder: (text) => theme.fg("mdCodeBlockBorder", text),''',
         '''        codeBlock: (text) => theme.fg("mdCodeBlock", text),
        codeBlockBorder: (text) => theme.fg("mdCodeBlockBorder", text),
        codeBlockBackground: (text) => theme.bg("userMessageBg", text),'''),
    ],
}


def patch_sources(sources: dict[str, str]) -> dict[str, str]:
    states = []
    for name, edits in EDITS.items():
        source = sources[name]
        for index, (old, new) in enumerate(edits):
            old_count = source.count(old)
            new_count = source.count(new)
            if new_count == 1:
                states.append("patched")
            elif name == MARKDOWN and index == 1 and source.count(LEGACY_CODE_CASE) == 1:
                states.append("legacy")
            elif new_count == 0 and old_count == 1:
                states.append("original")
            else:
                raise ValueError(f"{name}: markdown code anchor changed or duplicated")

    if len(set(states)) == 1 and states[0] == "patched":
        return dict(sources)
    if len(set(states)) == 1 and states[0] == "original":
        result = dict(sources)
        for name, edits in EDITS.items():
            source = result[name]
            for old, new in edits:
                source = source.replace(old, new, 1)
            result[name] = source
        return result
    if states.count("legacy") == 1 and all(state in {"legacy", "patched"} for state in states):
        result = dict(sources)
        result[MARKDOWN] = result[MARKDOWN].replace(LEGACY_CODE_CASE, CODE_CASE, 1)
        return result
    raise ValueError("partial markdown code patch; inspect before reapplying")


def main() -> None:
    root = discover_pi_root()
    if root is None or not root.exists():
        print("Pi SDK not installed; skipping Markdown code panels")
        return

    package_path = root / TUI_PACKAGE
    if not package_path.exists():
        print("Pi TUI not installed; skipping Markdown code panels")
        return
    if json.loads(package_path.read_text()).get("version") != "0.85.1":
        raise ValueError("Markdown code panels require pi-tui 0.85.1; review upstream first")

    names = tuple(EDITS)
    if any(not (root / name).exists() for name in names):
        raise ValueError("Markdown code panel sources are missing")
    sources = {name: (root / name).read_text() for name in names}
    patched = patch_sources(sources)
    if patched != sources:
        backup = backup_sources(root, names, "pi-markdown-code-")
        print(f"Markdown code backup: {backup}")
        write_sources(root, patched)
    print("Markdown code panels ready; restart Pi to apply")


if __name__ == "__main__":
    main()
