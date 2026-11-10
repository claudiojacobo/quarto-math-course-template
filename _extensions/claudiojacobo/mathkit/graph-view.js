/* graph-view.js: an interactive map of a directed graph. No libraries.

   The viewer behind the concept map (concept-map.js) and any other map of
   things and arrows between them. It knows nothing about what the things
   are: a page's own script, the "adapter", calls

     GraphView.create(root, spec)

   with the nodes and arrows and everything particular to them (their shapes
   and labels, the layouts, what lights up, what the card says; see SPEC
   below), and the viewer does the rest:

   • Layout: a force simulation. Nodes repel each other, arrows pull their
     ends together, and each node is drawn toward its home (n.tx, n.ty), which
     the layout sets. Same data, same picture: everything random is seeded.
   • Drawing: arrows and shapes in SVG; labels as HTML on top (so that they
     can hold typeset math); a card for the node in hand.
   • Hover a node: what the adapter says lights up, and the card shows it.
     Click it: it stays (the focus). Click empty space or press Esc to clear.
   • Drag nodes; drag empty space to pan; scroll or pinch to zoom.
   • Search: as you type, matching nodes (every word) stay lit; Enter steps
     through them.
   • List view: the same information as text (the page's own HTML, a
     .cm-list with a .cm-list-item[data-id] per node): for screen readers,
     keyboards, and anyone who'd rather read than look. Full screen: the
     button, or Esc to leave.
   • Keyboard: the map is one Tab stop; the arrow keys move through the nodes
     in the order given (Home/End: first/last), Enter or Space focuses one.
   • page.html#id opens the map focused on that node; #cm-item-id opens the
     List view at it.
   • Optional: arrows implied by longer paths left out (hideImplied); a
     second selection to compare with the focus (compare: shift-click); a
     whole connected piece dragged at once (dragPieces: shift-drag); labels
     shown only when the adapter says (showLabel).

   SPEC (everything but nodes is optional; defaults in brackets)
     nodes          [{ id, … }] in reading order (the keyboard's order). The
                    viewer adds to each: deps and users (nodes at the other
                    end of its incoming and outgoing arrows), r, w, x, y, vx,
                    vy, tx, ty, fx, fy, deg, g (its SVG group), el (its
                    label), li (its list entry), text (for search).
                    Give every node the same fields in the same order (null
                    where there's nothing): JavaScript engines then run the
                    simulation several times faster (with a thousand nodes of
                    mixed shapes, a warm-up took 6 s instead of 1).
     edges          [{ source, target }] by id; duplicates and unknown ids are dropped
     list           the List view's element [none]
     store          prefix of the names the reader's choices are kept under
                    in localStorage ["graph-view-"]
     layouts        { key: layout, … }; the first is the default
     layout         the default layout's key, if not the first
     radius(n)      a node's size [8]
     node(n)        { cls, d, aria, html }: classes for its group and shape,
                    the shape's SVG path (around 0,0), its accessible name,
                    and its label's HTML
     labelText(n)   its label as text, to estimate its width before it's drawn
     visible(n)     whether it is shown [always]
     lit(state)     the Set of nodes to light, or null; state is { hover,
                    focus, compare, matches, view } [hover or focus and its
                    neighbours; the matches]
     card(n, el, view)   fills the card (an empty <aside>)
     searchText(n)  what search looks in [its label]
     legend(el, view), controls(view) → [elements for the toolbar],
     setup(view)    (before nodes are drawn: e.g. extra layers and labels),
     onDraw(view, sizes)   (after every frame), listItem(li, n, view),
     reveal(n)      (something asked for n by name: make sure it's shown),
     labelElements()      other HTML labels to typeset with MathJax
     underlay       class of an SVG layer to add under the arrows
     ariaLabel, searchLabel   text for screen readers
     hideImplied, compare, dragPieces   [false]
     showLabel(n, view)   whether n's label may be drawn [CSS decides];
                    labels not drawn, and those off screen, aren't repositioned
     declutter      labels never overlap: they're drawn in order of
                    labelPriority(n, lit) [lit first], each only if there's
                    room; zooming in makes room [false]
     labelMinScale  labels are never drawn smaller than this, zoomed out [0]
     minScale       nor shapes and arrowheads [0]
     coalesce       zooming and panning redraw at most once a frame [false]
     searchDelay    search once typing pauses this many ms [0: at every key]
     onHighlight(view, lit)   after the lit nodes are marked (e.g. extra classes)

   A layout: { name, place(view), pullX, pullY, spring(e), charge,
   chargeRange, linkDistance, labelGap, force(view, alpha), warm }. place() puts
   every node somewhere (x, y; vx = vy = 0) and sets its home (tx, ty);
   pullX and pullY are how hard nodes are drawn home (a node's own pullX or
   pullY wins); spring(e) → { k, vertical } is how strong an arrow is
   (vertical: it only pulls its ends to similar heights); charge (repulsion,
   negative), chargeRange (repulsion only between nodes closer than this),
   linkDistance (an arrow's rest length) and labelGap (how far apart labels
   at similar heights are pushed) have defaults; force() adds forces of its
   own, after the others, to vx and vy; warm is how many steps it takes
   before it's shown [300; 400 with reduced motion]; alphaMin is how calm
   it must be to stop [0.001; a layout that starts almost settled can stop
   sooner, and stop redrawing].

   The view passed to the adapter's functions has: root, stage, canvas,
   layer (the SVG group that pans and zooms), underlay, labelLayer, card,
   t (the transform: map → screen is x·k + x0), nodes, edges, byId,
   active() and activeEdges() (those shown), layoutKey(), focus(),
   setFocus(n, center), setCompare(n), pickCompare(on) (the next node
   chosen becomes the comparison; Esc cancels), draw(), fit(), refilter() (after
   visible() changes), reheat(), rand() (seeded), ancestors(n),
   descendants(n), piece(n), store, and the helpers svg() and tag().
*/
(function () {
  "use strict";

  // ---------- tuning (a layout may set its own charge, chargeRange, linkDistance, labelGap) ----------
  const CHARGE = -260;             // repulsion between nodes
  const CHARGE_RANGE = 400;        // ... only between nodes closer than this
  const LINK_DISTANCE = 70;
  const LABEL_GAP = 18;            // labels at about the same height are pushed this far apart
  const ALPHA_MIN = 0.001, ALPHA_DECAY = 1 - Math.pow(0.001, 1 / 600), VELOCITY_KEEP = 0.85;
  const ZOOM_MIN = 0.15, ZOOM_MAX = 6;   // zooming out stops here, or at the whole map if that's smaller
  const TEXT_ZOOM_MAX = 1.5;       // zoomed in past this, labels and shapes stop growing
  const FAR = 0.7;                 // zoomed out past this, only lit nodes have labels (CSS: .is-far)
  const WARM = 300, WARM_REDUCED = 400;   // ticks before the map is shown

  const SVGNS = "http://www.w3.org/2000/svg";
  const reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---------- helpers ----------
  function svg(name, attrs, parent) {
    const e = document.createElementNS(SVGNS, name);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function tag(name, cls, parent, text) {
    const e = document.createElement(name);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    if (parent) parent.appendChild(e);
    return e;
  }
  // The reader's choices, kept by the browser if it can.
  function storage(prefix) {
    return {
      get(k) { try { return localStorage.getItem(prefix + k); } catch (e) { return null; } },
      set(k, v) { try { localStorage.setItem(prefix + k, v); } catch (e) { /* not remembered */ } },
    };
  }
  // MathJax may still be loading when the map is drawn: run fn once it's ready.
  function withMathJax(fn, tries = 50) {
    const mj = window.MathJax;
    if (mj && mj.startup && mj.startup.promise && mj.typesetPromise) mj.startup.promise.then(() => fn(mj)).catch(() => {});
    else if (tries > 0) setTimeout(() => withMathJax(fn, tries - 1), 200);
  }
  // shapes, centred at 0,0
  const circle = r => `M${r},0A${r},${r} 0 1,1 ${-r},0A${r},${r} 0 1,1 ${r},0Z`;
  function star(R, r) {
    let d = "";
    for (let i = 0; i < 10; i++) {
      const a = Math.PI * i / 5 - Math.PI / 2, q = i % 2 ? r : R;
      d += (i ? "L" : "M") + (q * Math.cos(a)).toFixed(2) + "," + (q * Math.sin(a)).toFixed(2);
    }
    return d + "Z";
  }
  const ICON = {
    enter: '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M1 6V1h5M10 1h5v5M15 10v5h-5M6 15H1v-5"/></svg>',
    leave: '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M6 1v5H1M15 6h-5V1M10 15v-5h5M1 10h5v5"/></svg>',
  };

  function create(root, spec) {
    const list = x => (Array.isArray(x) ? x : []);
    const nodes = list(spec.nodes);
    const store = storage(spec.store || "graph-view-");
    const LAYOUTS = spec.layouts || { free: { name: "Free", place: null, pullX: 0, pullY: 0 } };
    const firstLayout = Object.keys(LAYOUTS)[0];
    let layoutKey = [store.get("layout"), spec.layout].find(k => k && LAYOUTS[k]) || firstLayout;
    let layout = LAYOUTS[layoutKey];
    const visible = spec.visible || (() => true);
    const listEl = spec.list || null;
    const byId = new Map(nodes.map(n => [n.id, n]));
    const seen = new Set();
    const edges = list(spec.edges).filter(e => {
      const key = e.source + " " + e.target;
      if (!byId.has(e.source) || !byId.has(e.target) || seen.has(key)) return false;
      seen.add(key); return true;
    }).map(e => ({ source: byId.get(e.source), target: byId.get(e.target) }));

    // ---------- model ----------
    let seed = 7;
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (const n of nodes) { n.deps = []; n.users = []; }
    for (const e of edges) { e.target.deps.push(e.source); e.source.users.push(e.target); }
    for (const n of nodes) {
      n.r = spec.radius ? spec.radius(n) : 8;
      n.fx = n.fy = null;
      n.w = n.r + 5 + 6.8 * (spec.labelText ? spec.labelText(n) : String(n.label || n.id)).length;   // measured once drawn
    }
    const ancestors = n => {
      const seen = new Set(), stack = [n];
      while (stack.length) for (const d of stack.pop().deps) if (!seen.has(d)) { seen.add(d); stack.push(d); }
      return seen;
    };
    const descendants = n => {
      const seen = new Set(), stack = [n];
      while (stack.length) for (const u of stack.pop().users) if (!seen.has(u)) { seen.add(u); stack.push(u); }
      return seen;
    };
    const piece = n => {                          // n's connected piece, arrows either way
      const seen = new Set([n]), stack = [n];
      while (stack.length) for (const m of (x => [...x.deps, ...x.users])(stack.pop())) if (!seen.has(m)) { seen.add(m); stack.push(m); }
      return seen;
    };

    // A layout's arrows: how strong each is, and whether it only pulls up/down.
    function useLayout() {
      for (const e of edges) {
        const s = layout.spring ? layout.spring(e) : null;
        e.k = s ? s.k : 1; e.vertical = !!(s && s.vertical);
      }
    }
    // Where every node starts (the layout's place()), from the same "random" start every time.
    function place() {
      seed = 7;
      useLayout();
      if (layout.place) layout.place(view);
      else for (const n of nodes) { n.x = (rand() - 0.5) * 400; n.y = (rand() - 0.5) * 400; n.tx = n.ty = 0; n.vx = n.vy = 0; }
    }

    // Which nodes and arrows are shown: visible() says which nodes; an arrow
    // is shown when both its ends are, and (hideImplied) no path through
    // other shown nodes already implies it.
    let active = nodes.slice();
    let activeEdges = edges.slice();
    function applyFilter() {
      active = nodes.filter(visible);
      const on = new Set(active);
      if (spec.hideImplied) {
        const memo = new Map();
        const above = n => {                         // shown ancestors, through shown nodes
          if (memo.has(n)) return memo.get(n);
          const s = new Set(); memo.set(n, s);
          for (const d of n.deps) if (on.has(d)) { s.add(d); for (const x of above(d)) s.add(x); }
          return s;
        };
        activeEdges = edges.filter(e => on.has(e.source) && on.has(e.target) &&
          !e.target.deps.some(d => d !== e.source && on.has(d) && above(d).has(e.source)));
      } else {
        activeEdges = edges.filter(e => on.has(e.source) && on.has(e.target));
      }
      for (const n of nodes) n.deg = 0;
      for (const e of activeEdges) { e.source.deg++; e.target.deg++; }
      const drawn = new Set(activeEdges);
      for (const n of nodes) n.g.style.display = n.el.style.display = on.has(n) ? "" : "none";
      for (const e of edges) e.line.style.display = drawn.has(e) ? "" : "none";
      if (!on.has(tabStop)) setTabStop(active[0]);
    }

    // ---------- the simulation (in the manner of d3-force) ----------
    const sim = { alpha: 1, target: 0, frame: null };
    function tick() {
      const a = sim.alpha, N = active.length;
      const charge = layout.charge != null ? layout.charge : CHARGE;
      const range = layout.chargeRange != null ? layout.chargeRange : CHARGE_RANGE;
      const range2 = range * range;
      const rest = layout.linkDistance != null ? layout.linkDistance : LINK_DISTANCE;
      const labelGap = layout.labelGap != null ? layout.labelGap : LABEL_GAP;
      for (let i = 0; i < N; i++) {
        const p = active[i];
        for (let j = i + 1; j < N; j++) {
          const q = active[j];
          let dx = q.x - p.x, dy = q.y - p.y, d2 = dx * dx + dy * dy;
          if (d2 > range2) continue;
          if (d2 < 1e-6) { dx = (rand() - 0.5) * 1e-2; dy = (rand() - 0.5) * 1e-2; d2 = dx * dx + dy * dy; }
          const f = charge * a / d2;                     // repulsion
          p.vx += dx * f; p.vy += dy * f; q.vx -= dx * f; q.vy -= dy * f;
          const d = Math.sqrt(d2), min = p.r + q.r + 10;  // no overlapping shapes
          if (d < min) {
            const k = (min - d) / d * 0.35;
            p.vx -= dx * k; p.vy -= dy * k; q.vx += dx * k; q.vy += dy * k;
          }
          // no overlapping labels: a label runs to the right of its node, so
          // two nodes at about the same height whose labels would overlap are
          // pushed apart vertically
          const gap = labelGap - Math.abs(dy);
          if (gap > 0 && q.x - q.r < p.x + p.w && p.x - p.r < q.x + q.w) {
            const k = gap * 0.12 * (dy >= 0 ? 1 : -1);
            p.vy -= k; q.vy += k;
          }
        }
      }
      // springs along arrows; a "vertical" arrow only pulls its ends to
      // similar heights
      for (const e of activeEdges) {
        const s = e.source, t = e.target;
        const cross = e.vertical;
        const dx = t.x + t.vx - s.x - s.vx, dy = t.y + t.vy - s.y - s.vy;
        const l = cross ? Math.abs(dy) || 1e-6 : Math.sqrt(dx * dx + dy * dy) || 1e-6;
        const strength = e.k;
        const k = (cross ? strength * Math.max(0, l - rest / 2) : strength * (l - rest)) / l
                  * a / Math.min(s.deg, t.deg), bias = s.deg / (s.deg + t.deg);
        if (!cross) { t.vx -= dx * k * bias; s.vx += dx * k * (1 - bias); }
        t.vy -= dy * k * bias; s.vy += dy * k * (1 - bias);
      }
      if (layout.force) layout.force(view, a);
      for (const n of active) {
        n.vx += (n.tx - n.x) * (n.pullX != null ? n.pullX : layout.pullX) * a;   // toward home
        n.vy += (n.ty - n.y) * (n.pullY != null ? n.pullY : layout.pullY) * a;
        if (n.fx != null) { n.x = n.fx; n.y = n.fy; n.vx = n.vy = 0; continue; }
        n.x += (n.vx *= VELOCITY_KEEP);
        n.y += (n.vy *= VELOCITY_KEEP);
      }
      sim.alpha += (sim.target - sim.alpha) * ALPHA_DECAY;
    }
    function run() {
      if (sim.frame) return;
      const step = () => {
        tick(); draw();
        if (sim.alpha > (layout.alphaMin != null ? layout.alphaMin : ALPHA_MIN) || sim.target > 0) sim.frame = requestAnimationFrame(step);
        else sim.frame = null;
      };
      sim.frame = requestAnimationFrame(step);
    }
    function reheat(target) { sim.target = target; if (sim.alpha < 0.3) sim.alpha = 0.3; run(); }

    // ---------- DOM ----------
    root.textContent = "";
    const bar = tag("div", "cm-toolbar", root);
    const controls = tag("div", "cm-controls", bar);
    const views = tag("div", "cm-views", controls);
    views.setAttribute("role", "group"); views.setAttribute("aria-label", "View");
    const mapBtn = tag("button", "cm-button", views, "Map");
    const listBtn = tag("button", "cm-button", views, "List");
    if (!listEl) views.hidden = true;
    const searchBox = tag("input", "cm-search", controls);
    searchBox.type = "search"; searchBox.placeholder = "Search";
    searchBox.setAttribute("aria-label", spec.searchLabel || "Search");
    const countEl = tag("span", "cm-count", controls);
    countEl.setAttribute("aria-live", "polite");
    const legend = tag("div", "cm-legend", root);
    const buttons = tag("div", "cm-buttons", bar);
    const zoomOut = tag("button", "cm-button cm-map-only", buttons, "−"); zoomOut.setAttribute("aria-label", "Zoom out");
    const zoomIn = tag("button", "cm-button cm-map-only", buttons, "+"); zoomIn.setAttribute("aria-label", "Zoom in");
    const fitBtn = tag("button", "cm-button cm-map-only", buttons, "Fit");
    const fullBtn = tag("button", "cm-button cm-full", buttons);
    const layoutPick = tag("select", "cm-button cm-select cm-map-only", buttons);
    layoutPick.setAttribute("aria-label", "Layout");
    for (const key in LAYOUTS) {
      const o = tag("option", null, layoutPick, LAYOUTS[key].name); o.value = key;
      if (key === layoutKey) o.selected = true;
    }
    if (Object.keys(LAYOUTS).length < 2) layoutPick.hidden = true;

    // The stage holds three layers: the drawing (SVG: arrows and shapes), the
    // labels on top of it (HTML, so they can hold typeset math), and the card.
    const stage = tag("div", "cm-stage", root);
    const canvas = svg("svg", { class: "cm-svg", role: "group",
      "aria-label": (spec.ariaLabel || "A map of nodes and arrows.")
        + (listEl ? " The List view has the same information as text." : "") }, stage);
    const defs = svg("defs", {}, canvas);
    for (const [id, cls] of [["cm-arrow", "cm-arrowhead"], ["cm-arrow-lit", "cm-arrowhead is-lit"]]) {
      const m = svg("marker", { id, viewBox: "0 -4 9 8", refX: 9, refY: 0, markerWidth: 7, markerHeight: 7,
                                 orient: "auto", markerUnits: "userSpaceOnUse" }, defs);
      svg("path", { d: "M0,-4L9,0L0,4Z", class: cls }, m);
    }
    const markers = [...defs.querySelectorAll("marker")];
    const layer = svg("g", { class: "cm-view" }, canvas);
    const underlay = spec.underlay ? svg("g", { class: spec.underlay }, layer) : null;
    const edgeLayer = svg("g", { class: "cm-edges" }, layer);
    const nodeLayer = svg("g", { class: "cm-nodes" }, layer);
    const labelLayer = tag("div", "cm-labels", stage);
    labelLayer.setAttribute("aria-hidden", "true");          // the nodes carry the names
    const card = tag("aside", "cm-card", stage);
    card.hidden = true;
    card.setAttribute("aria-live", "polite");

    // ---------- view transform ----------
    // t maps the map's coordinates to the screen. Zooming in spreads things
    // out; past TEXT_ZOOM_MAX, shapes, labels and arrows stop growing (they
    // are drawn at a scale s < 1), so crowded spots open up.
    const t = { x: 0, y: 0, k: 1 };
    let zoomMin = ZOOM_MIN;
    const sizes = () => { const z = Math.max(Math.min(t.k, TEXT_ZOOM_MAX), spec.minScale || 0); return { z, s: z / t.k }; };

    // What the adapter's functions see.
    const view = {
      root, stage, canvas, layer, underlay, labelLayer, card, t, nodes, edges, byId, store,
      svg, tag, rand, ancestors, descendants, piece, sizes,
      active: () => active, activeEdges: () => activeEdges, layoutKey: () => layoutKey,
      focus: () => focus, compare: () => compare,
      setFocus: (n, center) => setFocus(n, center), setCompare: n => setCompare(n),
      pickCompare: on => { setPicking(on); highlight(); }, picking: () => picking,
      draw: () => draw(), fit: () => fit(), reheat: target => reheat(target || 0),
      refilter: () => refilter(), highlight: () => highlight(),
    };

    if (spec.legend) spec.legend(legend, view);
    const extra = spec.controls ? spec.controls(view) : [];
    buttons.prepend(layoutPick, ...extra);
    if (spec.setup) spec.setup(view);

    for (const e of edges) e.line = svg("line", { class: "cm-edge", "marker-end": "url(#cm-arrow)" }, edgeLayer);
    for (const n of nodes) {
      const look = spec.node ? spec.node(n) : {};
      const cls = look.cls ? " " + look.cls : "";
      n.g = svg("g", { class: "cm-node" + cls, tabindex: -1, role: "button",
                       "aria-label": look.aria || String(n.label || n.id) }, nodeLayer);
      n.g.dataset.id = n.id;
      svg("path", { d: look.d || circle(n.r), class: "cm-shape" + cls }, n.g);
      n.el = tag("div", "cm-label", labelLayer);
      n.el.innerHTML = look.html != null ? look.html : String(n.label || n.id);
      n.el.dataset.id = n.id;
    }
    if (listEl) {
      root.appendChild(listEl);
      for (const li of listEl.querySelectorAll(".cm-list-item")) {
        const n = byId.get(li.dataset.id);
        if (!n) continue;
        n.li = li;
        const show = tag("button", "cm-list-show", li.querySelector(".cm-list-name"), "Show on the map");
        show.addEventListener("click", () => { setView("map"); reveal(n); setFocus(n, true); });
        if (spec.listItem) spec.listItem(li, n, view);
      }
    }
    const measure = ns => { for (const n of ns) if (n.el.offsetWidth) n.w = n.r + 5 + n.el.offsetWidth; };
    measure(nodes);
    const hasMath = el => el.querySelector(".math") !== null;
    const mathEls = [...(spec.labelElements ? spec.labelElements() : []), ...nodes.map(n => n.el)].filter(hasMath);
    if (mathEls.length) withMathJax(mj => mj.typesetPromise(mathEls).then(() => {
      // MathJax makes each formula a tab stop; the nodes already are
      for (const el of mathEls) for (const m of el.querySelectorAll("mjx-container")) m.setAttribute("tabindex", "-1");
      measure(nodes.filter(n => mathEls.includes(n.el)));
      draw();
    }));

    function applyTransform() {
      layer.setAttribute("transform", `translate(${t.x},${t.y}) scale(${t.k})`);
      stage.classList.toggle("is-far", t.k < FAR);
      if (!spec.coalesce) { applySizes(); draw(); }
      // coalesce: the rest once a frame (a new --cm-s restyles every arrow,
      // which is slow to do at every wheel event of a big map)
      else if (!drawSoon) { drawSoon = true; requestAnimationFrame(() => { drawSoon = false; applySizes(); draw(); }); }
    }
    function applySizes() {
      const { s } = sizes();
      canvas.style.setProperty("--cm-s", s);
      for (const m of markers) { m.setAttribute("markerWidth", 7 * s); m.setAttribute("markerHeight", 7 * s); }
    }
    let drawSoon = false;               // coalesce: one redraw a frame, however many zoom or pan events
    const toWorld = (cx, cy) => {
      const b = canvas.getBoundingClientRect();
      return { x: (cx - b.left - t.x) / t.k, y: (cy - b.top - t.y) / t.k };
    };
    function zoomAt(factor, cx, cy) {
      const b = canvas.getBoundingClientRect();
      const px = cx - b.left, py = cy - b.top;
      const k = Math.max(zoomMin, Math.min(ZOOM_MAX, t.k * factor));
      t.x = px - (px - t.x) * k / t.k; t.y = py - (py - t.y) * k / t.k; t.k = k;
      applyTransform();
    }
    let needFit = true;                 // fit() ran while the map was hidden (no real size yet)
    function fit() {
      const shown = active.length ? active : nodes;
      if (!shown.length) return;
      needFit = !canvas.clientWidth;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const n of shown) {
        x0 = Math.min(x0, n.x - 20); x1 = Math.max(x1, n.x + Math.min(n.w, 220));
        y0 = Math.min(y0, n.y - 50); y1 = Math.max(y1, n.y + 20);
      }
      const w = canvas.clientWidth || 800, h = canvas.clientHeight || 600;
      const k = 0.92 * Math.min(w / (x1 - x0), h / (y1 - y0));
      zoomMin = Math.min(ZOOM_MIN, k);              // a big map can always be seen whole
      t.k = Math.max(zoomMin, Math.min(1.6, k));
      t.x = (w - (x0 + x1) * t.k) / 2; t.y = (h - (y0 + y1) * t.k) / 2;
      applyTransform();
    }
    function centerOn(n) {
      const w = canvas.clientWidth || 800, h = canvas.clientHeight || 600;
      t.x = w / 2 - n.x * t.k; t.y = h / 2 - n.y * t.k;
      applyTransform();
    }
    function ensureVisible(n) {         // centre on n only if it's off screen (or nearly)
      const w = canvas.clientWidth, h = canvas.clientHeight;
      const sx = t.x + n.x * t.k, sy = t.y + n.y * t.k, m = 40;
      if (w && h && (sx < m || sy < m || sx > w - m || sy > h - m)) centerOn(n);
    }
    // Something asked for n by name: the adapter makes sure it's shown.
    function reveal(n) { if (spec.reveal) spec.reveal(n, view); }

    // ---------- drawing ----------
    const px = v => v.toFixed(1) + "px";
    function draw() {
      const sz = sizes(), { z, s } = sz;
      for (const e of activeEdges) {
        const p = e.source, q = e.target;
        const dx = q.x - p.x, dy = q.y - p.y, l = Math.sqrt(dx * dx + dy * dy) || 1;
        const a = (p.r + 2) * s / l, b = (q.r * 1.3 + 3) * s / l;
        e.line.setAttribute("x1", p.x + dx * a); e.line.setAttribute("y1", p.y + dy * a);
        e.line.setAttribute("x2", q.x - dx * b); e.line.setAttribute("y2", q.y - dy * b);
      }
      const zl = Math.max(z, spec.labelMinScale || 0);
      const shown = spec.showLabel || spec.declutter ? labelsShown(z, zl) : null;
      for (const n of active) {
        n.g.setAttribute("transform", `translate(${n.x.toFixed(1)},${n.y.toFixed(1)}) scale(${s.toFixed(3)})`);
        const sx = t.x + n.x * t.k + (n.r + 5) * z, sy = t.y + n.y * t.k;
        if (shown) {
          const on = shown.has(n);
          if (n.el.hidden === on) n.el.hidden = !on;
          if (!on) continue;
        }
        n.el.style.transform = `translate(${px(sx)},${px(sy)}) translateY(-50%) scale(${zl.toFixed(3)})`;
      }
      if (spec.onDraw) spec.onDraw(view, sz);
    }

    // Which labels are drawn (with showLabel or declutter): those the adapter
    // allows, on screen, and (declutter) with room, in order of priority.
    // Zoomed out past FAR, only lit nodes' labels (as the CSS has it).
    function labelsShown(z, zl) {
      const W = canvas.clientWidth, H = canvas.clientHeight, m = 40, far = t.k < FAR;
      const out = [];
      for (const n of active) {
        if (far && !(litNow && litNow.has(n))) continue;
        if (spec.showLabel && !spec.showLabel(n, view)) continue;
        const x0 = t.x + n.x * t.k + (n.r + 5) * z, y = t.y + n.y * t.k;
        const w = Math.max(0, n.w - n.r - 5) * zl, h = 15 * zl;
        if (x0 > W + m || x0 + w < -m || y < -m || y > H + m) continue;
        out.push({ n, x0, x1: x0 + w, y0: y - h / 2, y1: y + h / 2 });
      }
      if (!spec.declutter) return new Set(out.map(c => c.n));
      const prio = spec.labelPriority || ((n, lit) => (n === focus || n === hover || n === compare ? 3 : lit && lit.has(n) ? 2 : 1));
      for (const c of out) c.p = prio(c.n, litNow, view);
      out.sort((a, b) => b.p - a.p);
      const CELL = 64, grid = new Map(), keep = new Set();
      const cells = (c, fn) => {
        for (let i = Math.floor(c.x0 / CELL); i <= Math.floor(c.x1 / CELL); i++)
          for (let j = Math.floor(c.y0 / CELL); j <= Math.floor(c.y1 / CELL); j++) if (fn(i + "," + j)) return true;
        return false;
      };
      for (const c of out) {
        const hit = cells(c, k => (grid.get(k) || []).some(o => c.x0 < o.x1 + 4 && o.x0 < c.x1 + 4 && c.y0 < o.y1 && o.y0 < c.y1));
        if (hit) continue;
        keep.add(c.n);
        cells(c, k => { (grid.get(k) || grid.set(k, []).get(k)).push(c); return false; });
      }
      return keep;
    }

    // ---------- highlighting and the card ----------
    let hover = null, focus = null, compare = null, picking = false, litNow = null;
    // Lit (unless the adapter says otherwise): on hover or focus, the node
    // and its direct neighbours; otherwise the search's matches. An arrow is
    // lit when both its ends are.
    function defaultLit({ hover, focus, matches }) {
      const n = focus || hover;
      if (n) return new Set([n, ...n.deps, ...n.users]);
      return matches;
    }
    function highlight() {
      const lit = (spec.lit || defaultLit)({ hover, focus, compare, picking, matches, view }) || null;
      litNow = lit;
      stage.classList.toggle("has-highlight", !!lit);
      for (const n of nodes) {
        for (const el of [n.g, n.el]) {
          el.classList.toggle("is-lit", !!lit && lit.has(n));
          el.classList.toggle("is-focus", n === focus);
          el.classList.toggle("is-hover", n === hover || n === current);
          if (spec.compare) el.classList.toggle("is-compare", n === compare);
        }
      }
      for (const e of edges) {
        const on = !!lit && lit.has(e.source) && lit.has(e.target);
        e.line.classList.toggle("is-lit", on);
        e.line.setAttribute("marker-end", on ? "url(#cm-arrow-lit)" : "url(#cm-arrow)");
      }
      if (spec.onHighlight) spec.onHighlight(view, lit);
      showCard(hover || focus || current);
      if (spec.showLabel || spec.declutter) draw();      // which labels show depends on what's lit
    }
    let shownInCard = null, cardFor = null;
    function showCard(n) {
      const key = n && spec.compare ? [n.id, focus && focus.id, compare && compare.id, picking].join(" ") : n;
      if (key === cardFor) return;
      cardFor = key; shownInCard = n;
      if (!n) { card.hidden = true; return; }
      card.hidden = false;
      card.textContent = "";
      if (spec.card) spec.card(n, card, view);
      else tag("p", null, card, String(n.label || n.id));
      withMathJax(mj => {
        if (shownInCard !== n) return;
        if (mj.typesetClear) mj.typesetClear([card]);
        return mj.typesetPromise([card]);
      });
    }

    // ---------- search ----------
    for (const n of nodes) n.text = (spec.searchText ? spec.searchText(n) : String(n.label || n.id)).toLowerCase();
    let matches = null, current = null;
    function search() {
      const words = searchBox.value.toLowerCase().split(/\s+/).filter(Boolean);
      matches = words.length ? new Set(active.filter(n => words.every(w => n.text.includes(w)))) : null;
      current = null;
      for (const n of nodes) if (n.li) n.li.classList.remove("is-current");
      countEl.textContent = !matches ? "" : matches.size === 1 ? "1 match" : (matches.size || "No") + " matches";
      highlight(); filterList();
    }
    function clearSearch() { searchBox.value = ""; search(); }
    function stepMatch(back) {                     // Enter / Shift+Enter: the next match, in the nodes' order
      const found = active.filter(n => matches.has(n));
      const i = found.indexOf(current);
      current = found[(i + (back ? -1 : 1) + found.length) % found.length];
      if (viewMode === "list") {
        for (const n of nodes) if (n.li) n.li.classList.toggle("is-current", n === current);
        current.li.scrollIntoView({ block: "center" });
      } else { centerOn(current); highlight(); }
    }
    function filterList() {
      if (!listEl) return;
      for (const n of nodes) if (n.li) n.li.hidden = !visible(n) || (!!matches && !matches.has(n));
      for (const sec of listEl.querySelectorAll(".cm-list-chapter")) sec.hidden = !sec.querySelector(".cm-list-item:not([hidden])");
    }
    // visible() changed: drop a focus that's now hidden, and redo what depends on it
    function refilter() {
      if (focus && !visible(focus)) setFocus(null);
      if (compare && !visible(compare)) compare = null;
      applyFilter(); search(); reheat(0); fit();
    }

    // ---------- views ----------
    let viewMode = "map";
    function setView(v) {
      viewMode = listEl ? v : "map";
      root.classList.toggle("is-list", viewMode === "list");
      stage.hidden = viewMode === "list";
      if (listEl) listEl.hidden = viewMode !== "list";
      if (viewMode === "map" && needFit) { fit(); if (focus) centerOn(focus); }
      mapBtn.setAttribute("aria-pressed", viewMode === "map");
      listBtn.setAttribute("aria-pressed", viewMode === "list");
      store.set("view", viewMode);
    }

    // ---------- full screen (or, where a browser can't, the whole window) ----------
    const isFull = () => document.fullscreenElement === root || root.classList.contains("is-expanded");
    function expand(on) {
      root.classList.toggle("is-expanded", on);
      document.documentElement.classList.toggle("cm-locked", on);
      fullChanged();
    }
    function setFull(on) {
      if (on && root.requestFullscreen) root.requestFullscreen().catch(() => expand(true));
      else if (on) expand(true);
      else if (document.fullscreenElement === root) document.exitFullscreen();
      else expand(false);
    }
    function fullChanged() {
      const on = isFull();
      root.classList.toggle("is-full", on);
      fullBtn.innerHTML = on ? ICON.leave : ICON.enter;
      fullBtn.setAttribute("aria-label", on ? "Leave full screen" : "Full screen");
      fullBtn.setAttribute("aria-pressed", on);
    }
    fullChanged();
    // When the drawing changes size (full screen, a window resize), keep what
    // was in the middle in the middle.
    let size = null;
    if (window.ResizeObserver) new ResizeObserver(() => {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (!w || !h) return;                        // hidden: the List view
      if (size) { t.x += (w - size.w) / 2; t.y += (h - size.h) / 2; applyTransform(); }
      size = { w, h };
    }).observe(stage);

    function setFocus(n, center) {
      focus = n;
      if (!n) { compare = null; if (picking) setPicking(false); }
      history.replaceState(null, "", n ? "#" + n.id : location.pathname + location.search);
      if (n) setTabStop(n);
      if (n && center) centerOn(n);
      highlight();
    }
    // The second selection, compared with the focus (spec.compare).
    function setCompare(n) {
      compare = n && n !== focus ? n : null;
      setPicking(false);
      highlight();
    }
    // "Compare with…": the next node chosen (click, tap, Enter) becomes the comparison.
    function setPicking(on) {
      picking = !!on && !!focus;
      stage.classList.toggle("is-picking", picking);
    }

    // ---------- keyboard ----------
    // The nodes share one Tab stop (a "roving" tabindex): Tab reaches the
    // current node; the arrow keys move through the others in order.
    let tabStop = null;
    function setTabStop(n) {
      if (!n || n === tabStop) return;
      if (tabStop) tabStop.g.setAttribute("tabindex", "-1");
      tabStop = n; n.g.setAttribute("tabindex", "0");
    }
    function moveTo(n) {
      if (!n) return;
      setTabStop(n); ensureVisible(n); n.g.focus();
    }

    // ---------- pointer and keyboard ----------
    // Shapes and labels both stand for their node.
    const nodeAt = el => {
      const h = el && el.closest ? el.closest(".cm-node, .cm-label") : null;
      return h ? byId.get(h.dataset.id) : null;
    };
    const inCard = el => !!(el && el.closest && el.closest(".cm-card"));
    const pointers = new Map();
    let gesture = null;   // { kind: "node" | "pan" | "pinch", … }
    stage.addEventListener("pointerdown", ev => {
      if (inCard(ev.target) || ev.button !== 0) return;
      stage.setPointerCapture(ev.pointerId);
      pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      if (pointers.size === 2) {
        const [p, q] = [...pointers.values()];
        gesture = { kind: "pinch", d: Math.hypot(p.x - q.x, p.y - q.y) };
        return;
      }
      const n = nodeAt(ev.target);
      gesture = { kind: n ? "node" : "pan", node: n, x: ev.clientX, y: ev.clientY, moved: false, shift: ev.shiftKey };
    });
    stage.addEventListener("pointermove", ev => {
      if (pointers.has(ev.pointerId)) pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      if (!gesture) return;
      if (gesture.kind === "pinch" && pointers.size === 2) {
        const [p, q] = [...pointers.values()];
        const d = Math.hypot(p.x - q.x, p.y - q.y);
        zoomAt(d / gesture.d, (p.x + q.x) / 2, (p.y + q.y) / 2);
        gesture.d = d;
        return;
      }
      const dx = ev.clientX - gesture.x, dy = ev.clientY - gesture.y;
      if (!gesture.moved && Math.hypot(dx, dy) < 4) return;
      if (!gesture.moved && gesture.kind === "node" && gesture.shift && spec.dragPieces) {
        // shift-drag: the node's whole connected piece moves with it, rigidly
        const start = toWorld(gesture.x, gesture.y);
        gesture.group = [...piece(gesture.node)].map(m => ({ m, ox: m.x - start.x, oy: m.y - start.y }));
      }
      gesture.moved = true;
      if (gesture.kind === "node") {
        const w = toWorld(ev.clientX, ev.clientY);
        if (gesture.group) {
          for (const { m, ox, oy } of gesture.group) { m.fx = w.x + ox; m.fy = w.y + oy; m.x = m.fx; m.y = m.fy; }
          draw();
          if (!reduceMotion) reheat(0.3);
          return;
        }
        gesture.node.fx = w.x; gesture.node.fy = w.y;
        if (reduceMotion) { gesture.node.x = w.x; gesture.node.y = w.y; draw(); }
        else reheat(0.3);
      } else if (gesture.kind === "pan") {
        t.x += dx; t.y += dy; gesture.x = ev.clientX; gesture.y = ev.clientY;
        applyTransform();
      }
    });
    function endGesture(ev) {
      if (!pointers.delete(ev.pointerId) || !gesture) return;
      if (gesture.kind === "pinch") { gesture = null; return; }   // lifting either finger ends a pinch
      if (gesture.kind === "node") {
        if (!gesture.moved) {
          if ((gesture.shift || picking) && spec.compare && focus) setCompare(gesture.node === compare ? null : gesture.node);
          else setFocus(gesture.node === focus ? null : gesture.node, false);
        }
        if (gesture.group) for (const { m } of gesture.group) m.fx = m.fy = null;
        gesture.node.fx = gesture.node.fy = null;
        sim.target = 0;
      } else if (gesture.kind === "pan" && !gesture.moved) {
        setFocus(null);
      }
      gesture = null;
    }
    stage.addEventListener("pointerup", endGesture);
    stage.addEventListener("pointercancel", endGesture);
    stage.addEventListener("wheel", ev => {
      if (inCard(ev.target)) return;                         // the card scrolls
      ev.preventDefault();
      zoomAt(Math.exp(-ev.deltaY * 0.0015), ev.clientX, ev.clientY);
    }, { passive: false });
    stage.addEventListener("pointerover", ev => {
      if (gesture && gesture.moved) return;
      const n = nodeAt(ev.target);
      if (n && n !== hover) { hover = n; highlight(); }
    });
    stage.addEventListener("pointerout", ev => {
      const n = nodeAt(ev.target);
      if (!n || n !== hover || nodeAt(ev.relatedTarget) === n) return;   // e.g. shape → its label
      hover = null; highlight();
    });
    nodeLayer.addEventListener("keydown", ev => {
      const n = nodeAt(ev.target);
      if (!n) return;
      const i = active.indexOf(n), last = active.length - 1;
      const next = { ArrowDown: i + 1, ArrowRight: i + 1, ArrowUp: i - 1, ArrowLeft: i - 1, Home: 0, End: last }[ev.key];
      if (next !== undefined) { ev.preventDefault(); moveTo(active[Math.max(0, Math.min(last, next))]); }
      else if ((ev.key === "Enter" || ev.key === " ") && (ev.shiftKey || picking) && spec.compare && focus) { ev.preventDefault(); setCompare(n === compare ? null : n); }
      else if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); setFocus(n === focus ? null : n, true); }
    });
    nodeLayer.addEventListener("focusin", ev => {
      const n = nodeAt(ev.target);
      if (n) { setTabStop(n); hover = n; highlight(); }
    });
    nodeLayer.addEventListener("focusout", () => { hover = null; highlight(); });
    // Esc: first the comparison, then the focus, then the search, then full
    // screen (a browser's own full screen ends on Esc by itself).
    document.addEventListener("keydown", ev => {
      if (ev.key !== "Escape") return;
      if (picking) { setPicking(false); highlight(); }
      else if (compare) setCompare(null);
      else if (focus) setFocus(null);
      else if (searchBox.value) clearSearch();
      else if (root.classList.contains("is-expanded")) setFull(false);
    });
    // searchDelay: search once typing pauses (Enter searches at once)
    let searchSoon = null;
    const searchNow = () => { if (searchSoon) { clearTimeout(searchSoon); searchSoon = null; search(); } };
    searchBox.addEventListener("input", spec.searchDelay
      ? () => { clearTimeout(searchSoon); searchSoon = setTimeout(() => { searchSoon = null; search(); }, spec.searchDelay); }
      : search);
    searchBox.addEventListener("keydown", ev => {
      if (ev.key === "Enter") searchNow();
      if (ev.key === "Enter" && matches && matches.size) { ev.preventDefault(); stepMatch(ev.shiftKey); }
      else if (ev.key === "Escape" && searchBox.value) { ev.preventDefault(); ev.stopPropagation(); clearSearch(); }
    });
    // Printing: the list, with every entry's details open (closed ones wouldn't print).
    let opened = [];
    window.addEventListener("beforeprint", () => {
      if (!listEl) return;
      opened = [...listEl.querySelectorAll("details:not([open])")];
      for (const d of opened) d.open = true;
    });
    window.addEventListener("afterprint", () => { for (const d of opened) d.open = false; opened = []; });
    mapBtn.addEventListener("click", () => setView("map"));
    listBtn.addEventListener("click", () => setView("list"));
    fullBtn.addEventListener("click", () => setFull(!isFull()));
    document.addEventListener("fullscreenchange", fullChanged);
    window.addEventListener("hashchange", () => {           // e.g. a link to #node-id on this page
      const n = byId.get(decodeURIComponent(location.hash.slice(1)));
      if (n && n !== focus) { setView("map"); reveal(n); setFocus(n, true); }
    });
    const zoomCenter = f => { const b = canvas.getBoundingClientRect(); zoomAt(f, b.left + b.width / 2, b.top + b.height / 2); };
    zoomIn.addEventListener("click", () => zoomCenter(1.3));
    zoomOut.addEventListener("click", () => zoomCenter(1 / 1.3));
    fitBtn.addEventListener("click", fit);
    // A new layout settles out of sight, then everything glides there.
    layoutPick.addEventListener("change", () => {
      layoutKey = layoutPick.value; layout = LAYOUTS[layoutKey];
      store.set("layout", layoutKey);
      if (sim.frame) { cancelAnimationFrame(sim.frame); sim.frame = null; }
      const from = active.map(n => [n.x, n.y]), t0 = { ...t };
      place();
      sim.alpha = 1; sim.target = 0;
      for (let i = 0, w = layout.warm != null ? layout.warm : WARM; i < w; i++) tick();
      const to = active.map(n => [n.x, n.y]);
      fit();
      if (reduceMotion) return;
      const t1 = { ...t }, start = performance.now(), GLIDE = 700;
      const step = now => {
        const u = Math.min(1, (now - start) / GLIDE), e = u < 0.5 ? 2 * u * u : 1 - 2 * (1 - u) * (1 - u);
        active.forEach((n, i) => { n.x = from[i][0] + (to[i][0] - from[i][0]) * e; n.y = from[i][1] + (to[i][1] - from[i][1]) * e; });
        t.x = t0.x + (t1.x - t0.x) * e; t.y = t0.y + (t1.y - t0.y) * e; t.k = t0.k * Math.pow(t1.k / t0.k, e);
        applyTransform();
        if (u < 1) sim.frame = requestAnimationFrame(step); else { sim.frame = null; run(); }
      };
      sim.frame = requestAnimationFrame(step);
    });

    // ---------- start ----------
    place();
    applyFilter();
    const warm = layout.warm != null ? layout.warm : reduceMotion ? WARM_REDUCED : WARM;   // settle most of the layout before showing it
    for (let i = 0; i < warm; i++) tick();
    const hash = decodeURIComponent(location.hash.slice(1));
    const fromHash = byId.get(hash);
    const listItem = listEl && hash.startsWith("cm-item-") && byId.get(hash.slice(8));
    if (fromHash) reveal(fromHash);
    setView(fromHash ? "map" : listItem ? "list" : store.get("view") || "map");
    fit();
    if (fromHash) setFocus(fromHash, true); else highlight();
    if (listItem) {                            // after the browser's own jump to the anchor
      const show = () => setTimeout(() => listItem.li.scrollIntoView({ block: "center" }), 0);
      if (document.readyState === "complete") show(); else window.addEventListener("load", show, { once: true });
    }
    if (!reduceMotion) run();
    return view;
  }

  window.GraphView = { create, svg, tag, storage, withMathJax, shapes: { circle, star } };
})();
