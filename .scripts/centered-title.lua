function Header(el)
  if el.level == 1 and el.classes:includes('centered-title') then
    
    -- Add CSS centering
    if FORMAT:match('html') then
      el.attributes['style'] = 'text-align: center;'
      return el
      
    -- Force a new page, strip the chapter command, center it, and fix the TOC
    elseif FORMAT:match('latex') then
      local title_text = pandoc.utils.stringify(el)
      local tex = "\\clearpage\n" ..
                  "\\phantomsection\n" ..
                  "\\addcontentsline{toc}{chapter}{" .. title_text .. "}\n" ..
                  "\\begin{center}\\huge\\bfseries " .. title_text .. "\\end{center}\n" ..
                  "\\vspace{1em}"
      return pandoc.RawBlock('tex', tex)
    end
    
  end
end