--[[
project-macros.lua — a project's own math macros, in PDF and on web pages.

mathkit's macros (macros.tex in the extension) are on every page. A project
adds its own in a file `macros.tex` at the project root (another name or
place with the document option `macros-file: path/to/file.tex`, relative to
the project root), in the same syntax:

    \newcommand{\Name}{body}               a new macro
    \newcommand{\Name}[2]{… #1 … #2 …}     with arguments
    \newcommand{\Name}[2][default]{…}      an optional first argument
    \renewcommand{\Name}{body}             change one of mathkit's

  • PDF: the file is added to the preamble, after mathkit's macros, as is.
    LaTeX stops with "Command \Name already defined" if \newcommand reuses a
    name mathkit (or LaTeX) has: use \renewcommand to change it on purpose.
  • Web: the definitions are read (the subset above, as macros-to-mathjax.py
    reads macros.tex) and given to MathJax with the page; they win over
    mathkit's. mathjax-config.html picks them up whichever script runs first.

Without the file, this filter does nothing.
]]

local function read_file(path)
  local f = io.open(path, "r")
  if not f then return nil end
  local text = f:read("a")
  f:close()
  return text
end

-- Remove % comments (a % not preceded by a backslash) from every line.
local function strip_comments(text)
  local out = {}
  for line in (text .. "\n"):gmatch("(.-)\n") do
    local i, cut = 1, nil
    while true do
      local p = line:find("%", i, true)
      if not p then break end
      if p == 1 or line:sub(p - 1, p - 1) ~= "\\" then cut = p; break end
      i = p + 1
    end
    out[#out + 1] = cut and line:sub(1, cut - 1) or line
  end
  return table.concat(out, "\n")
end

-- text:sub(i, i) is "{"; return its contents and the index after the matching "}".
local function read_braced(text, i, path)
  local depth, j = 0, i
  while j <= #text do
    local c = text:sub(j, j)
    if c == "\\" then
      j = j + 2
    else
      if c == "{" then
        depth = depth + 1
      elseif c == "}" then
        depth = depth - 1
        if depth == 0 then return text:sub(i + 1, j - 1), j + 1 end
      end
      j = j + 1
    end
  end
  error("project-macros.lua: unbalanced braces in " .. path)
end

local KINDS = { provide = true, new = true, renew = true }

-- { Name = "body" | {"body", n} | {"body", n, "default"} }, as MathJax wants.
local function parse(text, path)
  text = strip_comments(text)
  local macros, count, pos = {}, 0, 1
  while true do
    local s, e, kind, name = text:find("\\(%a+)command{\\(%a+)}", pos)
    if not s then break end
    pos = e + 1
    if KINDS[kind] then
      local i, nargs, default = e + 1, 0, nil
      local _, e2, n = text:find("^%s*%[(%d+)%]", i)
      if e2 then
        nargs, i = tonumber(n), e2 + 1
        local _, e3, d = text:find("^%s*%[([^%]]*)%]", i)
        if e3 then default, i = d, e3 + 1 end
      end
      local _, ws = text:find("^%s*", i)
      i = ws + 1
      if text:sub(i, i) ~= "{" then
        error("project-macros.lua: no {body} after \\" .. kind .. "command{\\" .. name .. "} in " .. path)
      end
      local body, after = read_braced(text, i, path)
      body = body:gsub("%s+", " "):gsub("^ ", ""):gsub(" $", "")
      if nargs == 0 then
        macros[name] = body
      elseif default == nil then
        macros[name] = { body, nargs }
      else
        macros[name] = { body, nargs, default }
      end
      count = count + 1
      pos = after
    end
  end
  return macros, count
end

function Meta(meta)
  local root = quarto.project.directory
  if not root then
    root = pandoc.path.directory(quarto.doc.input_file)
  end
  local name = meta["macros-file"] and pandoc.utils.stringify(meta["macros-file"]) or "macros.tex"
  local path = pandoc.path.join({ root, name })
  local text = read_file(path)
  if not text then
    if meta["macros-file"] then
      quarto.log.warning("project-macros.lua: macros-file " .. name .. " not found in " .. root)
    end
    return nil
  end
  if quarto.doc.is_format("latex") then
    quarto.doc.include_file("in-header", path)
  elseif quarto.doc.is_format("html") then
    local macros, count = parse(text, path)
    if count > 0 then
      quarto.doc.include_text("in-header", table.concat({
        "<script>",
        "  // " .. count .. " macros from this project's " .. name .. " (project-macros.lua)",
        "  window.mkProjectMacros = " .. quarto.json.encode(macros) .. ";",
        "  if (window.MathJax && window.MathJax.tex) {",
        "    window.MathJax.tex.macros = Object.assign(window.MathJax.tex.macros || {}, window.mkProjectMacros);",
        "  }",
        "</script>",
      }, "\n"))
    end
  end
  return nil
end
