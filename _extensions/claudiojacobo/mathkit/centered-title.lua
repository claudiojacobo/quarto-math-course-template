--- Process an H1 header with class 'centered-title' to apply centering and page control.
--    - For LaTeX output, it forces a new page, adds a phantom section for hyperlinks, inserts an entry into the table of contents (as a chapter), and renders the title as centered, bold, large text.
-- @param el (table) A Pandoc header element (level, classes, content, ...)
-- @return (table|nil) The modified header element (HTML) or a RawBlock (LaTeX), or nil if the header does not match the criteria.

function Header(el)
  if el.level == 1 and el.classes:includes('centered-title') then
    
    -- Force a new page, strip the chapter command, center it, and fix the TOC
    if FORMAT:match('latex') then
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