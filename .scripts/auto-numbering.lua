--- Process an H1 header with class 'centered-title' to inject LaTeX homework counters.
-- Extracts a homework number from the header text, then injects LaTeX code that resets and renumbers exercise, codelisting, and lstlisting counters using that number.
-- @param el (table) A Pandoc header element (level, classes, content, ...)
-- @return (table|nil) A list containing the original header and a RawBlock with LaTeX code, or nil if the header does not match the criteria.

function Header(el)
  -- Look for an H1 that has your specific class
  if el.level == 1 and el.classes:includes("centered-title") then
    local text = pandoc.utils.stringify(el)
    
    -- Make sure it's actually a Homework file
    if string.find(text, "Homework") then
      -- Extract the identifier (letter or number) immediately following "Homework "
      local hw_id = string.match(text, "Homework%s+(%w+)")
      
      if hw_id then
        -- Build the raw LaTeX block to inject.
        -- We use @ifundefined checks across the board so this template can be safely reused in courses that do not use custom exercise environments or code blocks.
        local latex_snippet = string.format([[
\pagestyle{plain}
\setcounter{page}{1}

\makeatletter
\@ifundefined{c@exercise}{}{
  \setcounter{exercise}{0}
  \renewcommand{\theexercise}{%s.\arabic{exercise}}
  \renewcommand{\theHexercise}{%s.\arabic{exercise}}
}
\@ifundefined{c@codelisting}{}{
  \setcounter{codelisting}{0}
  \renewcommand{\thecodelisting}{%s.\arabic{codelisting}}
  \renewcommand{\theHcodelisting}{%s.\arabic{codelisting}}
}
\@ifundefined{c@lstlisting}{}{
  \setcounter{lstlisting}{0}
  \renewcommand{\thelstlisting}{%s.\arabic{lstlisting}}
  \renewcommand{\theHstlisting}{%s.\arabic{lstlisting}}
}
\makeatother
]], hw_id, hw_id, hw_id, hw_id, hw_id, hw_id)
        
        -- Return the original header, immediately followed by our auto-generated LaTeX
        return {el, pandoc.RawBlock('latex', latex_snippet)}
      end
    end
  end
end