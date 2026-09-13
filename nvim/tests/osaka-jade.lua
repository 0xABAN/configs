-- Run from the repository root: nvim --headless -u NONE -l nvim/tests/osaka-jade.lua
vim.opt.runtimepath:prepend(vim.fn.getcwd() .. "/nvim")
vim.cmd.colorscheme("osaka-jade")

local function color(group, key, expected)
  local hl = vim.api.nvim_get_hl(0, { name = group, link = false })
  assert(hl[key] == tonumber(expected, 16), group .. "." .. key .. " differs from the palette")
end

assert(vim.g.colors_name == "osaka-jade")
color("Normal", "bg", "121319")
color("Normal", "fg", "c7c9a2")
color("WinSeparator", "fg", "282c30")
color("Function", "fg", "dedec5")
color("@keyword", "fg", "c7c9a2")
color("GitSignsAdd", "fg", "5fa876")
color("NeoTreeGitDeleted", "fg", "c7837c")
color("DiagnosticWarn", "fg", "c7b777")
color("Visual", "bg", "282c30")
color("TabLineSel", "bg", "181a20")
color("PmenuSel", "bg", "282c30")
color("StatusLine", "bg", "121319")

-- The previous theme remains selectable, with no jade highlights left behind.
vim.cmd.colorscheme("woody")
assert(vim.g.colors_name == "woody")
color("Normal", "fg", "e8e0dc")
vim.cmd.colorscheme("osaka-jade")
color("Normal", "bg", "121319")
print("osaka-jade highlights and theme switching: ok")
