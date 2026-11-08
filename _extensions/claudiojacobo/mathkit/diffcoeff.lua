--[[
diffcoeff.lua — diffcoeff's derivative commands for HTML (MathJax).

In PDF the real diffcoeff package typesets these; the filter only wraps
bracketed ones in braces there, so a [2] inside a theorem title can't end
the title early. In every other format it rewrites them, inside math, into
plain TeX that MathJax understands. Supported (diffcoeff syntax):

  \diff{f}{x}             df/dx                 \diff[n+1]{f}{x}   d^{n+1}f/dx^{n+1}
  \diffp{f}{x,y}          ∂²f/∂x∂y              \diffp[2,3]{f}{x,y} ∂⁵f/∂x²∂y³
  \diff{}{x}              d/dx  (empty f)       \diff{f}{x}[0]     evaluated at a point
  \difc[2]{f}{x,y}        d_x² d_y f            \difcp{f}{x}       ∂_x f
  \dl{x}                  dx                    \dl{x,y,z}         dx dy dz

Orders: one per variable, comma-separated; missing ones are 1. The total
order in a numerator is their sum (numbers are added, symbols kept: [m,2]
gives m+2).

Not supported (left unchanged, with a warning): starred forms such as
\diff*, and diffcoeff's other optional settings.

The core (expand) is plain Lua with no Pandoc dependency, so it can be
tested on its own: see tools/test-diffcoeff.lua.
]]

local M = {}

-- Read a balanced {...} group starting at position i (s:sub(i,i) == "{").
-- Returns contents and the index just after the closing brace.
local function read_group(s, i, open, close)
  open, close = open or "{", close or "}"
  if s:sub(i, i) ~= open then return nil, i end
  local depth, j = 0, i
  while j <= #s do
    local c = s:sub(j, j)
    if c == "\\" then
      j = j + 2
    else
      if c == open then depth = depth + 1
      elseif c == close then
        depth = depth - 1
        if depth == 0 then return s:sub(i + 1, j - 1), j + 1 end
      end
      j = j + 1
    end
  end
  return nil, i -- unbalanced: give up
end

local function skip_spaces(s, i)
  while s:sub(i, i):match("%s") do i = i + 1 end
  return i
end

