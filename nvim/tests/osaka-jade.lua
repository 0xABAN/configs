-- Run from the repository root: nvim --headless -u NONE -l nvim/tests/osaka-jade.lua
vim.opt.runtimepath:prepend(vim.fn.getcwd() .. "/nvim")
vim.cmd.colorscheme("osaka-jade")

local function color(group, key, expected)
  local hl = vim.api.nvim_get_hl(0, { name = group, link = false })
  assert(hl[key] == tonumber(expected, 16), group .. "." .. key .. " differs from the palette")
end

assert(vim.g.colors_name == "osaka-jade")
color("Normal", "bg", "121319")
color("Normal", "fg", "D8DAD8")
color("String", "fg", "dedec5")
color("Number", "fg", "dedec5")
color("Visual", "fg", "ffffff")
color("VisualNOS", "fg", "ffffff")
color("PmenuSel", "fg", "ffffff")
color("WinSeparator", "fg", "5e9e80")
color("Function", "fg", "5e9e80")
color("@keyword", "fg", "5fa876")
color("@function.method", "fg", "5e9e80")
color("@lsp.type.method", "fg", "5e9e80")
color("@lsp.type.function", "fg", "5e9e80")
color("Title", "fg", "dedec5")
color("Identifier", "fg", "dedec5")
color("Constant", "fg", "dedec5")
color("StatusLine", "fg", "dedec5")
color("CursorLineNr", "fg", "5fa876")
color("GitSignsAdd", "fg", "5fa876")
color("NeoTreeGitDeleted", "fg", "c7837c")
color("DiagnosticWarn", "fg", "c7b777")
color("Visual", "bg", "5fa876")
color("TabLineSel", "bg", "181a20")
color("PmenuSel", "bg", "5fa876")
color("Search", "bg", "282c30")
color("Comment", "fg", "62656a")
color("StatusLine", "bg", "121319")

local terminal = table.concat(vim.fn.readfile("ghostty/themes/osaka-jade"), "\n")
assert(terminal:find("selection-background = #5fa876", 1, true))
assert(terminal:find("selection-foreground = #ffffff", 1, true))

-- Pi uses the same syntax roles without bringing back green panel fills.
local pi = vim.json.decode(table.concat(vim.fn.readfile("pi/agent/themes/osaka-jade.json"), "\n"))
local function pi_color(token)
  return pi.vars[pi.colors[token]] or pi.colors[token]
end
assert(pi_color("syntaxKeyword") == "#5fa876")
assert(pi_color("syntaxFunction") == "#5e9e80")
assert(pi_color("mdHeading") == "#dedec5")
assert(pi_color("syntaxVariable") == "#dedec5")
assert(pi_color("toolOutput") == "#dedec5")
assert(pi_color("text") == "#D8DAD8")
assert(pi_color("syntaxString") == "#dedec5")
assert(pi_color("syntaxNumber") == "#dedec5")
assert(pi_color("thinkingMedium") == "#5e9e80")
for _, token in ipairs({ "toolPendingBg", "toolSuccessBg", "toolErrorBg", "customMessageBg" }) do
  assert(pi_color(token) == "#121319", token .. " must stay charcoal")
end
assert(pi_color("userMessageBg") == "#181a20")

-- The previous theme remains selectable, with no jade highlights left behind.
vim.cmd.colorscheme("woody")
assert(vim.g.colors_name == "woody")
color("Normal", "fg", "e8e0dc")
vim.cmd.colorscheme("osaka-jade")
color("Normal", "bg", "121319")
print("osaka-jade highlights and theme switching: ok")
