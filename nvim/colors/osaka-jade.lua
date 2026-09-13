-- Screenshot-led Osaka Jade: charcoal surfaces, white prose, jade structure.
-- Background/green/accent are sampled; whites and neutrals are chosen for clarity.
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
  selectionGreen = "#5fa876",
  white = "#ffffff",
  muted = "#85877e",
  dim = "#62656a",
  accent = "#5e9e80",
  bright = "#F2F3F0",
  cream = "#dedec5",
  text = "#D8DAD8",
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
hi("FloatBorder", { fg = c.accent, bg = c.panel })
hi("Cursor", { fg = c.bg, bg = c.bright })
hi("CursorLine", { bg = c.panel })
hi("CursorLineNr", { fg = c.green, bold = true })
hi("LineNr", { fg = c.dim })
hi("SignColumn", { bg = c.bg })
hi("EndOfBuffer", { fg = c.dim })
hi("NonText", { fg = c.dim })
hi("Whitespace", { fg = c.dim })
hi("WinSeparator", { fg = c.accent })
hi("StatusLine", { fg = c.cream, bg = c.bg })
hi("StatusLineNC", { fg = c.muted, bg = c.bg })
hi("TabLine", { fg = c.muted, bg = c.bg })
hi("TabLineSel", { fg = c.green, bg = c.panel, bold = true })
hi("TabLineFill", { bg = c.bg })
hi("WinBar", { fg = c.text, bg = c.bg })
hi("WinBarNC", { link = "WinBar" })
hi("Pmenu", { fg = c.text, bg = c.panel })
hi("PmenuSel", { fg = c.white, bg = c.selectionGreen })
hi("Visual", { fg = c.white, bg = c.selectionGreen })
hi("VisualNOS", { link = "Visual" })
hi("Search", { fg = c.bright, bg = c.selection, underline = true })
hi("IncSearch", { fg = c.bg, bg = c.bright })
hi("MatchParen", { fg = c.green, bold = true, underline = true })
hi("Directory", { fg = c.accent })
hi("Title", { fg = c.cream, bold = true })
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
hi("Statement", { fg = c.green, bold = true })
hi("Keyword", { link = "Statement" })
hi("PreProc", { fg = c.accent })
hi("Function", { fg = c.accent })
hi("Identifier", { fg = c.cream })
hi("String", { fg = c.cream })
hi("Character", { link = "String" })
hi("Number", { fg = c.cream })
hi("Float", { link = "Number" })
hi("Boolean", { fg = c.green })
hi("Type", { fg = c.accent })
hi("Operator", { fg = c.muted })
hi("Delimiter", { fg = c.text })
hi("Special", { fg = c.text })
hi("Constant", { fg = c.cream })
hi("Todo", { fg = c.green, bold = true })
hi("Error", { fg = c.red })
hi("Underlined", { fg = c.accent, underline = true })

-- Treesitter captures inherit the same roles as legacy syntax and pi.
local links = {
  ["@comment"] = "Comment",
  ["@keyword"] = "Keyword",
  ["@function"] = "Function",
  ["@function.builtin"] = "Function",
  -- clangd's method tokens link here; keep method calls in the function role.
  ["@function.method"] = "Function",
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
  SnacksDashboardDesc = "Directory",
  SnacksDashboardIcon = "Directory",
  SnacksDashboardKey = "Keyword",
  NeoTreeRootName = "Title",
  NeoTreeDirectoryName = "Directory",
  NeoTreeDirectoryIcon = "Directory",
}
for group, target in pairs(links) do
  hi(group, { link = target })
end

hi("DiagnosticError", { fg = c.red })
hi("DiagnosticWarn", { fg = c.yellow })
hi("DiagnosticInfo", { fg = c.accent })
hi("DiagnosticHint", { fg = c.green })
