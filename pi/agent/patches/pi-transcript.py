#!/usr/bin/env python3
"""Install the display-only transcript preview into Pi 0.84.2; restart to apply.

Keep native tools and session records intact. Refuse partial/unknown hosts before
writing; back up every changed source and leave unrelated installed edits alone.
"""
import json
from pathlib import Path

from patch_support import (
    read_payload,
    discover_pi_root as discover_root,
    backup_sources,
    write_sources,
)


BASE = "dist/modes/interactive/"
MODULE = BASE + "components/transcript.js"
MODULE_SOURCE = read_payload('host/transcript.js.inc')
LEGACY_MODULE_SOURCE = read_payload('host/legacy/transcript.js.inc')
EDITS = {
    BASE + "interactive-mode.js": [
        ('import { UserMessageComponent } from "./components/user-message.js";',
         'import { UserMessageComponent } from "./components/user-message.js";\n'
         'import { TranscriptContainer } from "./components/transcript.js"; // configs:pi-transcript-v1'),
        ("        this.chatContainer = new Container();",
         "        this.chatContainer = new TranscriptContainer(() => this.outputPad);"),
        ('''    getRegisteredToolDefinition(toolName) {
        return this.session.getToolDefinition(toolName);
    }''', '''    getRegisteredToolDefinition(toolName) {
        const definition = this.session.getToolDefinition(toolName);
        if (!definition) return definition;
        // Only native and the installed pretty formatters opt into compact rows.
        // Do not replace arbitrary extensions' custom UI, even for built-in names.
        const owner = this.session.getAllTools().find(tool => tool.name === toolName)?.sourceInfo?.source;
        return { ...definition, configsTranscriptCompact:
            owner === "builtin" || /^npm:@heyhuynhgiabuu\\/pi-pretty(?:@|$)/.test(owner ?? "") };
    }'''),
        ("new UserMessageComponent(skillBlock.userMessage, this.getMarkdownThemeWithSettings(), this.outputPad, this.getMarkdownTransformers())",
         "new UserMessageComponent(skillBlock.userMessage, this.getMarkdownThemeWithSettings(), this.outputPad, this.getMarkdownTransformers(), message.timestamp)"),
        ("new UserMessageComponent(textContent, this.getMarkdownThemeWithSettings(), this.outputPad, this.getMarkdownTransformers())",
         "new UserMessageComponent(textContent, this.getMarkdownThemeWithSettings(), this.outputPad, this.getMarkdownTransformers(), message.timestamp)"),
    ],
    BASE + "components/user-message.js": [
        ('import { createMarkdownTransform } from "./markdown-transform.js";',
         'import { createMarkdownTransform } from "./markdown-transform.js";\n'
         'import { speakerHeader } from "./transcript.js"; // configs:pi-transcript-v1'),
        ("    text;", '    transcriptRole = "user";\n    timestamp;\n    text;'),
        ("constructor(text, markdownTheme = getMarkdownTheme(), outputPad = 1, markdownTransformers = [])",
         "constructor(text, markdownTheme = getMarkdownTheme(), outputPad = 1, markdownTransformers = [], timestamp)"),
        ("        this.outputPad = outputPad;", "        this.outputPad = outputPad + 2;\n        this.transcriptBasePad = outputPad;\n        this.timestamp = timestamp;"),
        ("        this.outputPad = padding;", "        this.outputPad = padding + 2;\n        this.transcriptBasePad = padding;"),
        ('        const contentBox = new Box(this.outputPad, 1, (content) => theme.bg("userMessageBg", content));',
         "        const contentBox = new Box(this.outputPad, 0);"),
        ("        const lines = super.render(width);", '''        const padding = Math.min(this.transcriptBasePad + 2, Math.max(0, Math.floor((width - 2) / 2)));
        if (this.outputPad !== padding) {
            this.outputPad = padding;
            this.rebuild();
        }
        const lines = super.render(width);
        lines.unshift("", speakerHeader("You", this.timestamp, this.transcriptBasePad, width));'''),
    ],
    BASE + "components/assistant-message.js": [
        ('import { createMarkdownTransform } from "./markdown-transform.js";',
         'import { createMarkdownTransform } from "./markdown-transform.js";\n'
         'import { speakerHeader } from "./transcript.js"; // configs:pi-transcript-v1'),
        ("    contentContainer;", '    transcriptRole = "pi";\n    contentContainer;'),
        ("        this.outputPad = outputPad;", "        this.outputPad = outputPad + 2;\n        this.transcriptBasePad = outputPad;"),
        ("        this.outputPad = padding;", "        this.outputPad = padding + 2;\n        this.transcriptBasePad = padding;"),
        ("        const lines = super.render(width);", '''        const padding = Math.min(this.transcriptBasePad + 2, Math.max(0, Math.floor((width - 2) / 2)));
        if (this.outputPad !== padding) {
            this.outputPad = padding;
            if (this.lastMessage) this.updateContent(this.lastMessage);
        }
        const lines = super.render(width);
        if (this.transcriptHeader !== false && (lines.length || this.hasToolCalls)) {
            if (lines[0] === "") lines.shift();
            lines.unshift("", speakerHeader("Pi", this.lastMessage?.timestamp, this.transcriptBasePad, width));
        }'''),
    ],
    BASE + "components/tool-execution.js": [
        ("    contentBox;", '    transcriptRole = "tool"; // configs:pi-transcript-v1\n    contentBox;'),
    ],
}


