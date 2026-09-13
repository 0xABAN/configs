#!/usr/bin/env python3
"""Add aligned footer groups and an opt-in context meter to pinned powerline.

Validate every file before writing. Preserve unrelated local patches; refuse
partial/changed upstream anchors instead of guessing. Re-run after updates.
"""
from pathlib import Path


ALIGN = '''// configs:powerline-layout-v1
/** Keep ANSI-aware left/right groups at opposite edges, including overflow rows. */
function buildAlignedContent(
  parts: { content: string; right: boolean }[],
  style: StatusLineSeparatorStyle,
  width: number,
): string {
  const left = buildContentFromParts(parts.filter(p => !p.right).map(p => p.content), style);
  const right = buildContentFromParts(parts.filter(p => p.right).map(p => p.content), style);
  if (!right) return left;
  const gap = width - visibleWidth(left) - visibleWidth(right);
  // Existing packing is conservative. Fall back rather than exceed tiny widths.
  if (gap < 0) return buildContentFromParts(parts.map(p => p.content), style);
  return left + " ".repeat(gap) + right;
}

'''
METER = '''// configs:powerline-meter-v1
/** Clamp the five-cell gauge, but retain the reported percentage and approximation. */
function contextMeter(percent: number | null, approximate: boolean): string {
  if (percent === null || !Number.isFinite(percent)) return "[-----] ? context";
  const filled = Math.round(Math.max(0, Math.min(100, percent)) / 20);
  return `[${"▰".repeat(filled)}${"▱".repeat(5 - filled)}] ${approximate ? "~" : ""}${Math.round(percent)}% context`;
}

'''

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


def patch_sources(sources: dict[str, str]) -> dict[str, str]:
    """Accept a wholly original or wholly patched set, never a partial patch."""
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
