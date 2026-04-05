function Pandoc(doc)
  local id_map = {} -- Stores cross-references globally

  -- PASS 1: Find any ::: {.exam} blocks and process them independently
  doc = doc:walk({
    Div = function(exam_el)
      
      if not exam_el.classes:includes('exam') then return nil end

      local q_num = 0
      local total_points = 0
      local questions = {}

      -- Walk the contents of this block
      exam_el.content = exam_el.content:walk({
        Div = function(el)
          if el.classes:includes('question') then
            q_num = q_num + 1
            local current_q = q_num
            local explicit_pts = tonumber(el.attributes['points'])
            local p_num = 0
            local parts_total = 0

            -- Map ID for cross-referencing
            if el.identifier ~= "" then
              id_map[el.identifier] = "Problem " .. current_q
            end

            local new_content = {}
            local current_parts = {}

            -- Loop through direct children to group .part Divs into a native OrderedList
            for _, sub_el in ipairs(el.content) do
              if sub_el.t == "Div" and sub_el.classes:includes('part') then
                p_num = p_num + 1
                local sub_pts = tonumber(sub_el.attributes['points']) or 0
                parts_total = parts_total + sub_pts

                -- Compute letter for internal cross-referencing map
                local letter_str = "(" .. string.char(96 + p_num) .. ")"
                
                if sub_el.identifier ~= "" then
                  id_map[sub_el.identifier] = "Problem " .. current_q .. letter_str
                end

                -- Build the formatting for the points (unbolded)
                local inlines = {}
                if sub_pts > 0 then
                  table.insert(inlines, pandoc.Str("(" .. sub_pts .. " points)"))
                  table.insert(inlines, pandoc.Space())
                end

                -- Inject the points prefix into the first paragraph of the part
                if #inlines > 0 then
                  if sub_el.content[1] and sub_el.content[1].t == "Para" then
                    for i = #inlines, 1, -1 do
                      table.insert(sub_el.content[1].content, 1, inlines[i])
                    end
                  else
                    table.insert(sub_el.content, 1, pandoc.Para(inlines))
                  end
                end
                
                -- Add this part to our running list of items. 
                -- Note: A list item in Pandoc is a list of blocks, so we wrap sub_el in a table.
                table.insert(current_parts, { sub_el })
              else
                -- If we hit a non-part block, flush any accumulated parts into an OrderedList
                if #current_parts > 0 then
                  table.insert(new_content, pandoc.OrderedList(current_parts, {1, 'LowerAlpha', 'TwoParens'}))
                  current_parts = {} 
                end
                -- Add the non-part block
                table.insert(new_content, sub_el)
              end
            end

            -- After the loop, flush any remaining parts at the end of the question
            if #current_parts > 0 then
              table.insert(new_content, pandoc.OrderedList(current_parts, {1, 'LowerAlpha', 'TwoParens'}))
            end

            el.content = new_content
            local final_q_pts = explicit_pts or parts_total
            table.insert(questions, {num = current_q, points = final_q_pts})
            total_points = total_points + final_q_pts

            -- Build the formatting for the main Question
            local q_inlines = { pandoc.Strong({pandoc.Str("Problem " .. current_q .. ".")}) }
            if final_q_pts > 0 then
              table.insert(q_inlines, pandoc.Space())
              table.insert(q_inlines, pandoc.Str("(" .. final_q_pts .. " points)"))
            end
            table.insert(q_inlines, pandoc.Space())

            -- Inject the prefix into the first paragraph of the question
            if el.content[1] and el.content[1].t == "Para" then
              for i = #q_inlines, 1, -1 do
                table.insert(el.content[1].content, 1, q_inlines[i])
              end
            else
              table.insert(el.content, 1, pandoc.Para(q_inlines))
            end

            return el
          end
        end
      })

      -- After processing questions, inject AST gradetable
      exam_el.content = exam_el.content:walk({
        Para = function(el)
          if #el.content == 1 and el.content[1].t == "Str" and el.content[1].text == "[GRADETABLE]" then
            
            local caption = {}
            local aligns = { pandoc.AlignCenter, pandoc.AlignCenter, pandoc.AlignCenter }
            local widths = { 0, 0, 0 }
            local headers = { 
                {pandoc.Plain({pandoc.Str("Problem")})}, 
                {pandoc.Plain({pandoc.Str("Points")})}, 
                {pandoc.Plain({pandoc.Str("Score")})} 
            }
            local rows = {}

            -- Populate the rows
            for _, q in ipairs(questions) do
              table.insert(rows, {
                {pandoc.Plain({pandoc.Strong({pandoc.Str(tostring(q.num))})})},
                {pandoc.Plain({pandoc.Str(tostring(q.points))})},
                {}
              })
            end

            -- Add the total row
            table.insert(rows, {
              {pandoc.Plain({pandoc.Strong({pandoc.Str("Total")})})},
              {pandoc.Plain({pandoc.Strong({pandoc.Str(tostring(total_points))})})},
              {}
            })

            -- Construct and return the native Pandoc Table AST node
            return pandoc.utils.from_simple_table(
              pandoc.SimpleTable(caption, aligns, widths, headers, rows)
            )
          end
        end
      })

      return exam_el
    end
  })

  -- PASS 2: Resolve @prb- cross-references anywhere in the document
  doc = doc:walk({
    Cite = function(el)
      if #el.citations == 1 then
        local cite_id = el.citations[1].id
        if id_map[cite_id] then
          return pandoc.Link({pandoc.Str(id_map[cite_id])}, "#" .. cite_id)
        end
      end
    end
  })

  return doc
end