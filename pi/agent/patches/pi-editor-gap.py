#!/usr/bin/env python3
"""Add one idle gap before Pi's editor without separating active loaders."""
import json

from patch_support import backup_sources, discover_pi_root, read_payload, replace_counted, write_sources

HOST = "dist/modes/interactive/interactive-mode.js"
SOURCE = read_payload("host/editor-gap.js.inc")
MARKER = "// configs:editor-gap-v1"
EDIT = (
    '''        this.editor = this.defaultEditor;
        this.editorContainer = new Container();
        this.editorContainer.addChild(this.editor);''',
    SOURCE,
    1,
)


def patch_sources(sources: dict[str, str]) -> dict[str, str]:
    source = sources[HOST]
    if MARKER in source:
        if source.count(MARKER) != 1 or source.count(SOURCE) != 1:
            raise ValueError("editor gap patch changed, duplicated or incomplete")
        return dict(sources)
    if source.count(EDIT[0]) != 1 or source.count(SOURCE) != 0:
        raise ValueError("editor gap anchor changed or partially applied")
    return {**sources, HOST: replace_counted(source, [EDIT], "editor gap anchor")}


def main() -> None:
    root = discover_pi_root()
    if root is None or not root.exists():
        print("Pi SDK not installed; skipping editor gap")
        return
    if json.loads((root / "package.json").read_text()).get("version") != "0.85.1":
        raise ValueError("editor gap requires Pi 0.85.1; review upstream first")
    if not (root / HOST).exists():
        raise ValueError("editor gap source is missing")
    sources = {HOST: (root / HOST).read_text()}
    patched = patch_sources(sources)
    if patched != sources:
        backup = backup_sources(root, sources, "pi-editor-gap-")
        print(f"Editor gap backup: {backup}")
        write_sources(root, patched)
    print("Editor gap ready; restart Pi to apply")


if __name__ == "__main__":
    main()
