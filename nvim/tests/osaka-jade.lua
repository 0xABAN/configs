-- Run from the repository root: nvim --headless -u NONE -l nvim/tests/osaka-jade.lua
vim.opt.runtimepath:prepend(vim.fn.getcwd() .. "/nvim")
vim.cmd.colorscheme("osaka-jade")

local function color(group, key, expected)
  local hl = vim.api.nvim_get_hl(0, { name = group, link = false })
  assert(hl[key] == tonumber(expected, 16), group .. "." .. key .. " differs from the palette")
end

assert(vim.g.colors_name == "osaka-jade")
color("Normal", "bg", "111c18")
color("Normal", "fg", "C1C497")
color("WinSeparator", "fg", "509475")
color("Function", "fg", "F7E8B2")
color("@keyword", "fg", "86c994")
color("GitSignsAdd", "fg", "86c994")
color("NeoTreeGitDeleted", "fg", "FF5345")
color("DiagnosticWarn", "fg", "e5c736")
color("Visual", "bg", "509475")

-- The previous theme remains selectable, with no jade highlights left behind.
vim.cmd.colorscheme("woody")
assert(vim.g.colors_name == "woody")
color("Normal", "fg", "e8e0dc")
vim.cmd.colorscheme("osaka-jade")
color("Normal", "bg", "111c18")
print("osaka-jade highlights and theme switching: ok")
