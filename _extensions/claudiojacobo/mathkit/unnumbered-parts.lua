--[[
unnumbered-parts.lua — book parts without a number in the PDF.

  unnumbered-parts: [Preliminaries]

in _quarto.yml makes the part "Preliminaries" a part page with no "Part I",
still listed in the table of contents and the PDF's bookmarks; the parts after
it are numbered I, II, … as if it weren't there. Web pages don't number parts.

It runs at: post-render (see _extension.yml), after Quarto has written each
part as \part{Title}.
]]

if not quarto.doc.is_format("latex") then return {} end

local names = {}

local function open(title_tex)
  return "\\cleardoublepage\\phantomsection\\addcontentsline{toc}{part}{" .. title_tex .. "}\n\\part*{"
end

-- Quarto writes a part as a paragraph: raw "\part{", the title, raw "}".
local function part_title(inlines)
  local first, last = inlines[1], inlines[#inlines]
  if #inlines >= 3 and first.t == "RawInline" and first.text:match("^%s*\\part{%s*$")
    and last.t == "RawInline" and last.text:match("^%s*}%s*$") then
    local title = pandoc.Inlines({})
    for i = 2, #inlines - 1 do title:insert(inlines[i]) end
    return title
  end
end

local function unnumbered(block)
  local title = part_title(block.content)
  if not (title and names[pandoc.utils.stringify(title)]) then return nil end
  local out = pandoc.Inlines({ pandoc.RawInline("latex", "\\cleardoublepage\\phantomsection\\addcontentsline{toc}{part}{") })
  out:extend(title)
  out:insert(pandoc.RawInline("latex", "}\n\\part*{"))
  out:extend(title:clone())
  out:insert(pandoc.RawInline("latex", "}"))
  block.content = out
  return block
end

return {
  {
    Meta = function(meta)
      local list = meta["unnumbered-parts"]
      if list == nil then return nil end
      if pandoc.utils.type(list) ~= "List" then list = { list } end
      for _, item in ipairs(list) do names[pandoc.utils.stringify(item)] = true end
    end,
  },
  {
    Para = unnumbered,
    Plain = unnumbered,
    -- or, written as raw LaTeX: \part{Title}
    RawBlock = function(raw)
      if not raw.format:match("^la?tex$") then return nil end
      local text, n = raw.text:gsub("\\part{([^{}]*)}", function(title)
        if names[title] then return open(title) .. title .. "}" end
      end)
      if n > 0 and text ~= raw.text then return pandoc.RawBlock(raw.format, text) end
    end,
  },
}
