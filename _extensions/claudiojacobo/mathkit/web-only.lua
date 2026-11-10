--[[
web-only.lua — chapters that exist only on the website.

A book renders only its chapters, so a web-only page (the concept map) has to
be one. Mark its title `# Title {.unnumbered .web-only}`; in every format
other than HTML, this filter removes that heading and everything after it, up
to the next chapter or part, so the PDF has no trace of it.

It runs at: post-render (see _extension.yml), after Quarto has numbered the
chapters and resolved cross-references. Before that, each chapter file still
begins with a hidden marker that tells Quarto which file (and so which chapter
number) the content belongs to, and the marker for the chapter after this one
sits just before that chapter's title: removing it along with the web-only
chapter would leave the next chapter unnumbered and its @sec- label
unresolved. Raw blocks (markers, \part) are kept, so that can't happen even
if the filter ran earlier.
]]

if quarto.doc.is_format("html") then return {} end

local function web_only(b)
  return b.t == "Header" and b.level == 1 and b.classes:includes("web-only")
end

-- Quarto writes a book part as raw LaTeX (\part{Groups}) before its first chapter.
local function starts_part(b)
  return b.t == "RawBlock" and b.text:match("\\part[%*{%[]") ~= nil
end

return {
  {
    Blocks = function(blocks)
      local out, skipping = pandoc.Blocks({}), false
      for _, b in ipairs(blocks) do
        if b.t == "Header" and b.level == 1 then
          skipping = web_only(b)
        elseif skipping and starts_part(b) then
          skipping = false
        end
        if not skipping or b.t == "RawBlock" then out:insert(b) end
      end
      return out
    end,
  },
}
