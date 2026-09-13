-- Run from the repository root: nvim --headless -u NONE -l nvim/tests/osaka-jade.lua
vim.opt.runtimepath:prepend(vim.fn.getcwd() .. "/nvim")
vim.cmd.colorscheme("osaka-jade")

local function color(group, key, expected)
  local hl = vim.api.nvim_get_hl(0, { name = group, link = false })
  assert(hl[key] == tonumber(expected, 16), group .. "." .. key .. " differs from the palette")
end

local function terminal_backgrounds()
  for _, group in ipairs({ "Normal", "NormalNC", "SignColumn", "StatusLine", "StatusLineNC",
    "TabLine", "TabLineFill", "WinBar", "WinBarNC" }) do
    local hl = vim.api.nvim_get_hl(0, { name = group, link = false })
    assert(hl.bg == nil, group .. " must inherit the terminal background")
  end
end

assert(vim.g.colors_name == "osaka-jade")
terminal_backgrounds()
color("Normal", "fg", "D8DAD8")
color("String", "fg", "dedec5")
color("Number", "fg", "dedec5")
color("Visual", "fg", "ffffff")
color("VisualNOS", "fg", "ffffff")
color("PmenuSel", "fg", "ffffff")
color("WinSeparator", "fg", "326d65")
color("FloatBorder", "fg", "326d65")
color("Function", "fg", "439187")
color("@keyword", "fg", "439187")
color("Boolean", "fg", "439187")
color("DiagnosticInfo", "fg", "439187")
color("TabLineSel", "fg", "439187")
color("@function.method", "fg", "439187")
color("@lsp.type.method", "fg", "439187")
color("@lsp.type.function", "fg", "439187")
color("Title", "fg", "dedec5")
color("Identifier", "fg", "dedec5")
color("Constant", "fg", "dedec5")
color("StatusLine", "fg", "dedec5")
color("CursorLineNr", "fg", "439187")
color("GitSignsAdd", "fg", "439187")
color("NeoTreeGitDeleted", "fg", "c7837c")
color("DiagnosticWarn", "fg", "c7b777")
color("Visual", "bg", "439187")
color("TabLineSel", "bg", "181a20")
color("PmenuSel", "bg", "439187")
color("Search", "bg", "282c30")
color("Comment", "fg", "62656a")
color("NormalFloat", "bg", "181a20")
color("CursorLine", "bg", "181a20")
color("Cursor", "fg", "121319")

local terminal = table.concat(vim.fn.readfile("ghostty/themes/osaka-jade"), "\n")
assert(terminal:find("background = #121319", 1, true))
assert(terminal:find("selection-background = #439187", 1, true))
assert(terminal:find("selection-foreground = #ffffff", 1, true))
assert(terminal:find("palette = 6=#439187", 1, true))
assert(terminal:find("palette = 2=#439187", 1, true))

-- Pi uses the same syntax roles without bringing back green panel fills.
local pi = vim.json.decode(table.concat(vim.fn.readfile("pi/agent/themes/osaka-jade.json"), "\n"))
local function pi_color(token)
  return pi.vars[pi.colors[token]] or pi.colors[token]
end
assert(pi_color("syntaxKeyword") == "#439187")
assert(pi_color("accent") == "#439187")
assert(pi_color("borderAccent") == "#439187")
assert(pi_color("border") == "#439187")
assert(pi_color("borderMuted") == "#326d65")
assert(pi_color("mdCodeBlockBorder") == "#326d65")
assert(pi_color("mdQuoteBorder") == "#326d65")
assert(pi_color("mdHr") == "#326d65")
assert(pi_color("success") == "#439187")
assert(pi_color("toolDiffAdded") == "#439187")
assert(pi_color("syntaxFunction") == "#439187")
assert(pi_color("mdHeading") == "#dedec5")
assert(pi_color("syntaxVariable") == "#dedec5")
assert(pi_color("toolOutput") == "#dedec5")
assert(pi_color("text") == "#D8DAD8")
assert(pi_color("syntaxString") == "#dedec5")
assert(pi_color("syntaxNumber") == "#dedec5")
assert(pi_color("thinkingMedium") == "#439187")
for _, token in ipairs({ "toolPendingBg", "toolSuccessBg", "toolErrorBg", "customMessageBg" }) do
  assert(pi_color(token) == "", token .. " must inherit the terminal background")
end
assert(pi_color("userMessageBg") == "#181a20")

-- The previous theme remains selectable, with no jade highlights left behind.
vim.cmd.colorscheme("woody")
assert(vim.g.colors_name == "woody")
color("Normal", "fg", "e8e0dc")
vim.cmd.colorscheme("osaka-jade")
terminal_backgrounds()
print("osaka-jade highlights, shared terminal background and theme switching: ok")
