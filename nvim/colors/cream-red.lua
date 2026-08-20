-- Pi "cream-red" syntax palette → nvim highlights.
-- Source: ~/.pi/agent/themes/cream-red.json
-- Background left NONE so Ghostty/cmux opacity shows through.

vim.cmd("highlight clear")
if vim.fn.exists("syntax_on") == 1 then
  vim.cmd("syntax reset")
end

vim.g.colors_name = "cream-red"
vim.o.termguicolors = true
vim.o.background = "dark"

local c = {
  cream = "#ffffff",
  gray = "#a8a8a8",
  dim = "#6e6e6e",
  dark = "#4a4a4a",
  red = "#a22c29",
  redLight = "#c45a56",
  text = "#e8e0dc",
  select = "#242424",
}

local function hi(group, opts)
  vim.api.nvim_set_hl(0, group, opts)
end

-- UI
hi("Normal", { fg = c.text, bg = "NONE" })
hi("NormalNC", { fg = c.text, bg = "NONE" })
hi("NormalFloat", { fg = c.text, bg = "NONE" })
hi("FloatBorder", { fg = c.dim, bg = "NONE" })
hi("EndOfBuffer", { fg = c.dark, bg = "NONE" })
hi("LineNr", { fg = c.dark, bg = "NONE" })
hi("CursorLineNr", { fg = c.gray, bg = "NONE", bold = true })
hi("SignColumn", { bg = "NONE" })
hi("VertSplit", { fg = c.dark, bg = "NONE" })
hi("WinSeparator", { fg = c.dark, bg = "NONE" })
hi("StatusLine", { fg = c.text, bg = "NONE" })
hi("StatusLineNC", { fg = c.dim, bg = "NONE" })
hi("Pmenu", { fg = c.text, bg = c.select })
hi("PmenuSel", { fg = c.cream, bg = c.dark })
hi("Visual", { bg = c.select })
hi("Search", { fg = c.cream, bg = c.red })
hi("IncSearch", { fg = c.cream, bg = c.redLight })
hi("MatchParen", { fg = c.cream, bold = true })
hi("NonText", { fg = c.dark })
hi("Whitespace", { fg = c.dark })
hi("Directory", { fg = c.gray })
hi("Title", { fg = c.cream, bold = true })
hi("ErrorMsg", { fg = c.redLight })
hi("WarningMsg", { fg = c.gray })
hi("Question", { fg = c.gray })
hi("ModeMsg", { fg = c.gray })
hi("MoreMsg", { fg = c.gray })
hi("CursorLine", { bg = c.select })
hi("ColorColumn", { bg = c.select })
hi("Folded", { fg = c.dim, bg = "NONE" })
hi("FoldColumn", { fg = c.dark, bg = "NONE" })

-- Diff (pi toolDiff*)
hi("DiffAdd", { fg = c.gray })
hi("DiffDelete", { fg = c.red })
hi("DiffChange", { fg = c.gray })
hi("DiffText", { fg = c.cream, bold = true })

-- Legacy syntax ← pi syntax* tokens
hi("Comment", { fg = c.dim, italic = true }) -- syntaxComment
hi("Keyword", { fg = c.redLight }) -- syntaxKeyword
hi("Statement", { fg = c.redLight })
hi("Conditional", { fg = c.redLight })
hi("Repeat", { fg = c.redLight })
hi("Label", { fg = c.redLight })
hi("Exception", { fg = c.redLight })
hi("PreProc", { fg = c.redLight })
hi("Include", { fg = c.redLight })
hi("Define", { fg = c.redLight })
hi("Macro", { fg = c.redLight })
hi("Function", { fg = c.cream }) -- syntaxFunction
hi("Identifier", { fg = c.cream }) -- syntaxVariable
hi("String", { fg = c.gray }) -- syntaxString
hi("Character", { fg = c.gray })
hi("Number", { fg = c.cream }) -- syntaxNumber
hi("Float", { fg = c.cream })
hi("Boolean", { fg = c.redLight })
hi("Type", { fg = c.cream }) -- syntaxType
hi("StorageClass", { fg = c.redLight })
hi("Structure", { fg = c.cream })
hi("Typedef", { fg = c.cream })
hi("Operator", { fg = c.gray }) -- syntaxOperator
hi("Delimiter", { fg = c.gray }) -- syntaxPunctuation
hi("Special", { fg = c.gray })
hi("SpecialChar", { fg = c.gray })
hi("Constant", { fg = c.cream })
hi("Todo", { fg = c.redLight, bold = true })
hi("Error", { fg = c.redLight })
hi("Underlined", { fg = c.gray, underline = true })

-- Treesitter (if enabled later)
hi("@comment", { link = "Comment" })
hi("@keyword", { link = "Keyword" })
hi("@keyword.function", { link = "Keyword" })
hi("@keyword.return", { link = "Keyword" })
hi("@function", { link = "Function" })
hi("@function.builtin", { link = "Function" })
hi("@function.call", { link = "Function" })
hi("@method", { link = "Function" })
hi("@method.call", { link = "Function" })
hi("@variable", { link = "Identifier" })
hi("@variable.parameter", { link = "Identifier" })
hi("@variable.builtin", { fg = c.gray })
hi("@string", { link = "String" })
hi("@number", { link = "Number" })
hi("@boolean", { link = "Boolean" })
hi("@type", { link = "Type" })
hi("@type.builtin", { link = "Type" })
hi("@operator", { link = "Operator" })
hi("@punctuation", { link = "Delimiter" })
hi("@punctuation.bracket", { link = "Delimiter" })
hi("@punctuation.delimiter", { link = "Delimiter" })
hi("@constant", { link = "Constant" })
hi("@property", { fg = c.cream })
hi("@field", { fg = c.cream })
hi("@namespace", { fg = c.cream })
hi("@module", { fg = c.cream })
hi("@include", { link = "Include" })
hi("@preproc", { link = "PreProc" })
