#!/usr/bin/env python3
"""Align native extension notifications with the transcript body in Pi 0.84.2.

The host owns notification wrapping. Prefixing extension strings with spaces
only indents their first line, so use a responsive component at that boundary.
"""
import json
from pathlib import Path

from patch_support import (
    discover_pi_root as discover_root,
    backup_sources,
    write_sources,
)

HOST = "dist/modes/interactive/interactive-mode.js"
MODULE = "dist/modes/interactive/components/activity-notice.js"
SOURCE = '''// configs:pi-activity-notices-v1
import { Text, truncateToWidth } from "@earendil-works/pi-tui";

/** Keep wrapped notices aligned while retaining native status coalescing. */
export class ActivityNotice {
    constructor(text, getPadding) {
        this.content = new Text(text, 0, 0);
        this.getPadding = getPadding;
    }
    setText(text) {
        this.content.setText(text);
    }
    invalidate() {
        this.content.invalidate();
    }
    render(width) {
        if (width <= 0) return [];
        const padding = Math.min(Math.max(0, this.getPadding()), Math.max(0, Math.floor((width - 2) / 2)));
        const gutter = " ".repeat(padding);
        const innerWidth = width - padding * 2;
        return this.content.render(innerWidth)
            .map(line => gutter + truncateToWidth(line, innerWidth, "") + gutter);
    }
}
'''
EDITS = [
    ('import { CustomEntryComponent } from "./components/custom-entry.js";',
     'import { CustomEntryComponent } from "./components/custom-entry.js";\n'
     'import { ActivityNotice } from "./components/activity-notice.js"; // configs:pi-activity-notices-v1'),
    ('const text = new Text(theme.fg("dim", message), 1, 0);',
     'const text = new ActivityNotice(theme.fg("dim", message), () => this.outputPad + 2);'),
    ('new Text(theme.fg("error", `Error: ${errorMessage}`), this.outputPad, 0)',
     'new ActivityNotice(theme.fg("error", `Error: ${errorMessage}`), () => this.outputPad + 2)'),
    ('new Text(theme.fg("warning", `Warning: ${warningMessage}`), 1, 0)',
     'new ActivityNotice(theme.fg("warning", `Warning: ${warningMessage}`), () => this.outputPad + 2)'),
]


def patch_sources(sources: dict[str, str]) -> dict[str, str]:
    source = sources[HOST]
    remainder = source
    for _, new in EDITS:
        if source.count(new) == 1:
            remainder = remainder.replace(new, "", 1)
    states = []
    for old, new in EDITS:
        if source.count(new) == 1 and old not in remainder:
            states.append("patched")
        elif source.count(new) == 0 and source.count(old) == 1:
            states.append("original")
        else:
            raise ValueError(f"notification anchor changed or duplicated: {old[:70]}")
    if len(set(states)) != 1:
        raise ValueError("partial notification patch; inspect before reapplying")
    if states[0] == "patched":
        if sources.get(MODULE) != SOURCE:
            raise ValueError("notification helper changed or missing")
        return sources
    if MODULE in sources:
        raise ValueError("unexpected notification helper alongside original host")
    for old, new in EDITS:
        source = source.replace(old, new, 1)
    return {HOST: source, MODULE: SOURCE}


def main() -> None:
    root = discover_root()
    if root is None or not root.exists():
        print("Pi host not installed; skipping activity notices")
        return
    if json.loads((root / "package.json").read_text()).get("version") != "0.84.2":
        raise ValueError("activity notices require Pi 0.84.2; review upstream first")
    sources = {HOST: (root / HOST).read_text()}
    if (root / MODULE).exists():
        sources[MODULE] = (root / MODULE).read_text()
    patched = patch_sources(sources)
    if patched != sources:
        backup = backup_sources(
            root, sources, "pi-activity-notices-", added_files=sorted(set(patched) - set(sources)),
        )
        print(f"Activity notices backup: {backup}")
        write_sources(root, patched)
    print("Activity notices ready; restart Pi to apply")


if __name__ == "__main__":
    main()