def patch_sources(sources: dict[str, str]) -> dict[str, str]:
    """Accept original sources or this complete preview, not mixed installations."""
    states = []
    for name, edits in EDITS.items():
        source = sources[name]
        # New render blocks can legitimately contain an old setter statement.
        # Exclude all recognized replacements before looking for stray originals.
        remainder = source
        for _, new in edits:
            if source.count(new) == 1:
                remainder = remainder.replace(new, "", 1)
        for old, new in edits:
            if source.count(new) == 1 and old not in remainder:
                states.append("patched")
            elif source.count(new) == 0 and source.count(old) == 1:
                states.append("original")
            else:
                raise ValueError(f"{name}: transcript anchor changed or duplicated: {old[:70]}")
    if len(set(states)) != 1:
        raise ValueError("partial transcript patch; inspect before reapplying")
    if states[0] == "patched":
        if sources.get(MODULE) not in (MODULE_SOURCE, LEGACY_MODULE_SOURCE):
            raise ValueError("transcript module changed or missing; inspect before reapplying")
        # Only a fully validated installation may upgrade its exact older helper.
        return {**sources, MODULE: MODULE_SOURCE}
    if MODULE in sources:
        raise ValueError("unexpected transcript module alongside unpatched host")
    result = dict(sources)
    for name, edits in EDITS.items():
        for old, new in edits:
            result[name] = result[name].replace(old, new, 1)
    result[MODULE] = MODULE_SOURCE
    return result


def main() -> None:
    root = discover_root()
    if root is None or not root.exists():
        print("Pi host not installed; skipping transcript preview")
        return
    version = json.loads((root / "package.json").read_text())["version"]
    if version != "0.84.2":
        raise ValueError(f"transcript patch requires Pi 0.84.2, found {version}; review upstream first")
    sources = {name: (root / name).read_text() for name in EDITS}
    if (root / MODULE).exists():
        sources[MODULE] = (root / MODULE).read_text()
    patched = patch_sources(sources)
    if patched != sources:
        backup = backup_sources(
            root, sources, "pi-transcript-", added_files=sorted(set(patched) - set(sources)),
        )
        print(f"Pi transcript backup: {backup}")
        write_sources(root, patched)
    print("Pi transcript preview ready; restart Pi to apply")


if __name__ == "__main__":
    main()
