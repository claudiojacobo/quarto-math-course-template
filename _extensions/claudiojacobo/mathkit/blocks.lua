-- blocks.lua
-- PDF only: turns `::: {.block-note}` divs (any `block-*` class except
-- block-header) into \begin{block-note}{Title} ... \end{block-note}, the
-- tcolorbox environments in blocks.tex. The title is the content of an inner
-- `::: {.block-header}` div, kept as formatted text so that math, emphasis and
-- citations in it are typeset normally (pandoc.utils.stringify would hand
-- LaTeX raw TeX outside math mode, e.g. `\int`, and fail).
function Div(el)
  -- If we are NOT rendering to PDF/LaTeX, ignore this entirely!
  if not FORMAT:match 'latex' and not FORMAT:match 'pdf' then
    return nil
  end
  -- Hunt for any class that starts with 'block-' EXCEPT 'block-header'
  local block_type = nil
  for _, class in ipairs(el.classes) do
    if class:match("^block%-") and class ~= "block-header" then
      block_type = class
      break
    end
  end
  -- If it's not one of our container blocks, leave it alone.
  if not block_type then return nil end
  -- Separate the header (if any) from the content.
  local title = pandoc.Inlines({})
  local new_content = pandoc.Blocks({})
  for _, child in ipairs(el.content) do
    if child.t == "Div" and child.classes:includes("block-header") then
      title = pandoc.utils.blocks_to_inlines(child.content)
    else
      new_content:insert(child)
    end
  end
  -- \begin{block-x}{<title>} as a paragraph, so the title stays formatted text
  local opening = pandoc.Inlines({ pandoc.RawInline('latex', '\\begin{' .. block_type .. '}{') })
  opening:extend(title)
  opening:insert(pandoc.RawInline('latex', '}'))
  new_content:insert(1, pandoc.Plain(opening))
  new_content:insert(pandoc.RawBlock('latex', '\\end{' .. block_type .. '}'))
  return pandoc.Div(new_content)
end
