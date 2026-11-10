--[[
figure-links.lua — attach a cell's link output to the image before it.

Code can display an image and then a link marked `.figure-link`, e.g.
    [Explore in 3D ↗](3d/abc.html){.figure-link …}
either displayed as Markdown or printed on a line of its own. (Printing is
better: Quarto hands a cell's fig-cap and fig-alt lists out to displayed
outputs one each, in order, so a displayed link takes the next image's
caption. A printed line arrives as a text output, which this filter turns
back into a link first.) As two separate outputs, the link takes its own slot
in layout-ncol grids and wraps onto a new row. This filter merges it into the previous output that
contains an image, within the same cell:
  • a captioned image (a figure): the link is appended to the caption, in
    every format (Quarto rebuilds figures from the image alone, so a link
    wrapped around the image would be lost). On web pages, figure-links.html
    then moves it onto the image as the corner badge;
  • an uncaptioned image on web pages: the image itself becomes the link,
    with the link text as a small badge in its corner (styled in _cells.scss);
  • an uncaptioned image elsewhere (PDF): the image is left as it is and the
    link text goes in a paragraph after the cell. (A link around the image
    breaks LaTeX when Quarto centres it, \href{\begin{center}…}; and inside
    a side-by-side layout a paragraph of its own would become a new layout
    cell, under whichever column comes first.)
If the link can't be placed, it is left where it was rather than dropped.
The link keeps its classes and attributes, so site-links.lua (which must run
after this filter) still makes it absolute in PDF.
]]

local is_html = FORMAT:match("html") ~= nil or FORMAT:match("revealjs") ~= nil

local function walk(block, filter)       -- pandoc 3 method, or older function
  if block.walk then return block:walk(filter) end
  return pandoc.walk_block(block, filter)
end

-- The Link, if this block is an output holding nothing but a .figure-link.
local function lone_figure_link(block)
  if block.t ~= "Div" or #block.content ~= 1 then return nil end
  local para = block.content[1]
  if para.t ~= "Para" and para.t ~= "Plain" then return nil end
  local link
  for _, il in ipairs(para.content) do
    if il.t == "Link" and il.classes:includes("figure-link") and not link then
      link = il
    elseif il.t ~= "Space" and il.t ~= "SoftBreak" then
      return nil
    end
  end
  return link
end

-- A printed text output (.cell-output-stdout) in which some lines are
-- .figure-link links: those lines become link outputs, in order, and any
-- other lines stay text. Returns nil if there are none.
local function printed_links(block)
  if block.t ~= "Div" or not block.classes:includes("cell-output-stdout") then return nil end
  local code = block.content[1]
  if #block.content ~= 1 or code.t ~= "CodeBlock" then return nil end
  local out, text, found = pandoc.List(), pandoc.List(), false
  local function flush_text()
    if #text > 0 then
      out:insert(pandoc.Div({ pandoc.CodeBlock(table.concat(text, "\n"), code.attr) }, block.attr))
      text = pandoc.List()
    end
  end
  for line in (code.text .. "\n"):gmatch("(.-)\n") do
    local link
    if line:match("^%[.*%]%(.*%)%{.*figure%-link.*%}%s*$") then
      local para = pandoc.read(line, "markdown").blocks[1]
      if para and (para.t == "Para" or para.t == "Plain") and #para.content == 1
         and para.content[1].t == "Link" and para.content[1].classes:includes("figure-link") then
        link = para.content[1]
      end
    end
    if link then
      flush_text()
      out:insert(pandoc.Div({ pandoc.Para({ link }) }, pandoc.Attr("", { "cell-output", "cell-output-display" })))
      found = true
    elseif line ~= "" or #text > 0 then
      text:insert(line)
    end
  end
  flush_text()
  return found and out or nil
end

local function contains_image(block)
  local found = false
  walk(block, { Image = function(img) found = true; return nil end })
  return found
end

-- Returns the rewritten block, whether the link was placed, and (PDF) a
-- block to put after the cell.
local function attach(block, link)
  local function copy_link(content)
    return pandoc.Link(content, link.target, link.title, link.attr)
  end

  -- A captioned image is a Figure. Quarto re-renders figures from the image
  -- alone, so a link wrapped around the image would be dropped; the caption
  -- is kept, so the link goes there (in every format).
  local has_figure = false
  walk(block, { Figure = function(fig) has_figure = true; return nil end })
  if has_figure then
    local placed = false
    local wrapped = walk(block, { Figure = function(fig)
      if placed then return nil end
      local long = fig.caption.long
      if #long > 0 and (long[#long].t == "Plain" or long[#long].t == "Para") then
        if is_html then   -- figure-links.html turns this into the corner badge
          long[#long].content:extend({ pandoc.Space(), copy_link(link.content) })
        else
          long[#long].content:extend({ pandoc.Space(), pandoc.Str("("),
                                       copy_link(link.content), pandoc.Str(")") })
        end
      else
        long:insert(pandoc.Plain({ copy_link(link.content) }))
      end
      fig.caption.long = long
      placed = true
      return fig
    end })
    return wrapped, placed
  end

  -- An uncaptioned image elsewhere (PDF): image untouched, link after the cell.
  if not is_html then
    return block, true, pandoc.Para({ copy_link(link.content) })
  end

  -- An uncaptioned image on web pages: the image itself becomes the link,
  -- with the link text as a corner badge.
  local placed = false
  local wrapped = walk(block, { Image = function(img)
    if placed then return nil end
    placed = true
    return copy_link({ img, pandoc.Span(link.content, pandoc.Attr("", { "figure-link-badge" })) })
  end })
  return wrapped, placed
end

function Div(cell)
  if not cell.classes:includes("cell") then return nil end
  local out, after, changed = pandoc.List(), pandoc.List(), false
  local blocks = pandoc.List()
  for _, block in ipairs(cell.content) do
    local links = printed_links(block)
    if links then blocks:extend(links); changed = true else blocks:insert(block) end
  end
  for _, block in ipairs(blocks) do
    local link = lone_figure_link(block)
    if link then
      for i = #out, 1, -1 do
        if contains_image(out[i]) then
          local rewritten, placed, follow = attach(out[i], link)
          if placed then                    -- only drop the link once it has a new home
            out[i] = rewritten
            if follow then after:insert(follow) end
            link, changed = nil, true
          end
          break
        end
      end
      if link then out:insert(block) end   -- no image before it: leave as is
    else
      out:insert(block)
    end
  end
  if changed then
    cell.content = out
    if #after > 0 then return { cell, table.unpack(after) } end
    return cell
  end
end
