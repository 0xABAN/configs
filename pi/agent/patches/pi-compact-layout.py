#!/usr/bin/env python3
"""Give our activity widgets a shared short-window budget in Pi 0.84.2.

The host supplies available rows; each package retains semantic rendering and
state ownership. Validate the complete patch before backing up or writing.
"""
import json

from patch_support import (
    backup_sources,
    discover_pi_root as discover_root,
    read_payload,
    replace_counted,
    write_sources,
)

HOST = "dist/modes/interactive/interactive-mode.js"
MODULE = "dist/modes/interactive/components/compact-layout.js"
SOURCE = read_payload("host/compact-layout.js.inc")
MARKER = "// configs:pi-compact-layout-v1"
EDITS = [
    ('import { FooterComponent, formatTokens } from "./components/footer.js";',
     'import { FooterComponent, formatTokens } from "./components/footer.js";\n'
     'import { CompactWidgetSpacer, installActivityBudget } from "./components/compact-layout.js"; ' + MARKER, 1),
    ('        this.widgetContainerBelow = new Container();',
     '        this.widgetContainerBelow = new Container();\n'
     '        installActivityBudget(this.ui, this.extensionWidgetsAbove, this.extensionWidgetsBelow);', 1),
    ('container.addChild(new Spacer(1));',
     'container.addChild(new CompactWidgetSpacer(this.ui));', 2),
]


def patch_sources(sources: dict[str, str]) -> dict[str, str]:
    source = sources[HOST]
    if MARKER in source:
        if source.count(MARKER) != 1 or sources.get(MODULE) != SOURCE:
            raise ValueError("compact layout helper changed, duplicated or missing")
        original = replace_counted(source, EDITS, "compact layout anchor", reverse=True)
        if replace_counted(original, EDITS, "compact layout anchor") != source:
            raise ValueError("inconsistent compact layout patch")
        return sources
    if MODULE in sources:
        raise ValueError("unexpected compact layout helper alongside original host")
    if any(new in source for _, new, _ in EDITS):
        raise ValueError("partial compact layout patch")
    return {HOST: replace_counted(source, EDITS, "compact layout anchor"), MODULE: SOURCE}


def main() -> None:
    root = discover_root()
    if root is None or not root.exists():
        print("Pi host not installed; skipping compact layout")
        return
    if json.loads((root / "package.json").read_text()).get("version") != "0.84.2":
        raise ValueError("compact layout requires Pi 0.84.2; review upstream first")
    sources = {HOST: (root / HOST).read_text()}
    if (root / MODULE).exists():
        sources[MODULE] = (root / MODULE).read_text()
    patched = patch_sources(sources)
    if patched != sources:
        backup = backup_sources(root, sources, "pi-compact-layout-", added_files=sorted(set(patched) - set(sources)))
        print(f"Compact layout backup: {backup}")
        write_sources(root, patched)
    print("Compact layout ready; restart Pi to apply")


if __name__ == "__main__":
    main()
