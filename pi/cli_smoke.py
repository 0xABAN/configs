#!/usr/bin/env python3
"""Render the chosen executable in real terminals, with only offline UI fixtures."""

import argparse
import json
import os
from pathlib import Path
import re
import shlex
import subprocess
import time
import uuid

from agent.tests.support.intercom_fixture import write_fixture


ANSI = re.compile(r"\x1b\[[0-9;]*m")


def smoke(sdk: Path, launcher: Path, config: Path, home: Path, output: Path) -> None:
    """Check host rendering with configured pi-pretty, Powerline and the real theme.

    Intercom's renderer callbacks are extracted into a synthetic npm package;
    its entrypoint and broker hooks never run. Other personal extensions remain
    excluded because they can contact live peers or services.
    """
    output.mkdir(parents=True)
    agent = output / "agent"
    agent.mkdir()
    settings = json.loads((config / "pi/agent/settings.json").read_text())
    settings = {key: settings[key] for key in ("powerline", "theme")}
    settings.update(quietStartup=True, lastChangelogVersion="0.85.1", packages=["npm:pi-intercom"])
    # Preserve canonical npm owner metadata without loading the broker runtime.
    intercom = home / ".pi/agent/npm/node_modules/pi-intercom"
    synthetic = agent / "npm/node_modules/pi-intercom"
    write_fixture(intercom, synthetic / "index.ts")
    (synthetic / "package.json").write_text(json.dumps({
        "name": "pi-intercom", "version": "0.13.0", "pi": {"extensions": ["./index.ts"]},
    }))
    work = output / "work"
    work.mkdir()
    (agent / "settings.json").write_text(json.dumps(settings))
    pretty = home / ".pi/agent/npm/node_modules/@heyhuynhgiabuu/pi-pretty/src/index.ts"
    powerline = home / ".pi/agent/git/github.com/nicobailon/pi-powerline-footer/index.ts"
    theme = config / "pi/agent/themes/osaka-jade.json"
    for path in (pretty, powerline, theme):
        if not path.is_file():
            raise RuntimeError(f"missing configured UI source: {path}")
    faux = sdk / "node_modules/@earendil-works/pi-ai/dist/providers/faux.js"
    extension = output / "offline.ts"
    extension.write_text('''import { writeFileSync } from "node:fs";
import { fauxProvider, fauxAssistantMessage, fauxToolCall } from ''' + json.dumps(str(faux)) + ''';
export default function (pi) {
  const root = process.env.PI_CLI_SMOKE_OUTPUT;
  const faux = fauxProvider();
  pi.registerProvider(faux.provider);
  faux.setResponses([
    fauxAssistantMessage(fauxToolCall("intercom", { action: "status" }), { stopReason: "toolUse" }),
    fauxAssistantMessage("OFFLINE_CUSTOM_HOST_RESPONSE"),
  ]);
  pi.on("session_start", () => writeFileSync(`${root}/ready`, "ready"));
  pi.on("agent_end", event => writeFileSync(`${root}/response.json`, JSON.stringify(event.messages)));
}
''')
    env = {"PATH": os.environ.get("PATH", os.defpath), "HOME": str(home),
           "PI_CODING_AGENT_DIR": str(agent), "TERM": "xterm-256color", "COLORTERM": "truecolor",
           "LANG": "en_US.UTF-8", "PI_OFFLINE": "1", "PI_TELEMETRY": "0", "PI_TRUE_COLOR": "1"}
    results = {}
    for mode in ("regular", "fullscreen"):
        run = output / mode
        run.mkdir()
        target = "pi-cli-smoke-" + uuid.uuid4().hex
        env["PI_CLI_SMOKE_OUTPUT"] = str(run)
        command = ["env", "-i", *(f"{key}={value}" for key, value in env.items()), str(launcher),
                   "--no-session", "--no-skills", "--no-prompt-templates",
                   "--no-context-files", "--no-themes", "--theme", str(theme),
                   "-e", str(pretty), "-e", str(powerline), "-e", str(extension),
                   "--provider", "faux", "--model", "faux-1", "--models", "faux/*",
                   "--tui-mode", mode]
        (run / "command.json").write_text(json.dumps(command, indent=2) + "\n")
        subprocess.run(["tmux", "new-session", "-d", "-s", target, "-x", "120", "-y", "36", "-c", str(work),
                        shlex.join(command) + "; exec /bin/sh"], check=True)
        try:
            deadline = time.monotonic() + 40
            sent = False
            while time.monotonic() < deadline:
                screen = subprocess.check_output(["tmux", "capture-pane", "-t", target, "-p", "-e", "-S", "-500"], text=True)
                (run / "response-screen.ansi").write_text(screen)
                plain = ANSI.sub("", screen)
                (run / "response-screen.txt").write_text(plain)
                if "Failed to load extension" in plain or "Error loading extension" in plain:
                    raise RuntimeError(f"extension startup failed: {run}")
                if (run / "ready").exists() and not sent:
                    subprocess.run(["tmux", "send-keys", "-t", target, "CUSTOM_HOST_PROMPT", "Enter"], check=True)
                    sent = True
                if (run / "response.json").exists() and "OFFLINE_CUSTOM_HOST_RESPONSE" in plain:
                    break
                time.sleep(0.1)
            else:
                raise RuntimeError(f"no rendered offline response: {run}")

            # Add a synthetic incoming message only after the faux turn has settled.
            # The actual native command/tool pipeline is used, never orphan results.
            subprocess.run(["tmux", "send-keys", "-t", target, "/intercom-fixture", "Enter"], check=True)
            deadline = time.monotonic() + 10
            while time.monotonic() < deadline:
                screen = subprocess.check_output(["tmux", "capture-pane", "-t", target, "-p", "-e", "-S", "-500"], text=True)
                plain = ANSI.sub("", screen)
                if "INTERCOM_PREVIEW" in plain:
                    break
                time.sleep(0.1)
            else:
                raise RuntimeError(f"incoming Intercom fixture did not render: {run}")
            (run / "intercom-collapsed.ansi").write_text(screen)
            (run / "intercom-collapsed.txt").write_text(plain)

            # These assert the terminal output, not imported modules or source markers.
            checks = {
                "user_header": bool(re.search(r"(?m)^ +◆ You", plain)),
                "assistant_header": bool(re.search(r"(?m)^ +● Pi", plain)),
                "outer_inset_and_separator": bool(re.search(r"(?m)^  ─{116}$", plain)),
                "cream_separator": bool(re.search(r"\x1b\[38;2;222;222;197m[^\n]*─{116}", screen)),
                "powerline_footer": "Faux Model" in plain and "context" in plain and "↳ CUSTOM_HOST_PROMPT" in plain,
                "offline_response": "OFFLINE_CUSTOM_HOST_RESPONSE" in (run / "response.json").read_text(),
                "intercom_invocation": bool(re.search(r"✓ ⌇ Tool +intercom", plain)),
                "intercom_no_duplicate_body": "INTERCOM_EXPANDED_DETAIL" not in plain and "intercom status" not in plain,
                "intercom_sender": "◇ From Fixture peer" in plain,
                "intercom_preview": "INTERCOM_PREVIEW" in plain and "INTERCOM_ATTACHMENT" not in plain,
                "intercom_no_card": "From:" not in plain and "╭ From" not in plain,
                "intercom_model_content_hidden": "INTERCOM_MODEL_CONTENT" not in plain,
            }
            subprocess.run(["tmux", "send-keys", "-t", target, "C-o"], check=True)
            deadline = time.monotonic() + 10
            while time.monotonic() < deadline:
                expanded = subprocess.check_output(["tmux", "capture-pane", "-t", target, "-p", "-e", "-S", "-500"], text=True)
                expanded_plain = ANSI.sub("", expanded)
                if "INTERCOM_ATTACHMENT" in expanded_plain and "INTERCOM_EXPANDED_DETAIL" in expanded_plain:
                    break
                time.sleep(0.1)
            (run / "intercom-expanded.ansi").write_text(expanded)
            (run / "intercom-expanded.txt").write_text(expanded_plain)
            checks["intercom_expanded"] = all(text in expanded_plain for text in (
                "INTERCOM_ATTACHMENT", "INTERCOM_EXPANDED_DETAIL", "SYNTHETIC_REPLY_HINT", "synthetic-incoming-id",
            ))
            results[mode] = checks
            (output / "assertions.json").write_text(json.dumps(results, indent=2) + "\n")
            if not all(checks.values()):
                raise RuntimeError(f"{mode} actual-CLI assertions failed: {checks}; see {run}")
            print(f"{mode}: actual {launcher} rendered headers, cream separator, 2-column outer inset, Powerline, faux response and synthetic Intercom collapse/expansion")
        finally:
            subprocess.run(["tmux", "kill-session", "-t", target], check=False, capture_output=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("sdk", "launcher", "config", "home", "output"):
        parser.add_argument("--" + name, required=True, type=Path)
    args = parser.parse_args()
    smoke(args.sdk.resolve(), args.launcher.absolute(), args.config.resolve(), args.home.resolve(), args.output.resolve())
