---
name: brief
description: Use when the user writes /brief to explain technical concepts in a short, high-signal format. Scope is one message only; do not keep using brief style unless /brief appears again.
compatibility: claude-code opencode codex
---

# Brief Technical Explanations

Use this skill when the user includes `/brief` in a message.

## Behavior

- Apply this style only to the message that contains `/brief`.
- Do not persist the style into later turns unless the user includes `/brief` again.
- Explain the requested technical concept quickly, with the fewest words that preserve correctness.
- Prefer direct definitions, mental models, and practical consequences over background history.
- Keep commands, code identifiers, file paths, URLs, numbers, and quoted text exact.

## Style

- Start with the answer, not a preamble.
- Use short paragraphs or flat bullets.
- Avoid filler, long analogies, and restating the question.
