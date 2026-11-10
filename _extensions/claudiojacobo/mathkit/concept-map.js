/* concept-map.js: the concept map, from the data concept-map.lua puts in the
   page (#concept-map-data), drawn by graph-view.js (which must load first).
   No libraries.

   Layout, in two steps.
   1. Chapters: each gets a spot, depending on the layout (the reader picks
      one; {{< concept-map layout="…" >}} sets the default).
      • Clusters: the chapters are a small simulation of their own. They
        repel each other, each taking up room for its items, and the arrows
        between two chapters pull them together, harder the more arrows
        there are. It starts from the Dependencies layout, squeezed sideways.
      • Dependencies: each chapter gets a column, one to the right of the
        deepest earlier chapter it uses, so nothing sits left of what it
        builds on; chapters sharing a column are stacked, each near the
        chapters it has the most arrows to.
      • Book order: rows in reading order, like a table of contents; each
        part starts a row.
      • Free: no chapters at all; the items find their own places (and
        chapter titles aren't shown).
      Every layout is computed the same way each time: same notes, same
      picture.
   2. Items: graph-view.js's force simulation. Items repel each other, arrows
      pull their ends together, and each item is drawn toward its chapter's
      spot.
   "Show chapters" draws a blob around each chapter, colored by part.

   Arrows implied by others aren't drawn: if C uses A and B, and B already
   uses A (directly or not), the arrow A → C is left out. The card still lists
   everything an item uses.

   Search: the items that match (name, title, label or statement; every
   word) stay lit. Hover an item: it and its direct neighbours stay lit; the
   card shows it. Click it: everything it depends on (all the way down) and
   what uses it directly stay lit, and the card stays. Dragging, zooming,
   the List view, full screen, the keyboard and links to an item
   (concepts.html#prp-x, concepts.html#cm-item-prp-x): see graph-view.js. */
