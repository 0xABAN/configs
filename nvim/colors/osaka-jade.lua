-- CLIAMP Osaka Jade: jade accents and cream text, matching pi's token roles.
-- https://github.com/bjarneo/cliamp/blob/main/theme/themes/osaka-jade.toml
-- Panel/dim/teal/cyan come from the original Osaka Jade terminal palette.
vim.cmd("highlight clear")
if vim.fn.exists("syntax_on") == 1 then
  vim.cmd("syntax reset")
end

vim.g.colors_name = "osaka-jade"
vim.o.termguicolors = true
vim.o.background = "dark"

local c = {
  bg = "#111c18",
  panel = "#23372B",
  dim = "#53685B",
  accent = "#509475",
  bright = "#F7E8B2",
  text = "#C1C497",
  green = "#86c994",
  yellow = "#e5c736",
  red = "#FF5345",
  teal = "#75bbb3",
  cyan = "#ACD4CF",
}

local function hi(group, opts)
  vim.api.nvim_set_hl(0, group, opts)
end

hi("Normal", { fg = c.text, bg = c.bg })
hi("NormalNC", { link = "Normal" })
hi("NormalFloat", { fg = c.text, bg = c.panel })
hi("FloatBorder", { fg = c.accent, bg = c.panel })
hi("Cursor", { fg = c.bg, bg = c.bright })
hi("CursorLine", { bg = c.panel })
hi("CursorLineNr", { fg = c.bright, bold = true })
hi("LineNr", { fg = c.dim })
hi("SignColumn", { bg = c.bg })
hi("EndOfBuffer", { fg = c.dim })
hi("NonText", { fg = c.dim })
hi("Whitespace", { fg = c.dim })
hi("WinSeparator", { fg = c.accent })
hi("StatusLine", { fg = c.bright, bg = c.panel })
hi("StatusLineNC", { fg = c.accent, bg = c.bg })
hi("TabLine", { fg = c.text, bg = c.panel })
hi("TabLineSel", { fg = c.bright, bg = c.accent, bold = true })
hi("TabLineFill", { bg = c.bg })
hi("WinBar", { fg = c.text, bg = c.bg })
hi("WinBarNC", { link = "WinBar" })
hi("Pmenu", { fg = c.text, bg = c.panel })
hi("PmenuSel", { fg = c.bright, bg = c.accent })
hi("Visual", { fg = c.bright, bg = c.accent })
hi("Search", { fg = c.bg, bg = c.green })
hi("IncSearch", { fg = c.bg, bg = c.bright })
hi("MatchParen", { fg = c.bright, bold = true, underline = true })
hi("Directory", { fg = c.accent })
hi("Title", { fg = c.green, bold = true })
hi("ErrorMsg", { fg = c.red })
hi("WarningMsg", { fg = c.yellow })
hi("Question", { fg = c.green })
hi("ModeMsg", { fg = c.accent })
hi("MoreMsg", { fg = c.accent })
hi("ColorColumn", { bg = c.panel })
hi("Folded", { fg = c.accent, bg = c.panel })
hi("FoldColumn", { fg = c.dim })

hi("DiffAdd", { fg = c.green, bg = c.panel })
hi("DiffDelete", { fg = c.red, bg = c.panel })
hi("DiffChange", { bg = c.panel })
hi("DiffText", { fg = c.bright, bg = c.accent, bold = true })
hi("Added", { fg = c.green })
hi("Removed", { fg = c.red })
hi("Changed", { fg = c.yellow })

hi("Comment", { fg = c.dim, italic = true })
hi("Statement", { fg = c.green })
hi("Keyword", { link = "Statement" })
hi("PreProc", { fg = c.green })
hi("Function", { fg = c.bright })
hi("Identifier", { fg = c.text })
hi("String", { fg = c.bright })
hi("Character", { link = "String" })
hi("Number", { fg = c.teal })
hi("Float", { link = "Number" })
hi("Boolean", { fg = c.green })
hi("Type", { fg = c.cyan })
hi("Operator", { fg = c.accent })
hi("Delimiter", { fg = c.text })
hi("Special", { fg = c.teal })
hi("Constant", { fg = c.teal })
hi("Todo", { fg = c.green, bold = true })
hi("Error", { fg = c.red })
hi("Underlined", { fg = c.teal, underline = true })

-- Treesitter captures inherit the same roles as legacy syntax and pi.
local links = {
  ["@comment"] = "Comment",
  ["@keyword"] = "Keyword",
  ["@function"] = "Function",
  ["@function.builtin"] = "Function",
  ["@variable"] = "Identifier",
  ["@variable.builtin"] = "Identifier",
  ["@string"] = "String",
  ["@number"] = "Number",
  ["@boolean"] = "Boolean",
  ["@type"] = "Type",
  ["@type.builtin"] = "Type",
  ["@operator"] = "Operator",
  ["@punctuation"] = "Delimiter",
  ["@constant"] = "Constant",
  ["@property"] = "Identifier",
  ["@module"] = "Identifier",
  ["@markup.heading"] = "Title",
  ["@markup.link"] = "Underlined",
  NeoTreeGitAdded = "Added",
  NeoTreeGitUntracked = "Added",
  NeoTreeGitModified = "Changed",
  NeoTreeGitDeleted = "Removed",
  GitSignsAdd = "Added",
  GitSignsChange = "Changed",
  GitSignsDelete = "Removed",
}
for group, target in pairs(links) do
  hi(group, { link = target })
end

hi("DiagnosticError", { fg = c.red })
hi("DiagnosticWarn", { fg = c.yellow })
hi("DiagnosticInfo", { fg = c.teal })
hi("DiagnosticHint", { fg = c.green })
