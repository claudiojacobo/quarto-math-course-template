-- blocks.lua
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

  -- We found a container! Let's extract the header and separate the content.
  local title = ""
  local new_content = {}
  
  for _, child in ipairs(el.content) do
    if child.t == "Div" and child.classes:includes("block-header") then
      title = pandoc.utils.stringify(child) -- Grabs the text from the header div
    else
      table.insert(new_content, child)
    end
  end

  -- Wrap the remaining content in raw LaTeX environment tags
  table.insert(new_content, 1, pandoc.RawBlock('latex', '\\begin{' .. block_type .. '}{' .. title .. '}'))
  table.insert(new_content, pandoc.RawBlock('latex', '\\end{' .. block_type .. '}'))
  
  return pandoc.Div(new_content)
end