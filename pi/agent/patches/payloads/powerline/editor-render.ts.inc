        // Reserve both walls and the three-column prompt before wrapping input.
        const contentWidth = boxWidth - 5;
        // Render the native editor with a 40% viewport while preserving the real terminal size.
        const terminalRows = tui.terminal.rows;
        const visibleRowLimit = Math.max(5, Math.floor(terminalRows * 0.4));
        const contentRowLimit = Math.max(1, visibleRowLimit - 2);
        const renderTerminal = Object.create(tui.terminal);
        Object.defineProperty(renderTerminal, "rows", { value: Math.ceil(contentRowLimit / 0.3) });
        const originalTerminal = editor.tui.terminal;
        editor.tui.terminal = renderTerminal;
        let lines: string[];
        try {
          lines = originalRender(contentWidth);
        } finally {
          editor.tui.terminal = originalTerminal;
        }

        const contentRows = Math.max(1, Math.min(inputLineCount, contentRowLimit));
        const blankRow = " ".repeat(Math.max(0, contentWidth));
        lines.splice(1, 0, blankRow);
        lines.splice(2 + contentRows, 0, blankRow);
        inputLineCount = contentRows + 2;
