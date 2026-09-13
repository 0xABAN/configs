-- Screenshot-led Osaka Jade: charcoal surfaces, cream text, sparse jade accents.
-- Background/text/green/accent are sampled; supporting neutrals separate UI states.
vim.cmd("highlight clear")
if vim.fn.exists("syntax_on") == 1 then
  vim.cmd("syntax reset")
end

vim.g.colors_name = "osaka-jade"
vim.o.termguicolors = true
vim.o.background = "dark"

local c = {
  bg = "#121319",
  panel = "#181a20",
  selection = "#282c30",
  muted = "#85877e",
  dim = "#62656a",
  accent = "#5e9e80",
  bright = "#dedec5",
  text = "#c7c9a2",
  green = "#5fa876",
  yellow = "#c7b777",
  red = "#c7837c",
}

local function hi(group, opts)
  vim.api.nvim_set_hl(0, group, opts)
end

hi("Normal", { fg = c.text, bg = c.bg })
hi("NormalNC", { link = "Normal" })
hi("NormalFloat", { fg = c.text, bg = c.panel })
hi("FloatBorder", { fg = c.selection, bg = c.panel })
hi("Cursor", { fg = c.bg, bg = c.bright })
hi("CursorLine", { bg = c.panel })
hi("CursorLineNr", { fg = c.bright, bold = true })
hi("LineNr", { fg = c.dim })
hi("SignColumn", { bg = c.bg })
hi("EndOfBuffer", { fg = c.dim })
hi("NonText", { fg = c.dim })
hi("Whitespace", { fg = c.dim })
hi("WinSeparator", { fg = c.selection })
hi("StatusLine", { fg = c.text, bg = c.bg })
hi("StatusLineNC", { fg = c.muted, bg = c.bg })
hi("TabLine", { fg = c.muted, bg = c.bg })
hi("TabLineSel", { fg = c.green, bg = c.panel, bold = true })
hi("TabLineFill", { bg = c.bg })
hi("WinBar", { fg = c.text, bg = c.bg })
hi("WinBarNC", { link = "WinBar" })
hi("Pmenu", { fg = c.text, bg = c.panel })
hi("PmenuSel", { fg = c.green, bg = c.selection })
hi("Visual", { fg = c.bright, bg = c.selection })
hi("Search", { fg = c.bright, bg = c.selection, underline = true })
hi("IncSearch", { fg = c.bg, bg = c.bright })
hi("MatchParen", { fg = c.bright, bold = true, underline = true })
hi("Directory", { fg = c.accent })
hi("Title", { fg = c.bright, bold = true })
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
hi("DiffText", { fg = c.bright, bg = c.selection, bold = true })
hi("Added", { fg = c.green })
hi("Removed", { fg = c.red })
hi("Changed", { fg = c.yellow })

hi("Comment", { fg = c.dim, italic = true })
hi("Statement", { fg = c.text, bold = true })
hi("Keyword", { link = "Statement" })
hi("PreProc", { fg = c.text })
hi("Function", { fg = c.bright })
hi("Identifier", { fg = c.text })
hi("String", { fg = c.bright })
hi("Character", { link = "String" })
hi("Number", { fg = c.text })
hi("Float", { link = "Number" })
hi("Boolean", { fg = c.text })
hi("Type", { fg = c.accent })
hi("Operator", { fg = c.muted })
hi("Delimiter", { fg = c.text })
hi("Special", { fg = c.text })
hi("Constant", { fg = c.text })
hi("Todo", { fg = c.green, bold = true })
hi("Error", { fg = c.red })
hi("Underlined", { fg = c.accent, underline = true })

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
hi("DiagnosticInfo", { fg = c.accent })
hi("DiagnosticHint", { fg = c.green })
