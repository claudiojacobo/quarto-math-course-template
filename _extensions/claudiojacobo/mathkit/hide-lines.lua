--[[
hide-lines.lua — code lines ending in "#hide" run, but are not shown.

    view3d(camera_position=(4, 3, 2.5))   #hide
    show(surface)

The kernel executes the whole cell ("#hide" is just a comment there). After execution, this filter removes the marked lines from the code displayed on the page, so they also never reach the copy button or the PDF. A cell whose every line is hidden shows no code at all.
Rule of thumb: hide only lines that change presentation (camera, figure size, random seed, display mode), never the mathematics, so code a reader copies behaves like what the page shows.
Applies to executed cells only (code blocks with class "cell-code").
]]

local MARKER = "%s*#hide%s*$"

function CodeBlock(el)
  if not el.classes:includes("cell-code") then return nil end
  local kept, removed = {}, 0
  for line in (el.text .. "\n"):gmatch("([^\n]*)\n") do
    if line:match(MARKER) then
      removed = removed + 1
    else
      kept[#kept + 1] = line
    end
  end
  if removed == 0 then return nil end
  local text = table.concat(kept, "\n")
  if not text:match("%S") then return {} end
  el.text = text
  return el
end
