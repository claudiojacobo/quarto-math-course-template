--[[
site-links.lua — links that point at a file on the published site.

    [Explore in 3D](3d/abc.html){.site-link site-path="homework/3d/abc.html"}

On web pages the link stays relative, so it works in `quarto preview` and on the live site alike. In every other format (PDF), a relative link to a web file leads nowhere, so it becomes  <site-url>/<site-path>,  using the project's site-url (top level, or under book: or website:).
]]

local site_url = nil

local function read_site_url(meta)
  local candidates = { meta["site-url"],
                       meta.book and meta.book["site-url"],
                       meta.website and meta.website["site-url"] }
  for i = 1, 3 do                      -- not ipairs: it stops at the first nil
    local v = candidates[i]
    if v then
      site_url = pandoc.utils.stringify(v):gsub("/+$", "")
      return
    end
  end
end

local function fix_link(el)
  if not el.classes:includes("site-link") then return nil end
  if FORMAT:match("html") or FORMAT:match("revealjs") then return nil end
  local path = el.attributes["site-path"]
  if not path then return nil end
  if not site_url then
    io.stderr:write("[site-links.lua] no site-url set; PDF link to " .. path .. " left relative\n")
    return nil
  end
  el.target = site_url .. "/" .. path:gsub("^/+", "")
  return el
end

-- Meta must be read before links are visited, hence two passes.
return {
  { Meta = function(meta) read_site_url(meta); return nil end },
  { Link = fix_link },
}