-- Split on commas that are not inside braces.
local function split_commas(s)
  local parts, depth, start = {}, 0, 1
  for j = 1, #s do
    local c = s:sub(j, j)
    if c == "{" then depth = depth + 1
    elseif c == "}" then depth = depth - 1
    elseif c == "," and depth == 0 then
      parts[#parts + 1] = s:sub(start, j - 1)
      start = j + 1
    end
  end
  parts[#parts + 1] = s:sub(start)
  for k, p in ipairs(parts) do parts[k] = p:match("^%s*(.-)%s*$") end
  return parts
end

-- Orders for each variable (missing → "1").
local function orders_for(vars, order_str)
  local given = order_str and split_commas(order_str) or {}
  local out = {}
  for k = 1, #vars do
    local o = given[k]
    out[k] = (o == nil or o == "") and "1" or o
  end
  return out
end

-- Sum of orders: numbers are added, anything else is kept symbolically.
local function total_order(orders)
  local sum, symbols = 0, {}
  for _, o in ipairs(orders) do
    local n = tonumber(o)
    if n then sum = sum + n else symbols[#symbols + 1] = o end
  end
  if #symbols == 0 then return tostring(sum) end
  local t = table.concat(symbols, "+")
  if sum > 0 then t = t .. "+" .. tostring(sum) end
  return t
end

local function power(o)
  if o == "1" then return "" end
  return "^{" .. o .. "}"
end

local D = { diff = "\\mathrm{d}", diffp = "\\partial", difc = "\\mathrm{d}", difcp = "\\partial" }

local function fraction(cmd, order_str, f, var_str, point)
  local d = D[cmd]
  local vars = split_commas(var_str)
  local orders = orders_for(vars, order_str)
  local den = {}
  for k, v in ipairs(vars) do den[k] = d .. " {" .. v .. "}" .. power(orders[k]) end
  local num = d .. power(total_order(orders))
  if f ~= "" then num = num .. " " .. f end
  local tex = "\\frac{" .. num .. "}{" .. table.concat(den, "\\,") .. "}"
  if point then tex = "\\left." .. tex .. "\\right|_{" .. point .. "}" end
  return tex
end

local function compact(cmd, order_str, f, var_str)
  local d = D[cmd]
  local vars = split_commas(var_str)
  local orders = orders_for(vars, order_str)
  local ops = {}
  for k, v in ipairs(vars) do ops[k] = d .. "_{" .. v .. "}" .. power(orders[k]) end
  return table.concat(ops, " ") .. (f ~= "" and (" " .. f) or "")
end

local function differentials(var_str)
  local out = {}
  for k, v in ipairs(split_commas(var_str)) do out[k] = "\\mathop{}\\!\\mathrm{d}" .. v end
  return table.concat(out, "\\,")
end

M.warnings = {}

-- Rewrite every supported command in a TeX string.
function M.expand(s)
  local out, i = {}, 1
  while i <= #s do
    local a, b, name = s:find("\\(%a+)", i)
    if not a then out[#out + 1] = s:sub(i); break end
    out[#out + 1] = s:sub(i, a - 1)
    local handled = false
    if D[name] or name == "dl" then
      local j = b + 1
      if s:sub(j, j) == "*" then
        M.warnings[#M.warnings + 1] = "\\" .. name .. "* is not supported in HTML; left unchanged"
      else
        local order
        j = skip_spaces(s, j)
        if s:sub(j, j) == "[" then order, j = read_group(s, j, "[", "]") end
        j = skip_spaces(s, j)
        if name == "dl" then
          local v, k = read_group(s, j)
          if v then out[#out + 1] = differentials(M.expand(v)); i = k; handled = true end
        else
          local f, k = read_group(s, j)
          local v, k2
          if f then k = skip_spaces(s, k); v, k2 = read_group(s, k) end
          if f and v then
            f, v = M.expand(f), M.expand(v)
            if order then order = M.expand(order) end
            if name == "difc" or name == "difcp" then
              out[#out + 1] = compact(name, order, f, v)
              i = k2
            else
              local point, k3
              if s:sub(k2, k2) == "[" then point, k3 = read_group(s, k2, "[", "]") end
              out[#out + 1] = fraction(name, order, f, v, point and M.expand(point))
              i = point and k3 or k2
            end
            handled = true
          end
        end
      end
    end
    if not handled then out[#out + 1] = s:sub(a, b); i = b + 1 end
  end
  return table.concat(out)
end

-- For LaTeX output: wrap each diffcoeff command that uses square brackets in
-- braces, {\diff[2]{y}{t}}. Quarto puts theorem/example titles in an optional
-- argument, \begin{example}[...], and LaTeX ends that argument at the first
-- unbraced "]" (the one in [2]), breaking the build. Braces hide it.
function M.protect(s)
  local out, i = {}, 1
  while i <= #s do
    local a, b, name = s:find("\\(%a+)", i)
    if not a then out[#out + 1] = s:sub(i); break end
    out[#out + 1] = s:sub(i, a - 1)
    local stop, bracketed = nil, false
    if (D[name] or name == "dl") and s:sub(b + 1, b + 1) ~= "*" then
      local j = skip_spaces(s, b + 1)
      if s:sub(j, j) == "[" then
        local _, k = read_group(s, j, "[", "]")
        if k ~= j then bracketed, j = true, k end
      end
      local nargs = (name == "dl") and 1 or 2
      local ok = true
      for _ = 1, nargs do
        j = skip_spaces(s, j)
        local g, k = read_group(s, j)
        if not g then ok = false; break end
        j = k
      end
      if ok then
        if (name == "diff" or name == "diffp") and s:sub(j, j) == "[" then
          local _, k = read_group(s, j, "[", "]")
          if k ~= j then bracketed, j = true, k end
        end
        stop = j
      end
    end
    if stop and bracketed then
      out[#out + 1] = "{" .. s:sub(a, stop - 1) .. "}"
      i = stop
    else
      out[#out + 1] = s:sub(a, b); i = b + 1
    end
  end
  return table.concat(out)
end

-- Pandoc filter entry point. Loaded by Pandoc, FORMAT is set and the global
-- Math/Pandoc functions are the filter; loaded by the test script, FORMAT is
-- nil and the module is returned instead. (A Pandoc filter file must not
-- return a table: Pandoc would take it as the list of filters to run.)
if FORMAT then
  local is_latex = FORMAT:match("latex") or FORMAT:match("beamer")
  function Math(el)
    local t = el.text
    if not (t:find("\\diff") or t:find("\\difc") or t:find("\\dl")) then return nil end
    if is_latex then
      -- PDF: the real diffcoeff typesets these; only shield their brackets.
      if not t:find("%[") then return nil end
      el.text = M.protect(t)
    else
      el.text = M.expand(t)
    end
    return el
  end
  function Pandoc(doc)
    for _, w in ipairs(M.warnings) do io.stderr:write("[diffcoeff.lua] " .. w .. "\n") end
    return nil
  end
else
  return M
end
