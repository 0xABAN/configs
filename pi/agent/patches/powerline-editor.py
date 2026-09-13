#!/usr/bin/env python3
"""Round powerline's existing editor inside the Pi host's shared horizontal inset.

The layoutText hook follows the pinned Pi editor's row contract: two borders,
visible input rows (30% of terminal height, minimum five), then completion rows.
"""
from pathlib import Path


EDITS = {
    "index.ts": [
        ('''      const originalRender = editor.render.bind(editor);
      editor.render = (width: number): string[] => {
        if (width < 10) {''', '''      // configs:powerline-editor-v1
      // Count layout rows during the host render, not by inspecting user text.
      let inputLineCount = 1;
      const originalLayoutText = Reflect.get(editor, "layoutText");
      if (typeof originalLayoutText === "function") {
        Reflect.set(editor, "layoutText", (width: number) => {
          const rows = originalLayoutText.call(editor, width);
          inputLineCount = rows.length;
          return rows;
        });
      }
      const originalRender = editor.render.bind(editor);
      editor.render = (width: number): string[] => {
        if (width < 16 || typeof originalLayoutText !== "function") {'''),
        ('''        const bc = (s: string) => `${getFgAnsiCode("sep")}${s}${ansi.reset}`;
        const captureDraft''', '''        const bc = (s: string) => editor.borderColor(s);
        const margin = 0; // The Pi host owns the shared outer inset.
        const inset = " ".repeat(margin);
        const boxWidth = width - 2 * margin;
        const captureDraft'''),
        ('''        const contentWidth = Math.max(1, width - 3);
        const lines = originalRender(contentWidth);''', '''        // Reserve both walls and the three-column prompt before wrapping input.
        const contentWidth = boxWidth - 5;
        const lines = originalRender(contentWidth);'''),
        (r'''        let bottomBorderIndex = lines.length - 1;
        for (let i = lines.length - 1; i >= 1; i--) {
          const stripped = lines[i]?.replace(/\x1b\[[0-9;]*m/g, "") || "";
          if (stripped.length > 0 && /^─{3,}/.test(stripped)) {
            bottomBorderIndex = i;
            break;
          }
        }''', '''        const visibleRows = Math.min(inputLineCount, Math.max(5, Math.floor(tui.terminal.rows * 0.3)));
        const bottomBorderIndex = 1 + visibleRows;'''),
        ('''        result.push(" " + bc("─".repeat(width - 2)));

        for (let i = 1; i < bottomBorderIndex; i++)''', '''        // Retain host scroll indicators and ANSI bytes, including cursor markers.
        result.push(inset + bc("╭───") + lines[0] + bc("╮"));

        for (let i = 1; i < bottomBorderIndex; i++)'''),
        ('''          result.push(`${prefix}${lines[i] || ""}`);''', '''          result.push(inset + bc("│") + prefix + (lines[i] || "") + bc("│"));'''),
        ('''          result.push(`${promptPrefix}${" ".repeat(contentWidth)}`);''', '''          result.push(inset + bc("│") + promptPrefix + " ".repeat(contentWidth) + bc("│"));'''),
        ('''        result.push(" " + bc("─".repeat(width - 2)));

        for (let i = bottomBorderIndex + 1; i < lines.length; i++) {
          result.push(lines[i] || "");''', '''        result.push(inset + bc("╰───") + lines[bottomBorderIndex] + bc("╯"));

        // Completion rows stay outside the box, aligned to the input origin.
        for (let i = bottomBorderIndex + 1; i < lines.length; i++) {
          result.push(inset + "    " + (lines[i] || ""));'''),
    ],
    "bash-mode/editor.ts": [
        (r'''    const availableWidth = Math.max(0, width - visibleWidth(text) - 1);
    if (availableWidth === 0) return lines;

    const shownSuffix = truncateToWidth(suffix, availableWidth, "", true);
    if (!shownSuffix) return lines;

    const padding = " ".repeat(Math.max(0, width - visibleWidth(text) - 1 - visibleWidth(shownSuffix)));
    const ghost = `\x1b[38;5;244m${shownSuffix}\x1b[0m`;
    lines[contentLine] = `${text}${cursorBlock}${ghost}${padding}`;''', r'''    // configs:powerline-ghost-cursor-v1
    // Preserve the host's padding and hardware cursor marker. Wrapped input has
    // its cursor on a later row, so do not paint a suggestion over its first row.
    const row = lines[contentLine];
    const cursorIndex = row.indexOf(cursorBlock);
    if (cursorIndex < 0) return lines;
    const prefix = row.slice(0, cursorIndex + cursorBlock.length);
    const remainingWidth = Math.max(0, width - visibleWidth(prefix));
    const availableWidth = Math.max(0, remainingWidth - this.getPaddingX());
    if (availableWidth === 0) return lines;

    const shownSuffix = truncateToWidth(suffix, availableWidth, "", true);
    if (!shownSuffix) return lines;

    const padding = " ".repeat(Math.max(0, remainingWidth - visibleWidth(shownSuffix)));
    const ghost = `\x1b[38;5;244m${shownSuffix}\x1b[0m`;
    lines[contentLine] = `${prefix}${ghost}${padding}`;'''),
    ],
}


