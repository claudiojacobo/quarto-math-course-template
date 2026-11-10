--[[
uses.lua — dependency declarations for the concept map.

Inside a definition, theorem, example, … list what it depends on as
cross-references, on a line of their own:

    ::: {#prp-inverse-unique}
    #### Inverses are unique
    [@def-associative @def-inverse]{.uses}
    Let $\star$ be an associative binary operation …
    :::

Writing them as @-references gets VS Code's autocomplete, and Quarto warns
about any that don't exist. This filter runs after Quarto has resolved (and
checked) them (at: post-render, in _extension.yml), and removes the line from
the web page and the PDF. The concept map (concept-map.lua) reads the same
lines.
]]

function Span(el)
  if el.classes:includes("uses") then
    return {}
  end
end

-- A paragraph that held only the declaration is now empty: drop it.
local function blank(inlines)
  for _, il in ipairs(inlines) do
    if il.t ~= "Space" and il.t ~= "SoftBreak" and il.t ~= "LineBreak" then
      return false
    end
  end
  return true
end

function Para(el)
  if blank(el.content) then return {} end
end

function Plain(el)
  if blank(el.content) then return {} end
end
