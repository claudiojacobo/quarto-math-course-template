--[[
chapter-zero-refs.lua — references to a book's chapter 0 (see chapter-zero.lua).

Quarto numbers chapters from 1, so chapter 0 is an unnumbered chapter
(`# Title {#sec-… .unnumbered .chapter-zero}`), and Quarto numbers what's in
an unnumbered chapter without a chapter: on web pages a reference reads
"Proposition 2", not "Proposition 0.2", and a reference to the chapter itself
doesn't resolve at all (?@sec-…). This filter writes those references itself,
before Quarto sees them:
  • on web pages, every reference to the chapter or to a theorem, definition,
    example, … in it: a link reading "Proposition 0.2" or "Chapter 0" (just
    the number for -@…; [Prop. @…] keeps its own prefix);
  • in the PDF, references to the chapter itself (Chapter~\ref{…}, which reads
    0 because chapter-zero.lua makes it a real chapter 0). LaTeX numbers the
    chapter's items 0.1, 0.2, … on its own.
Numbers are counted from the chapter's source, per kind and in order, as
Quarto counts them. Figures, tables and equations in chapter 0 are left to
Quarto (on web pages they read "Figure 1").

It runs at: pre-quarto (see _extension.yml), before Quarto resolves references.
]]

local html, latex = quarto.doc.is_format("html"), quarto.doc.is_format("latex")
if not (html or latex) then return {} end

local NBSP = "\u{00A0}"
local NAMES = {
  thm = "Theorem", lem = "Lemma", cor = "Corollary", prp = "Proposition",
  cnj = "Conjecture", def = "Definition", exm = "Example", exr = "Exercise",
}

local function read_file(path)
  local f = io.open(path, "r")
  if not f then return nil end
  local text = f:read("a")
  f:close()
  return text
end

-- {{< include path >}} lines replaced by the file's text (as in concept-map.lua).
local function expand_includes(text, root, dir, depth)
  if (depth or 0) > 5 then return text end
  return (text:gsub("{{<%s*include%s+([^%s>]+)%s*>}}", function(path)
    local full = path:sub(1, 1) == "/" and pandoc.path.join({ root, path:sub(2) })
      or pandoc.path.join({ root, dir, path })
    local inner = read_file(full)
    if not inner then return "" end
    return expand_includes(inner, root, pandoc.path.directory(pandoc.path.make_relative(full, root)), (depth or 0) + 1)
  end))
end

-- The book's chapter files (parts flattened).
local function chapter_files(root)
  local text = read_file(pandoc.path.join({ root, "_quarto.yml" }))
  if not text then return {} end
  local meta = pandoc.read("---\n" .. text .. "\n---\n", "markdown").meta
  local files = {}
  local function walk(list)
    for _, item in ipairs(list or {}) do
      local ty = pandoc.utils.type(item)
      if ty == "Inlines" or ty == "string" then
        files[#files + 1] = pandoc.utils.stringify(item)
      elseif ty == "table" then walk(item.chapters) end   -- a part
    end
  end
  if meta.book then walk(meta.book.chapters) end
  return files
end

-- id -> { file = …, kind = "prp" (or "ch" for the chapter), number = "0.2" }
local function zero_items(root)
  local items = {}
  for _, file in ipairs(chapter_files(root)) do
    local text = read_file(pandoc.path.join({ root, file }))
    if text and text:find("chapter-zero", 1, true) then
      local doc = pandoc.read(expand_includes(text, root, pandoc.path.directory(file)), "markdown")
      local h1 = nil
      for _, b in ipairs(doc.blocks) do
        if b.t == "Header" and b.level == 1 then h1 = b; break end
      end
      if h1 and h1.classes:includes("chapter-zero") then
        if h1.identifier ~= "" then items[h1.identifier] = { file = file, kind = "ch", number = "0" } end
        local counters = {}
        doc.blocks:walk({
          traverse = "topdown",
          Div = function(div)
            local kind = div.identifier:match("^(%a+)%-")
            if kind and NAMES[kind] then
              counters[kind] = (counters[kind] or 0) + 1
              items[div.identifier] = { file = file, kind = kind, number = "0." .. counters[kind] }
            end
          end,
        })
      end
    end
  end
  return items
end

local root = quarto.project.directory or pandoc.path.directory(quarto.doc.input_file)
local page = pandoc.path.make_relative(quarto.doc.input_file, root)
local page_dir = pandoc.path.split(pandoc.path.directory(page))

-- A link from this page to `file` (#id), relative to the page's folder.
local function link_to(file, id)
  local hash = id and ("#" .. id) or ""
  if file == page then return hash ~= "" and hash or (file:gsub("^.*/", ""):gsub("%.qmd$", ".html")) end
  local target = pandoc.path.split((file:gsub("%.qmd$", ".html")))
  local common = 0
  while common < #page_dir and page_dir[common + 1] ~= "." and page_dir[common + 1] == target[common + 1] do
    common = common + 1
  end
  local parts = {}
  for i = common + 1, #page_dir do if page_dir[i] ~= "." then parts[#parts + 1] = ".." end end
  for i = common + 1, #target do parts[#parts + 1] = target[i] end
  return table.concat(parts, "/") .. hash
end

local items = nil
local function lookup(id)
  if not id:match("^%a+%-") then return nil end
  items = items or zero_items(root)
  local item = items[id:sub(1, 1):lower() .. id:sub(2)]   -- @Prp-… capitalizes the prefix
  if item and (html or item.kind == "ch") then return item end
end

local function prefix(kind, meta)
  local key = (kind == "ch" and "ch" or kind) .. "-prefix"
  local custom = meta and meta.crossref and meta.crossref[key]
  if custom then return pandoc.utils.stringify(custom) end
  return kind == "ch" and "Chapter" or NAMES[kind]
end

local doc_meta = nil

return {
  { Meta = function(meta) doc_meta = meta end },
  {
    Cite = function(cite)
      local any = false
      for _, c in ipairs(cite.citations) do
        if lookup(c.id) then any = true end
      end
      if not any then return nil end
      local out = pandoc.Inlines({})
      for i, c in ipairs(cite.citations) do
        if i > 1 then out:insert(pandoc.Str(",")); out:insert(pandoc.Space()) end
        local item = lookup(c.id)
        if item then
          local text = pandoc.Inlines({})
          if #c.prefix > 0 then
            text:extend(c.prefix); text:insert(pandoc.Str(NBSP))
          elseif c.mode ~= "SuppressAuthor" then
            text:insert(pandoc.Str(prefix(item.kind, doc_meta) .. NBSP))
          end
          if html then
            text:insert(pandoc.Str(item.number))
            local id = item.kind ~= "ch" and (c.id:sub(1, 1):lower() .. c.id:sub(2)) or nil
            out:insert(pandoc.Link(text, link_to(item.file, id), "", pandoc.Attr("", { "quarto-xref" })))
          else
            text:insert(pandoc.RawInline("latex", "\\ref{" .. c.id .. "}"))
            out:extend(text)
          end
          out:extend(c.suffix)
        else
          out:insert(pandoc.Cite({ pandoc.Str("@" .. c.id) }, { c }))
        end
      end
      return out
    end,
  },
}
