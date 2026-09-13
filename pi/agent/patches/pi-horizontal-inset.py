#!/usr/bin/env python3
"""Give Pi 0.84.2 one horizontal viewport boundary in both renderer modes.

Patch the private Pi-bundled TUI, never terminal dimensions or terminal writes.
Regular output is inset before overlays/cursor extraction. Fullscreen paints its
native layout at the inner width, then translates both pixels and hit-test boxes;
this preserves the native image fast path and scroll-relative document columns.
A Pi process restart is required: /reload does not reload host JavaScript.
"""
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile


TUI = "node_modules/@earendil-works/pi-tui/dist/"
EDITS = {
    TUI + "tui.js": [
        ("    resetRenderState() { }", '''    // configs:pi-horizontal-inset-v1
    getHorizontalInset(width = this.terminal.columns) {
        return width < 16 ? 0 : Math.max(1, Math.floor(width * 0.02));
    }
    insetLines(lines, width) {
        const padding = " ".repeat(this.getHorizontalInset(width));
        // Empty image-reservation rows must remain empty. Never slice image or
        // cursor escape payloads here; components already receive the inner width.
        return lines.map((line) => line ? padding + line : line);
    }
    resetRenderState() { }'''),
        ("return entry.options.visible(this.terminal.columns, this.terminal.rows);",
         "return entry.options.visible(this.terminal.columns - 2 * this.getHorizontalInset(), this.terminal.rows);"),
        ('''    resolveOverlayLayout(options, overlayHeight, termWidth, termHeight) {
        const opt = options ?? {};''', '''    resolveOverlayLayout(options, overlayHeight, termWidth, termHeight) {
        const inset = this.getHorizontalInset(termWidth);
        termWidth -= 2 * inset;
        const opt = options ?? {};'''),
        ("        return { width, row, col, maxHeight };", "        return { width, row, col: col + inset, maxHeight };"),
    ],
    TUI + "tui-main-screen.js": [
        ("        let newLines = this.render(width);", '''        // configs:pi-horizontal-inset-v1: wrap once, before overlays and cursor extraction.
        let newLines = this.insetLines(this.render(width - 2 * this.getHorizontalInset(width)), width);'''),
    ],
    TUI + "tui-alt-screen.js": [
        ('''    getMountedRoots() {''', '''    // configs:pi-horizontal-inset-v1
    renderInsetLayout(root, width, height) {
        const inset = this.getHorizontalInset(width);
        const frame = renderLayoutFrame(root, width - 2 * inset, height, () => this.requestRender());
        // Paint at x=0 first: native Kitty cropping depends on the full-width fast
        // path. Then move screen-space boxes, leaving scrollContentLines local.
        const translate = (box) => {
            box.rect.x += inset;
            box.clip.x += inset;
            for (const child of box.children) translate(child);
        };
        translate(frame.root);
        frame.width = width;
        frame.lines = this.insetLines(frame.lines, width);
        return frame;
    }
    getMountedRoots() {'''),
        ('''            const documentLines = this.render(width).map((line) => line.replace(OSC133_ZONE_PREFIX, ""));''', '''            const documentLines = this.insetLines(
                this.render(width - 2 * this.getHorizontalInset(width)).map((line) => line.replace(OSC133_ZONE_PREFIX, "")), width);'''),
        ('''        const flashLines = this.flashes.render(width).slice(-height);''', '''        const inset = this.getHorizontalInset(width);
        const flashLines = this.flashes.render(width - 2 * inset).slice(-height);'''),
        ("line, width - flashWidth, flashWidth, width);", "line, width - inset - flashWidth, flashWidth, width);"),
        ("        let nextLayout = renderLayoutFrame(root, width, height, () => this.requestRender());", "        let nextLayout = this.renderInsetLayout(root, width, height);"),
        ("            nextLayout = renderLayoutFrame(root, width, height, () => this.requestRender());", "            nextLayout = this.renderInsetLayout(root, width, height);"),
    ],
}


def patch_sources(sources: dict[str, str]) -> dict[str, str]:
    """Check every anchor before any write, including idempotence/partial state."""
    states = []
    for name, edits in EDITS.items():
        for old, new in edits:
            source = sources[name]
            if source.count(new) == 1:
                states.append("patched")
            elif source.count(new) == 0 and source.count(old) == 1:
                states.append("original")
            else:
                raise ValueError(f"{name}: horizontal inset anchor changed or duplicated: {old[:70]}")
    if len(set(states)) != 1:
        raise ValueError("partial horizontal inset patch; inspect before reapplying")
    if states[0] == "patched":
        return sources
    result = {}
    for name, source in sources.items():
        for old, new in EDITS[name]:
            source = source.replace(old, new, 1)
        result[name] = source
    return result


def discover_root() -> Path | None:
    if os.environ.get("PI_SDK_ROOT"):
        return Path(os.environ["PI_SDK_ROOT"]).expanduser()
    if not shutil.which("npm"):
        return None
    result = subprocess.run(["npm", "root", "-g"], capture_output=True, text=True, check=True)
    return Path(result.stdout.strip()) / "@earendil-works/pi-coding-agent"


def main() -> None:
    root = discover_root()
    if root is None or not root.exists():
        print("Pi host not installed; skipping horizontal inset patch")
        return
    version = json.loads((root / "package.json").read_text())["version"]
    if version != "0.84.2":
        raise ValueError(f"horizontal inset patch requires Pi 0.84.2, found {version}; review upstream first")
    sources = {name: (root / name).read_text() for name in EDITS}
    patched = patch_sources(sources)
    if patched != sources:
        backup_root = Path.home() / ".config/theme-backups"
        backup_root.mkdir(parents=True, exist_ok=True)
        backup = Path(tempfile.mkdtemp(prefix="pi-horizontal-inset-", dir=backup_root))
        # Back up the complete source set before touching the installed host.
        for name in sources:
            target = backup / name
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(root / name, target)
        print(f"Pi host backup: {backup}")
        for name, source in patched.items():
            (root / name).write_text(source)
    print("Pi shared horizontal inset ready; restart Pi to apply")


if __name__ == "__main__":
    main()
