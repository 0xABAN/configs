#!/usr/bin/env python3
"""Align native extension selectors, confirmations, inputs and editors in Pi 0.84.2.

Display only: retain original input/focus/timeout/external-editor handlers. Refuse
unknown or partial sources before writing; back up exact originals. Restart Pi.
"""
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile

BASE = "dist/modes/interactive/components/"
MODULE = BASE + "extension-dialogs.js"
MODULE_SOURCE = Path(__file__).with_name("extension-dialogs.js.inc").read_text()
MARKER = "// configs:pi-extension-dialogs-v1"
COMMON = [
    ('import { DynamicBorder } from "./dynamic-border.js";',
     'import { DialogBorder, DialogText, dialogHeading, ExtensionDialogContainer } from "./extension-dialogs.js";', 1),
    ('extends Container {', 'extends ExtensionDialogContainer {', 1),
    ('this.addChild(new DynamicBorder());\n        this.addChild(new Spacer(1));',
     'this.addChild(new DialogBorder());\n        this.addChild(new Spacer(1));', 1),
    ('this.addChild(new DynamicBorder());', 'this.addChild(new DialogBorder(true));', 1),
]
EDITS = {
    BASE + "extension-selector.js": [
        ('import { Container, getKeybindings, Spacer, Text }', 'import { Container, getKeybindings, Spacer }', 1),
        *COMMON,
        ('this.titleText = new Text(theme.fg("accent", theme.bold(title)), 1, 0);',
         'this.dialogTitle = title;\n        this.titleText = new DialogText(() => dialogHeading(this.dialogTitle));', 1),
        ('(s) => this.titleText.setText(theme.fg("accent", theme.bold(`${this.baseTitle} (${s}s)`)))',
         '(s) => { this.dialogTitle = `${this.baseTitle} (${s}s)`; }', 1),
        ('this.addChild(new Text(rawKeyHint("↑↓", "navigate") +',
         'this.addChild(new DialogText(() => rawKeyHint("↑↓", "navigate") +', 1),
        ('keyHint("tui.select.cancel", "cancel"), 1, 0));',
         'keyHint("tui.select.cancel", "cancel")));', 1),
        ('''            const text = isSelected
                ? theme.fg("accent", "→ ") + theme.fg("accent", this.options[i])
                : `  ${theme.fg("text", this.options[i])}`;
            this.listContainer.addChild(new Text(text, 1, 0));''', '''            this.listContainer.addChild(new DialogText(() => isSelected
                ? theme.fg("accent", "◆ ") + theme.fg("text", theme.bold(this.options[i]))
                : theme.fg("muted", "◇ ") + theme.fg("text", this.options[i])));''', 1),
    ],
    BASE + "extension-input.js": [
        ('import { Container, getKeybindings, Input, Spacer, Text }', 'import { getKeybindings, Input, Spacer }', 1),
        *COMMON,
        ('this.titleText = new Text(theme.fg("accent", title), 1, 0);',
         'this.dialogTitle = title;\n        this.titleText = new DialogText(() => dialogHeading(this.dialogTitle));', 1),
        ('(s) => this.titleText.setText(theme.fg("accent", `${this.baseTitle} (${s}s)`))',
         '(s) => { this.dialogTitle = `${this.baseTitle} (${s}s)`; }', 1),
        ('this.addChild(new Text(`${keyHint("tui.select.confirm", "submit")}  ${keyHint("tui.select.cancel", "cancel")}`, 1, 0));',
         'this.addChild(new DialogText(() => `${keyHint("tui.select.confirm", "submit")}  ${keyHint("tui.select.cancel", "cancel")}`));', 1),
    ],
    BASE + "extension-editor.js": [
        ('import { Container, Editor, getKeybindings, Spacer, Text, }', 'import { Editor, getKeybindings, Spacer }', 1),
        *COMMON,
        ('this.addChild(new Text(theme.fg("accent", title), 1, 0));',
         'this.addChild(new DialogText(() => dialogHeading(title)));', 1),
        ('const hint = keyHint("tui.select.confirm", "submit") +',
         'const hint = () => keyHint("tui.select.confirm", "submit") +', 1),
        ('this.addChild(new Text(hint, 1, 0));', 'this.addChild(new DialogText(hint));', 1),
    ],
}


def transform(name: str, source: str, reverse: bool = False) -> str:
    edits = list(reversed(EDITS[name])) if reverse else EDITS[name]
    for old, new, count in edits:
        before, after = (new, old) if reverse else (old, new)
        if source.count(before) != count:
            raise ValueError(f"{name}: changed/duplicate dialog anchor {before[:80]!r}")
        source = source.replace(before, after)
    return source


def patch_sources(sources: dict[str, str]) -> dict[str, str]:
    states = [sources[name].count(MARKER) for name in EDITS]
    if any(count not in (0, 1) for count in states) or len(set(states)) != 1:
        raise ValueError("partial or duplicated native dialog patch")
    if states[0] == 1:
        if sources.get(MODULE) != MODULE_SOURCE:
            raise ValueError("native dialog helper changed or missing")
        for name in EDITS:
            if not sources[name].startswith(MARKER + "\n"):
                raise ValueError(f"{name}: native dialog marker moved")
            source = sources[name].removeprefix(MARKER + "\n")
            original = transform(name, source, reverse=True)
            if transform(name, original) != source:
                raise ValueError(f"{name}: inconsistent native dialog patch")
        return sources
    if MODULE in sources:
        raise ValueError("unexpected native dialog helper alongside original sources")
    result = {name: MARKER + "\n" + transform(name, sources[name]) for name in EDITS}
    result[MODULE] = MODULE_SOURCE
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
        print("Pi host not installed; skipping native dialog UI patch")
        return
    version = json.loads((root / "package.json").read_text())["version"]
    if version != "0.84.2":
        raise ValueError(f"native dialog UI requires Pi 0.84.2, found {version}; review upstream first")
    sources = {name: (root / name).read_text() for name in EDITS}
    if (root / MODULE).exists():
        sources[MODULE] = (root / MODULE).read_text()
    patched = patch_sources(sources)
    if patched != sources:
        backup_root = Path.home() / ".config/theme-backups"
        backup_root.mkdir(parents=True, exist_ok=True)
        backup = Path(tempfile.mkdtemp(prefix="pi-extension-dialogs-", dir=backup_root))
        for name in sources:
            target = backup / name
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(root / name, target)
        (backup / "added-files.json").write_text(json.dumps([MODULE]) + "\n")
        print(f"Pi native dialog backup: {backup}")
        for name, source in patched.items():
            (root / name).write_text(source)
    print("Pi native dialog UI ready; restart Pi to apply")


if __name__ == "__main__":
    main()