PROMPT_EDIT = (
    '''        const promptGlyph = bashModeActive ? "$" : captureDraft ? captureSigilGlyph() : ">";
        const promptColor = captureDraft ? getFgAnsiCode("queue") : ansi.getFgAnsi(200, 200, 200);''',
    '''        const promptGlyph = bashModeActive ? "$" : captureDraft ? captureSigilGlyph() : "◆";
        const promptColor = bashModeActive ? ansi.getFgAnsi(200, 200, 200)
          : captureDraft ? getFgAnsiCode("queue") : ansi.getFgAnsi(67, 145, 135);''',
)

LEGACY_PROMPT = '''        const promptGlyph = bashModeActive ? "$" : captureDraft ? captureSigilGlyph() : "◆";
        const promptColor = bashModeActive ? ansi.getFgAnsi(200, 200, 200) : getFgAnsiCode("queue");'''


BORDER_EDIT = (
    '''        result.push(inset + bc("╭───") + lines[0] + bc("╮"));''',
    r'''        // Read live extension statuses, retaining their original gradient bytes.
        const statuses = footerDataRef?.getExtensionStatuses();
        const badges = ["agent-mode", "agent-thinking"]
          .map((key) => statuses?.get(key)).filter(Boolean).join(" ❯ ");
        const badgeWidth = visibleWidth(badges);
        const topBorder = bc("╭───") + lines[0];
        const hintWidth = visibleWidth(lines[0].replace(/\x1b\[[0-9;]*m/g, "").replace(/─+$/, ""));
        // Keep the complete scroll hint and corners on narrow panes; never clip badges.
        if (badges && badgeWidth + hintWidth + 9 <= boxWidth) {
          result.push(inset + truncateToWidth(topBorder, boxWidth - badgeWidth - 5, "")
            + " " + badges + " " + bc("──╮"));
        } else {
          result.push(inset + topBorder + bc("╮"));
        }''',
)


def patch_sources(sources: dict[str, str]) -> dict[str, str]:
    """Validate the entire set before changing any file; reject partial patches."""
    sources = dict(sources)

    # Canonicalize the optional border upgrade before validating the base frame.
    # The final result restores it below, so replay leaves installed bytes intact.
    old_border, new_border = BORDER_EDIT
    legacy_border = new_border.replace('join(" ❯ ")', 'join(" · ")')
    sources["index.ts"] = sources["index.ts"].replace(legacy_border, old_border).replace(new_border, old_border)

    # The prompt can upgrade an already-framed editor or a fresh installation.
    # Validate it separately, still before any file is written.
    old_prompt, new_prompt = PROMPT_EDIT
    previous_teal = new_prompt.replace("ansi.getFgAnsi(67, 145, 135)", "ansi.getFgAnsi(94, 158, 128)")
    sources["index.ts"] = sources["index.ts"].replace(previous_teal, new_prompt).replace(LEGACY_PROMPT, new_prompt)
    index = sources["index.ts"]
    if index.count(new_prompt) == 0 and index.count(old_prompt) == 1:
        sources["index.ts"] = index.replace(old_prompt, new_prompt, 1)
    elif index.count(new_prompt) != 1 or index.count(old_prompt) != 0:
        raise ValueError("editor prompt anchor changed or duplicated")

    # Upgrade the complete earlier editor patch without stacking its 4% gutter
    # inside the host's new 2% gutter. All anchors are still validated below.
    sources["index.ts"] = sources["index.ts"].replace(
        "const margin = Math.max(2, Math.floor(width * 0.04));",
        "const margin = 0; // The Pi host owns the shared outer inset.",
    )
    states = []
    for name, edits in EDITS.items():
        for old, new in edits:
            source = sources[name]
            if source.count(new) == 1:
                states.append("patched")
            elif source.count(new) == 0 and source.count(old) == 1:
                states.append("original")
            else:
                raise ValueError(f"{name}: editor anchor changed or duplicated: {old[:70]}")
    if len(set(states)) != 1:
        raise ValueError("partial editor patch; inspect before reapplying")
    result = dict(sources)
    if states[0] == "original":
        for name, source in sources.items():
            for old, new in EDITS[name]:
                source = source.replace(old, new, 1)
            result[name] = source
    result["index.ts"] = result["index.ts"].replace(old_border, new_border, 1)
    return result


def main() -> None:
    root = Path.home() / ".pi/agent/git/github.com/nicobailon/pi-powerline-footer"
    if not root.exists():
        print("powerline not installed; skipping editor patch")
        return
    sources = {name: (root / name).read_text() for name in EDITS}
    patched = patch_sources(sources)
    for name, source in patched.items():
        if source != sources[name]:
            (root / name).write_text(source)
    print("powerline centered rounded editor ready")


if __name__ == "__main__":
    main()
