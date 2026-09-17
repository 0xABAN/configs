"""Extract only Intercom's real renderers for offline native/terminal fixtures.

Never import its entrypoint: session_start and bus handlers can start a broker.
The fixture registers synthetic execution/delivery, not Intercom runtime hooks.
"""
import json
from pathlib import Path
import sys


def between(source: str, start: str, end: str) -> str:
    if source.count(start) != 1:
        raise ValueError(f"Intercom fixture start changed: {start}")
    remaining = source[source.index(start):]
    if remaining.count(end) != 1:
        raise ValueError(f"Intercom fixture end changed: {end}")
    return remaining[:remaining.index(end)]


def renderers_source(package: Path) -> str:
    source = (package / "index.ts").read_text()
    helpers = between(source, "function previewText(", "function formatMessageTimestamp(")
    call = between(source, '    renderCall(args, theme) {\n      const action =', '\n  }));\n\n  function insertIntoEditor')
    incoming = between(source, '  pi.registerMessageRenderer("intercom_message",', '\n\n  pi.on("tool_result",')
    incoming = incoming.removeprefix('  pi.registerMessageRenderer("intercom_message",').removesuffix(');')
    return ('import { Text } from "@earendil-works/pi-tui";\n'
            'import { Type } from "typebox";\n'
            'import type { Message, SessionInfo } from ' + json.dumps(str(package / "types.ts")) + ';\n'
            'import { InlineMessageComponent } from ' + json.dumps(str(package / "ui/inline-message.ts")) + ';\n'
            + helpers + '\nexport const renderers = {\n' + call + '\n};\n'
            + 'export const incomingRenderer = ' + incoming + ';\n')


def write_fixture(package: Path, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(renderers_source(package) + '''
export default function (pi) {
  pi.registerTool({
    name: "intercom", label: "Intercom fixture", description: "Offline UI fixture only",
    parameters: Type.Object({ action: Type.String(), to: Type.Optional(Type.String()), message: Type.Optional(Type.String()) }),
    async execute() {
      return { content: [{ type: "text", text: "INTERCOM_EXPANDED_DETAIL" }], details: { messageId: "synthetic-outgoing-id" } };
    },
    ...renderers,
  });
  pi.registerMessageRenderer("intercom_message", incomingRenderer);
  pi.registerCommand("intercom-fixture", {
    handler() {
      const from = { id: "synthetic-sender", name: "Fixture peer", cwd: "/synthetic/project", model: "faux", pid: 0, startedAt: 0, lastActivity: 0 };
      const message = { id: "synthetic-incoming-id", timestamp: 1750000000000,
        content: { text: "INTERCOM_PREVIEW", attachments: [{ type: "snippet", name: "fixture.txt", content: "INTERCOM_ATTACHMENT" }] } };
      pi.sendMessage({ customType: "intercom_message", content: "INTERCOM_MODEL_CONTENT", display: true,
        details: { from, message, replyCommand: "SYNTHETIC_REPLY_HINT" } }, { triggerTurn: false });
    },
  });
}
''')


if __name__ == "__main__":
    write_fixture(Path(sys.argv[1]).resolve(), Path(sys.argv[2]).resolve())
