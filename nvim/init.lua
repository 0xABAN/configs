-- Match Ghostty/cmux pane background (opacity + blur show through).
vim.opt.termguicolors = true
vim.opt.background = "dark"
vim.opt.number = true
vim.opt.clipboard = "unnamedplus" -- yank → macOS clipboard

-- leader before plugins (Space)
vim.g.mapleader = " "
vim.g.maplocalleader = " "

-- leave insert mode without stretching for Esc
vim.keymap.set("i", "jk", "<Esc>")

-- Mac-style word-delete (insert + command-line)
local word_back = { "i", "c" }
vim.keymap.set(word_back, "<M-BS>", "<C-w>") -- Option+Backspace
vim.keymap.set(word_back, "<A-BS>", "<C-w>") -- Alt/Option alias
vim.keymap.set(word_back, "<C-BS>", "<C-w>") -- Ctrl+Backspace

-- lazy.nvim bootstrap
local lazypath = vim.fn.stdpath("data") .. "/lazy/lazy.nvim"
if not (vim.uv or vim.loop).fs_stat(lazypath) then
  vim.fn.system({
    "git",
    "clone",
    "--filter=blob:none",
    "--branch=stable",
    "https://github.com/folke/lazy.nvim.git",
    lazypath,
  })
end
vim.opt.rtp:prepend(lazypath)

require("lazy").setup("plugins", {
  change_detection = { notify = false },
  install = { colorscheme = { "cream-red" } },
})

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