(function () {
  "use strict";

  // ---------- tuning ----------
  const COLUMN = 360;              // distance between columns of chapters
  const ROW = 32;                  // height each item adds to its chapter, for stacking chapters
  const CHAPTER_GAP = 100;         // space between chapters stacked in a column
  // The layouts differ in where the chapters sit (step 1), how hard items are
  // pulled toward their chapter's spot (sideways, up/down), and what an arrow
  // between two chapters does: "vertical" only pulls its ends to similar
  // heights (sideways is the columns' job); "both" is an ordinary spring,
  // crossK times as strong as one inside a chapter. The first is the default.
  // Free: repulsion at any distance.
  const LAYOUTS = {
    clusters: { name: "Clusters",     pullX: 0.1,   pullY: 0.1,   cross: "both", crossK: 0.1 },
    depth:    { name: "Dependencies", pullX: 0.1,   pullY: 0.04,  cross: "vertical", crossK: 0.5 },
    book:     { name: "Book order",   pullX: 0.12,  pullY: 0.12,  cross: "both", crossK: 0.08 },
    free:     { name: "Free",         pullX: 0.006, pullY: 0.006, cross: "both", crossK: 1, chargeRange: Infinity },
  };
  // Clusters: a chapter takes up room r0 + r1·√(items), plus gap between
  // chapters; how hard chapters keep their distance, how hard arrows pull
  // them together, the pull toward the middle; how much the starting
  // (Dependencies) layout is squeezed sideways; and how long it runs.
  const CL = { r0: 30, r1: 32, gap: 40, repel: 1, attract: 0.08, gravity: 0.004, squeeze: 0.6, steps: 1500 };
  const BOOK_CELL = 330, BOOK_ROW = 6;   // book order: width of a chapter; most chapters in a row

  const KIND_PLURAL = { def: "Definitions", thm: "Theorems", prp: "Propositions", lem: "Lemmas",
                        cor: "Corollaries", cnj: "Conjectures", exm: "Examples" };
  const KIND_ORDER = ["def", "thm", "prp", "lem", "cor", "cnj", "exm"];

  function init() {
    const root = document.getElementById("concept-map");
    const dataEl = document.getElementById("concept-map-data");
    if (!root || !dataEl || !window.GraphView) return;
    const { svg, tag, storage } = window.GraphView;
    const { circle, star } = window.GraphView.shapes;

    // ---------- shapes (centred at 0,0; r is the node's size) ----------
    function shape(kind, r) {
      switch (kind) {
        case "thm": return star(r * 1.5, r * 0.65);
        case "prp": { const s = r * 0.9; return `M${-s},${-s}H${s}V${s}H${-s}Z`; }
        case "lem": return `M0,${-r * 1.25}L${r * 1.15},${r * 0.8}L${-r * 1.15},${r * 0.8}Z`;
        case "cor": return `M0,${-r * 1.3}L${r * 1.3},0L0,${r * 1.3}L${-r * 1.3},0Z`;
        default: return circle(r);   // definitions; examples (hollow); conjectures
      }
    }

    const data = JSON.parse(dataEl.textContent);
    const list = x => (Array.isArray(x) ? x : []);
    const chapters = list(data.chapters), nodes = list(data.nodes);
    // The reader's last choices, if the browser kept them; otherwise the
    // course's defaults (the shortcode's layout="…" and outline="…").
    const store = storage("concept-map-");
    const options = data.options || {};
    let outline = (store.get("outline") || options.outline || "true") !== "false";
    let showExamples = true;
    let exBox = null;

    // Step 1: where each chapter sits (see the top of this file).
    function placeChapters(view, key) {
      const edges = view.edges;
      const C = chapters.length;
      const weight = chapters.map(() => new Array(C).fill(0));   // arrows between chapters
      const uses = chapters.map(() => new Set());
      for (const ch of chapters) ch.size = 0;
      for (const n of nodes) chapters[n.chapter - 1].size++;
      for (const e of edges) {
        const a = e.source.chapter - 1, b = e.target.chapter - 1;
        if (a === b) continue;
        weight[a][b]++; weight[b][a]++;
        uses[b].add(a);
      }
      if (key === "book") return placeBook(C);
      if (key === "clusters") return placeClusters(view, C, weight, uses);
      if (key === "free") { for (const ch of chapters) ch.x = ch.y = 0; return; }
      // column: one past the deepest earlier chapter it uses (a use of a later
      // chapter, a forward reference, doesn't move it)
      const column = new Array(C).fill(0);
      for (let b = 0; b < C; b++)
        for (const a of uses[b]) if (a < b) column[b] = Math.max(column[b], column[a] + 1);
      const columns = [];
      for (let c = 0; c < C; c++) (columns[column[c]] = columns[column[c]] || []).push(c);
      // height: the weighted average height of its neighbours, then spread
      // out so that chapters sharing a column don't overlap
      const y = new Array(C).fill(0), placed = new Array(C).fill(false);
      const half = c => chapters[c].size * ROW / 2;
      const pull = (c, ok) => {
        let s = 0, w = 0;
        for (let d = 0; d < C; d++) if (d !== c && weight[c][d] && ok(d)) { s += weight[c][d] * y[d]; w += weight[c][d]; }
        return w ? s / w : null;
      };
      const stack = cols => {
        const order = cols.slice().sort((a, b) => y[a] - y[b] || a - b);
        const want = order.map(c => y[c]);
        for (let i = 1; i < order.length; i++) {
          const p = order[i - 1], c = order[i];
          y[c] = Math.max(y[c], y[p] + half(p) + half(c) + CHAPTER_GAP);
        }
        const shift = order.reduce((s, c, i) => s + y[c] - want[i], 0) / order.length;
        for (const c of order) y[c] -= shift;
      };
      for (const cols of columns) {                 // left to right: near what they build on
        for (const c of cols) { const p = pull(c, d => placed[d]); y[c] = p == null ? 0 : p; }
        stack(cols);
        for (const c of cols) placed[c] = true;
      }
      for (let pass = 0; pass < 4; pass++)          // then near everything they're connected to
        for (const cols of columns) {
          for (const c of cols) { const p = pull(c, () => true); if (p != null) y[c] = p; }
          stack(cols);
        }
      chapters.forEach((ch, c) => { ch.x = column[c] * COLUMN; ch.y = y[c]; });
    }
    // Book order: chapters in reading order, like a table of contents. Each
    // part starts a new row (a part of one chapter joins the next), and a long
    // part is split into rows of equal length.
    function placeBook(C) {
      const groups = [];
      for (let c = 0; c < C; c++) {
        const last = groups[groups.length - 1];
        const samePart = last && chapters[last[last.length - 1]].part === chapters[c].part;
        const lonely = last && last.length === 1;
        if (last && (samePart || lonely)) last.push(c); else groups.push([c]);
      }
      const height = c => 90 + 20 * chapters[c].size;
      let y = 0;
      for (const g of groups) {
        const rows = Math.ceil(g.length / BOOK_ROW), per = Math.ceil(g.length / rows);
        for (let i = 0; i < g.length; i += per) {
          const row = g.slice(i, i + per), h = Math.max(...row.map(height));
          row.forEach((c, j) => { chapters[c].x = j * BOOK_CELL; chapters[c].y = y + h / 2; });
          y += h + 70;
        }
      }
    }
    // Clusters: the chapters are a small simulation of their own (see CL),
    // run to rest once, from the same start every time.
    function placeClusters(view, C, weight) {
      // start from the Dependencies layout, squeezed, so prerequisites tend to
      // stay on the left; then let the chapters settle
      placeChapters(view, "depth");
      const R = c => CL.r0 + CL.r1 * Math.sqrt(chapters[c].size);
      let maxW = 1;
      for (let i = 0; i < C; i++) for (let j = 0; j < C; j++) maxW = Math.max(maxW, weight[i][j]);
      const P = chapters.map(ch => ({ x: ch.x * CL.squeeze, y: ch.y, vx: 0, vy: 0 }));
      for (let it = 0; it < CL.steps; it++) {
        const a = 1 - it / CL.steps;
        for (let i = 0; i < C; i++) for (let j = i + 1; j < C; j++) {
          const p = P[i], q = P[j];
          let dx = q.x - p.x, dy = q.y - p.y;
          const d = Math.hypot(dx, dy) || 1e-3, min = R(i) + R(j) + CL.gap;
          let f = 0;
          if (d < 2 * min) f -= CL.repel * (2 * min - d) / min;                    // keep some room
          if (weight[i][j]) f += CL.attract * (weight[i][j] / maxW) * (d - min);   // arrows pull
          if (d < min) f -= 0.5 * (min - d);                                       // no overlaps
          dx /= d; dy /= d;
          p.vx += dx * f * a; p.vy += dy * f * a; q.vx -= dx * f * a; q.vy -= dy * f * a;
        }
        let cx = 0, cy = 0;
        for (const p of P) { cx += p.x / C; cy += p.y / C; }
        for (const p of P) {
          p.vx -= (p.x - cx) * CL.gravity * a; p.vy -= (p.y - cy) * CL.gravity * a;   // toward the middle
          p.x += (p.vx *= 0.6); p.y += (p.vy *= 0.6);
        }
      }
      P.forEach((p, c) => { chapters[c].x = p.x; chapters[c].y = p.y; });
    }
    // Step 2 starts with the items scattered around their chapter's spot,
    // from the same "random" start every time (view.rand is seeded).
    function scatter(view) {
      for (const n of nodes) {
        const ch = chapters[n.chapter - 1];
        n.tx = ch.x; n.ty = ch.y;
        n.x = n.tx + (view.rand() - 0.5) * 120;
        n.y = n.ty + (view.rand() - 0.5) * Math.max(120, ch.size * ROW);
        n.vx = n.vy = 0;
      }
    }
    for (const key in LAYOUTS) {
      const L = LAYOUTS[key];
      L.place = view => { placeChapters(view, key); scatter(view); };
      // an arrow between chapters: crossK as strong, and maybe only up/down
      L.spring = e => e.source.chapter !== e.target.chapter
        ? { k: L.crossK, vertical: L.cross === "vertical" } : { k: 1, vertical: false };
    }

    // the convex hull of some points, as a path (drawn with a thick, rounded
    // outline, so it becomes a rounded blob around them)
    function hullPath(pts) {
      if (!pts.length) return "";
      pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
      const half = list => { const h = []; for (const p of list) { while (h.length > 1 && cross(h[h.length - 2], h[h.length - 1], p) <= 0) h.pop(); h.push(p); } h.pop(); return h; };
      const hull = pts.length < 3 ? pts : [...half(pts), ...half(pts.slice().reverse())];
      return "M" + hull.map(p => p[0].toFixed(1) + "," + p[1].toFixed(1)).join("L") + "Z";
    }
    const px = v => v.toFixed(1) + "px";

    GraphView.create(root, {
      nodes,
      edges: list(data.edges),
      list: document.getElementById("concept-map-list"),   // the List view, if the page has it
      store: "concept-map-",
      layouts: LAYOUTS,
      layout: options.layout,
      hideImplied: true,
      underlay: "cm-hulls",
      ariaLabel: "Concept map: definitions, theorems and examples, with arrows from each item to the items that use it.",
      searchLabel: "Search the definitions, theorems and examples",
      radius: n => (n.kind === "exm" ? 5 : Math.min(15, 6 + 1.8 * Math.sqrt(n.users.length))),
      labelText: n => n.label,
      node: n => ({ cls: `cm-${n.kind}`, d: shape(n.kind, n.r),
                    aria: n.name + (n.title ? ": " + n.title : ""), html: n.labelHtml || n.label }),
      visible: n => showExamples || n.kind !== "exm",
      // A hidden example is shown again when something asks for it by name.
      reveal: n => {
        if (n.kind === "exm" && !showExamples) { exBox.checked = true; exBox.dispatchEvent(new Event("change")); }
      },
      searchText: n => {
        const d = document.createElement("div");
        d.innerHTML = n.statementHtml;
        return [n.name, n.label, n.title, d.textContent].join(" ");
      },
      legend: el => {
        for (const kind of KIND_ORDER) {
          if (!nodes.some(n => n.kind === kind)) continue;
          const item = tag("span", "cm-legend-item", el);
          const icon = svg("svg", { width: 18, height: 18, viewBox: "-9 -9 18 18", "aria-hidden": "true" }, item);
          svg("path", { d: shape(kind, 5.5), class: `cm-shape cm-${kind}` }, icon);
          item.appendChild(document.createTextNode(KIND_PLURAL[kind]));
        }
      },
      controls: view => {
        const olToggle = tag("label", "cm-toggle cm-map-only");
        const olBox = tag("input", null, olToggle);
        olBox.type = "checkbox"; olBox.checked = outline;
        olToggle.appendChild(document.createTextNode(" Show chapters"));
        olBox.addEventListener("change", () => { outline = olBox.checked; store.set("outline", String(outline)); view.draw(); });
        const exToggle = tag("label", "cm-toggle");
        exBox = tag("input", null, exToggle);
        exBox.type = "checkbox"; exBox.checked = true;
        exToggle.appendChild(document.createTextNode(" Examples"));
        exBox.addEventListener("change", () => { showExamples = exBox.checked; view.refilter(); });
        return [olToggle, exToggle];
      },
      // chapter titles (HTML, over the drawing) and outlines (SVG, under the arrows)
      setup: view => {
        for (const ch of chapters) {
          ch.el = tag("div", "cm-chapter", view.labelLayer);
          ch.el.innerHTML = (ch.number != null ? ch.number + "\u2002" : "") + (ch.titleHtml || ch.title);   // an en space
        }
        const parts = [...new Set(chapters.map(ch => ch.part))];
        for (const ch of chapters) {
          ch.hull = svg("path", { class: "cm-hull" }, view.underlay);
          ch.hull.style.setProperty("--cm-hull", `var(--cm-part-${parts.indexOf(ch.part) % 4})`);
        }
      },
      labelElements: () => chapters.map(ch => ch.el),
      onDraw: (view, { z, s }) => {
        const t = view.t, active = view.active();
        const top = chapters.map(() => Infinity), sumX = chapters.map(() => 0), count = chapters.map(() => 0);
        for (const n of active) { const c = n.chapter - 1; top[c] = Math.min(top[c], n.y); sumX[c] += n.x; count[c]++; }
        view.underlay.style.display = outline ? "" : "none";
        if (outline) chapters.forEach((ch, c) => {
          const pts = [];
          for (const n of active) if (n.chapter === c + 1) { pts.push([n.x, n.y], [n.x + Math.min(n.w, 140) * s, n.y]); }
          ch.hull.setAttribute("d", hullPath(pts));
        });
        const zc = Math.max(0.6, z);                     // chapter titles stay readable zoomed out
        const titles = view.layoutKey() !== "free";      // Free doesn't group by chapter: no titles
        chapters.forEach((ch, c) => {
          if (ch.el.hidden === titles) ch.el.hidden = !titles;
          if (!titles) return;
          const x = count[c] ? sumX[c] / count[c] : ch.x, y = count[c] ? top[c] : ch.y;
          ch.el.style.transform =
            `translate(${px(t.x + x * t.k)},${px(t.y + y * t.k - 28 * z)}) translate(-50%,-100%) scale(${zc.toFixed(3)})`;
        });
      },
      // Lit: on hover, the item and its direct neighbours; on focus, the item,
      // everything below it, and what uses it directly; otherwise the matches.
      lit: ({ hover, focus, matches, view }) => {
        if (focus) {
          const up = view.ancestors(focus); up.add(focus);
          return new Set([...up, ...focus.users]);
        }
        if (hover) return new Set([hover, ...hover.deps, ...hover.users]);
        return matches;
      },
      card: (n, card, view) => {
        const chip = (m, parent) => {
          const b = tag("button", "cm-chip cm-chip-" + m.kind, parent, m.name);
          b.title = m.label;
          b.addEventListener("click", ev => { ev.stopPropagation(); view.setFocus(m, true); });
          return b;
        };
        tag("p", "cm-card-name cm-text-" + n.kind, card, n.name);
        if (n.titleHtml) tag("p", "cm-card-title", card).innerHTML = n.titleHtml;
        const st = tag("div", "cm-card-statement", card);
        st.innerHTML = n.statementHtml;
        for (const c of st.querySelectorAll("span.citation[data-cites]")) {   // references to other items
          const target = view.byId.get(c.dataset.cites);
          if (target) c.replaceWith(chip(target));
          else c.textContent = c.textContent.replace(/@/g, "");
        }
        for (const [label, items] of [["Uses", n.deps], ["Used by", n.users]]) {
          if (!items.length) continue;
          const row = tag("p", "cm-card-rel", card);
          tag("span", "cm-card-rel-label", row, label);
          for (const m of items) chip(m, row);
        }
        const open = tag("a", "cm-card-open", card, "Open in the notes ↗");
        open.href = n.url; open.target = "_blank"; open.rel = "noopener";
      },
      // references to other items, in the List view (the Lua side resolved everything else)
      listItem: (li, n, view) => {
        for (const c of li.querySelectorAll("span.citation[data-cites]")) {
          const target = view.byId.get(c.dataset.cites);
          if (target) { const a = tag("a", null, null, target.name); a.href = "#cm-item-" + target.id; c.replaceWith(a); }
          else c.textContent = c.textContent.replace(/@/g, "");
        }
      },
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
