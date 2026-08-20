-- Match Ghostty/cmux pane background (opacity + blur show through).
vim.opt.termguicolors = true
vim.opt.background = "dark"
vim.opt.number = true

-- leave insert mode without stretching for Esc
vim.keymap.set("i", "jk", "<Esc>")

-- Mac-style word-delete (insert + command-line)
local word_back = { "i", "c" }
vim.keymap.set(word_back, "<M-BS>", "<C-w>") -- Option+Backspace
vim.keymap.set(word_back, "<A-BS>", "<C-w>") -- Alt/Option alias
vim.keymap.set(word_back, "<C-BS>", "<C-w>") -- Ctrl+Backspace

local function clear_bg()
  for _, group in ipairs({
    "Normal",
    "NormalNC",
    "NormalFloat",
    "EndOfBuffer",
    "SignColumn",
    "LineNr",
    "CursorLineNr",
    "Folded",
    "FoldColumn",
    "StatusLine",
    "StatusLineNC",
    "WinSeparator",
    "VertSplit",
  }) do
    vim.api.nvim_set_hl(0, group, { bg = "NONE" })
  end
end

-- Pi cream-red code palette (see colors/cream-red.lua)
vim.cmd.colorscheme("cream-red")
clear_bg()
vim.api.nvim_create_autocmd("ColorScheme", { callback = clear_bg })
