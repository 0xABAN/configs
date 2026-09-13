#!/usr/bin/env python3
"""Add aligned footer groups and an opt-in context meter to pinned powerline.

Validate every file before writing. Preserve unrelated local patches; refuse
partial/changed upstream anchors instead of guessing. Re-run after updates.
"""
from pathlib import Path

from patch_support import read_payload


# Current output is readable on its own; only legacy variants are derived.
ALIGN = read_payload('powerline/aligned-content.ts.inc') + "\n"
LEGACY_ALIGN = ALIGN.replace(
    'const right = buildContentFromParts(parts.filter(p => p.right).map(p => p.content), style, "");',
    'const right = buildContentFromParts(parts.filter(p => p.right).map(p => p.content), style);',
)

METER = read_payload('powerline/context-meter.ts.inc') + "\n"
LEGACY_METER = METER.replace('return "● [-----]', 'return "[-----]').replace('return `● [${', 'return `[${')


EDITS = {
    "index.ts": [
        ("function computeResponsiveLayout(", ALIGN + "function computeResponsiveLayout("),
        ("const renderedSegments: { content: string; width: number }[] = [];",
         "const renderedSegments: { content: string; width: number; right: boolean }[] = [];"),
        ("renderedSegments.push({ content, width });",
         "renderedSegments.push({ content, width, right: mergedSegments.rightSegments.includes(segId) });"),
        ("let topSegments: string[] = [];",
         "let topSegments: typeof renderedSegments = [];"),
        ("let overflowSegments: { content: string; width: number }[] = [];",
         "let overflowSegments: typeof renderedSegments = [];"),
        ("topSegments.push(seg.content);", "topSegments.push(seg);"),
        ("let secondarySegments: string[] = [];",
         "let secondarySegments: typeof renderedSegments = [];"),
        ("secondarySegments.push(seg.content);", "secondarySegments.push(seg);"),
        ("topContent: buildContentFromParts(topSegments, separatorStyle),",
         "topContent: buildAlignedContent(topSegments, separatorStyle, availableWidth),"),
        ("secondaryContent: buildContentFromParts(secondarySegments, separatorStyle),",
         "secondaryContent: buildAlignedContent(secondarySegments, separatorStyle, availableWidth),"),
    ],
    "segments.ts": [
        ("const contextPctSegment: StatusLineSegment = {", METER + "const contextPctSegment: StatusLineSegment = {"),
        ('const percentOnly = ctx.options.context?.format === "percent";',
         'const meter = ctx.options.context?.format === "meter";\n    const percentOnly = meter || ctx.options.context?.format === "percent";'),
        ("const text = percentOnly\n      ? (hasKnownUsage",
         "const text = meter\n      ? contextMeter(hasKnownUsage ? contextPercent : null, !!ctx.contextApproximate)\n      : percentOnly\n      ? (hasKnownUsage"),
    ],
    "types.ts": [
        ('context?: { format?: "full" | "percent" };',
         'context?: { format?: "full" | "percent" | "meter" };'),
    ],
    "powerline-config.ts": [
        ('raw.context.format === "full" || raw.context.format === "percent" ?',
         'raw.context.format === "full" || raw.context.format === "percent" || raw.context.format === "meter" ?'),
    ],
}


UNSTAGED_EDIT = (
    'indicators.push(applyColor(ctx.theme, "warning", `*${gitStatus.unstaged}`));',
    'indicators.push(applyColor(ctx.theme, "#85877e", `*${gitStatus.unstaged}`));',
)


SEPARATOR_EDIT = (
    'const sep = separatorDef.left;',
    'const sep = separator ?? (separatorStyle === "chevron" ? "❯" : separatorDef.left);',
)
LEGACY_SEPARATOR = 'const sep = separatorStyle === "chevron" ? "❯" : separatorDef.left;'
SEPARATOR_ARGUMENT_EDIT = (
    '''function buildContentFromParts(
  parts: string[],
  separatorStyle: StatusLineSeparatorStyle,
): string {''',
    '''function buildContentFromParts(
  parts: string[],
  separatorStyle: StatusLineSeparatorStyle,
  separator?: string,
): string {''',
)


SEPARATOR_JOIN_EDIT = (
    'parts.join(` ${sepAnsi}${sep}${ansi.reset} `)',
    'parts.join(separator === "" ? " " : ` ${sepAnsi}${sep}${ansi.reset} `)',
)


def patch_sources(sources: dict[str, str]) -> dict[str, str]:
    """Accept a wholly original or wholly patched set, never a partial patch."""
    # Small appearance upgrades also apply over an already-installed layout.
    # Keep other warning colors and separator styles intact.
    sources = dict(sources)
    for previous_color in ["95, 168, 118", "94, 158, 128", "94, 158, 170", "67, 145, 135"]:
        previous_align = LEGACY_ALIGN.replace(
            "const right = buildContentFromParts(parts.filter(p => p.right).map(p => p.content), style);",
            'const right = buildContentFromParts(parts.filter(p => p.right).map(p => p.content), style,\n'
            f'    ansi.getFgAnsi({previous_color}) + "●" + ansi.reset);',
        )
        sources["index.ts"] = sources["index.ts"].replace(previous_align, ALIGN)
    sources["segments.ts"] = sources["segments.ts"].replace(LEGACY_METER, METER)
    sources["index.ts"] = (sources["index.ts"]
        .replace(LEGACY_ALIGN, ALIGN)
        .replace(LEGACY_SEPARATOR, SEPARATOR_EDIT[1]))
    for name, (old, new) in [
        ("segments.ts", UNSTAGED_EDIT),
        ("index.ts", SEPARATOR_EDIT),
        ("index.ts", SEPARATOR_ARGUMENT_EDIT),
        ("index.ts", SEPARATOR_JOIN_EDIT),
    ]:
        source = sources[name]
        if source.count(new) == 0 and source.count(old) == 1:
            sources[name] = source.replace(old, new, 1)
        elif source.count(new) != 1 or source.count(old) != 0:
            raise ValueError(f"{name}: appearance anchor changed or duplicated")

    states = []
    for name, edits in EDITS.items():
        source = sources[name]
        for old, new in edits:
            if source.count(new) == 1:
                states.append("patched")
            elif source.count(new) == 0 and source.count(old) == 1:
                states.append("original")
            else:
                raise ValueError(f"{name}: upstream anchor changed or duplicated: {old[:70]}")
    if len(set(states)) != 1:
        raise ValueError("partial powerline layout patch; inspect before reapplying")
    if states[0] == "patched":
        return sources
    result = {}
    for name, source in sources.items():
        for old, new in EDITS[name]:
            source = source.replace(old, new, 1)
        result[name] = source
    return result


def main() -> None:
    root = Path.home() / ".pi/agent/git/github.com/nicobailon/pi-powerline-footer"
    if not root.exists():
        print("powerline not installed; skipping layout patch")
        return
    sources = {name: (root / name).read_text() for name in EDITS}
    patched = patch_sources(sources)
    for name, content in patched.items():
        if content != sources[name]:
            (root / name).write_text(content)
    print("powerline aligned layout and context meter ready")


if __name__ == "__main__":
    main()
