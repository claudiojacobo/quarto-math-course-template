--[[
chapter-zero.lua — a book chapter numbered 0, before chapter 1.

Quarto numbers a book's chapters from 1 and has no setting to start at 0, so
chapter 0 is a chapter Quarto doesn't number, marked as the zeroth:

  # Binary Operations {#sec-binary-operations .unnumbered .chapter-zero}

The chapters after it are numbered 1, 2, … as usual. This filter puts the 0
back where Quarto left it out:
  • in the PDF, the heading becomes a real chapter 0 (in the table of
    contents too), so LaTeX numbers its items 0.1, 0.2, …;
  • on the chapter's web page, its title reads "0 Binary Operations" and its
    theorems, definitions, examples, … "Definition 0.1", "Proposition 0.2".
References to the chapter and its items are chapter-zero-refs.lua's job. The
sidebar and the previous/next links show the title without the 0 (Quarto
writes them after every filter has run). Sections within the chapter aren't
numbered on the web page.

It runs at: post-render (see _extension.yml), after Quarto has numbered things.
]]

if quarto.doc.is_format("latex") then
  return {
    {
      Header = function(h)
        if h.level == 1 and h.classes:includes("chapter-zero") then
          h.classes = h.classes:filter(function(c) return c ~= "unnumbered" end)
          return { pandoc.RawBlock("latex", "\\setcounter{chapter}{-1}"), h }
        end
      end,
    },
  }
end

if not quarto.doc.is_format("html") then return {} end

-- Web pages: is this the chapter's page? (Its heading is the page title by
-- now, without the class, so the source says.)
local function is_chapter_zero()
  local f = io.open(quarto.doc.input_file, "r")
  if not f then return false end
  local text = f:read("a")
  f:close()
  if not text:find("chapter-zero", 1, true) then return false end
  for _, b in ipairs(pandoc.read(text, "markdown").blocks) do
    if b.t == "Header" and b.level == 1 then return b.classes:includes("chapter-zero") end
  end
  return false
end
if not is_chapter_zero() then return {} end

local NBSP = "\u{00A0}"

-- "Definition 1 (Binary operation)" -> "Definition 0.1 (Binary operation)":
-- the first number in the title is the item's.
local function zero(inlines)
  local done = false
  return inlines:walk({
    Str = function(s)
      if done then return nil end
      local before, digits, after = s.text:match("^(.-)(%d+)(.*)$")
      if digits then
        done = true
        return pandoc.Str(before .. "0." .. digits .. after)
      end
    end,
  })
end

return {
  {
    -- the title, as Quarto writes a numbered chapter's: "0  Binary Operations"
    Meta = function(meta)
      local title = meta.title
      if not title or pandoc.utils.stringify(title) == "" then return nil end
      local function numbered(inlines)
        return pandoc.Inlines({
          pandoc.Span({ pandoc.Str("0") }, pandoc.Attr("", { "chapter-number" })),
          pandoc.Str(NBSP), pandoc.Space(),
          pandoc.Span(inlines, pandoc.Attr("", { "chapter-title" })),
        })
      end
      local inlines = pandoc.Inlines(title)
      if #inlines == 1 and inlines[1].t == "Span" and inlines[1].classes:includes("quarto-section-identifier") then
        inlines[1].content = numbered(inlines[1].content)
      else
        inlines = numbered(inlines)
      end
      meta.title = inlines
      return meta
    end,
  },
  {
    Span = function(span)
      if span.classes:includes("theorem-title") then
        span.content = zero(span.content)
        return span
      end
    end,
  },
}
