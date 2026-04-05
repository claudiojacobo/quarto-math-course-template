function Header(el)
  -- Look for an H1 that has your specific class
  if el.level == 1 and el.classes:includes("centered-title") then
    local text = pandoc.utils.stringify(el)
    
    -- Make sure it's actually a Homework file
    if string.find(text, "Homework") then
      -- Extract the first number found in the title text
      local hw_num = string.match(text, "%d+")
      
      if hw_num then
        -- Build the raw LaTeX block to inject.
        -- We check if the listing counters exist to prevent compilation errors
        -- on assignments that do not contain any code blocks.
        local latex_snippet = string.format([[
\pagestyle{plain}
\setcounter{page}{1}

\setcounter{exercise}{0}
\renewcommand{\theexercise}{%s.\arabic{exercise}}

\makeatletter
\@ifundefined{c@codelisting}{}{
  \setcounter{codelisting}{0}
  \renewcommand{\thecodelisting}{%s.\arabic{codelisting}}
}
\@ifundefined{c@lstlisting}{}{
  \setcounter{lstlisting}{0}
  \renewcommand{\thelstlisting}{%s.\arabic{lstlisting}}
}
\makeatother
]], hw_num, hw_num, hw_num)
        
        -- Return the original header, immediately followed by our auto-generated LaTeX
        return {el, pandoc.RawBlock('latex', latex_snippet)}
      end
    end
  end
end