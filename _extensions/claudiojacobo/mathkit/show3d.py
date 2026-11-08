"""
show3d.py — how 3D plots appear on the course website and in PDFs.

Part of the mathkit extension (cjgg has the same file). Loaded by the hidden
setup cell in sage-setup.qmd, next to this file, which a page with 3D plots
pulls in with Quarto's include shortcode (see mathkit's README, "Sage 3D
plots").
It changes only how 3D graphics are *displayed* during a Quarto render. The
code students see and copy is ordinary Sage: in their own Sage, show(...)
opens the usual interactive viewer.

For each 3D plot passed to show():
  1. the interactive viewer is saved to 3d/<id>.html next to the page, with
     three.js loaded from a CDN instead of embedded (tens of KB, not MB, of
     library per plot; the mesh itself is still in the file);
  2. a still image is ray-traced with Tachyon and shown as a JPEG, picking up
     the cell's fig-alt and fig-cap;
  3. an "Explore in 3D ↗" link opens the viewer in a new tab. The extension
     merges it into the image (figure-links.lua: the image becomes the link,
     with a corner badge, so side-by-side layouts stay intact) and points it
     at the published site in PDF (site-links.lua). The project must publish
     the viewers (resources: "**/3d/*.html") and set site-url.
<id> is computed from the plot itself, so unchanged plots keep their files.

The still is taken from the same camera the viewer opens with. To choose
another view, open the viewer, turn the plot, click ⓘ (bottom right) →
"Get camera", and paste what it copies into a #hide line just before show(),
deleting the comma at its start:
    view3d(camera_position=[6.3422,4.6079,4.5261])   #hide
The viewer then opens looking the same way. "Get viewpoint" works too:
    view3d(viewpoint=[[-0.2469,-0.4845,-0.8392],133.7])   #hide
Other options: zoom (1 = the viewer's framing), light_position, point_scale,
aspect_ratio, shade, figsize, antialiasing; rarely, viewdir and updir.
See mathkit's README for the table, and CAMERA below for the details.

Needs the Tachyon program on PATH (brew install dimpase/tap/tachyon on macOS;
Sage's macOS app doesn't include it).

Covers show(g) and g.show(). Not covered: a 3D plot left as the last
expression of a cell, which falls back to Sage's normal interactive viewer;
end such cells with show(...).
"""
import hashlib
import io
import math
import os
import pathlib
import shutil
import tempfile

from IPython.display import Image, Markdown, display
from PIL import Image as PILImage
from sage.plot.plot3d.base import Graphics3d
try:  # where Sage defines its global show()
    from sage.repl.rich_output.pretty_print import show as _sage_show
except ImportError:
    from sage.all import show as _sage_show

# Tachyon settings used unless a cell overrides them.
STILL_DEFAULTS = dict(
    antialiasing=True,
    figsize=12,                      # 1200 × 1200 px before cropping; always square (see _square_figsize)
    shade="medium",                  # no cast shadows (the interactive viewer has none either)
)
JPEG_QUALITY = 85
# How big a still prints in the PDF: its longest side, in inches. It is stored
# in the JPEG as a resolution (dots per inch), which LaTeX reads to size the
# image (a narrower column still shrinks it to fit). Browsers ignore it, so
# web pages are unaffected. Without it LaTeX takes 72 pixels per inch, and a
# still would fill the page width.
PDF_INCHES = 4

# CAMERA. Read from Sage's source (sage/plot/plot3d/base.pyx and
# sage/ext_data/threejs/threejs_template.html).
#
# The viewer's coordinates are plot coordinates times aspect_ratio. It looks
# at the centre of the plot's box, with z up, through a 45° lens (top to
# bottom). It opens with the camera 60° down from the z-axis and 36° round
# from the x-axis, at the distance where the sphere around the box just fits
# the lens. "Get camera" copies the camera's position in these coordinates.
# "Get viewpoint" copies a rotation, [axis], angle in degrees, that turns the
# view from straight above into the current view; it fixes the direction
# only, and the camera stays at the opening distance.
#
# Tachyon's coordinates: Sage moves the centre of the box to the origin and
# scales it so its longest side is 2. That is a shift and a uniform scale,
# so a position converts as
#     tachyon = (viewer position − centre) × 2 / (longest side)
# and directions don't change. Tachyon's zoom is a lens: zoom 1 sees 90°, so
# the viewer's 45° is zoom = tan(45°) / tan(22.5°) ≈ 2.41.
#
# The viewer's light sits 5 units left of and 3 above the camera, in the
# camera's own frame, and shines at the centre; the still's light goes in
# the same place, so whatever side faces you is lit as in the viewer.
VIEWER_LENS = 45                     # degrees, top to bottom
VIEWER_START = (60, 36)              # degrees: down from the z-axis, round from the x-axis
VIEWER_LIGHT = (-5, 3)               # right, up of the camera, in viewer units

# POINTS. How each viewer sizes them:
#   • interactive viewer (three.js): a flat disc that looks about size/240
#     plot units across (diameter size/100, seen through a 45° perspective
#     camera), so its share of the plot shrinks as the plot's ranges grow;
#   • Tachyon: a shaded ball of radius size/200 in Sage's rescaled box,
#     whose longest side is 2, whatever the plot's ranges.
# To make a still's ball take the same share of the plot as the viewer's
# disc, its size becomes  size * 200 / (240 * E),  where E is the longest
# side of the plot in plot units (after aspect_ratio).
# POINT_SCALE multiplies that: 1 = same as the viewer's starting view;
# a bit larger reads better in a still, which can't be zoomed.
POINT_SCALE = 1.5
CROP_MARGIN = 0.04                   # whitespace kept around the plot, as a fraction

# Options that only make sense for the interactive viewer, never for Tachyon.
_VIEWER_ONLY = {"online", "viewer", "point_scale", "viewpoint"}
_pending = {}

_TACHYON_MISSING = (
    "show3d: the Tachyon ray tracer (program `tachyon`) isn't installed, so 3D "
    "stills can't be made. Install it once per machine with\n"
    "    brew install dimpase/tap/tachyon\n"
    "then check with `which tachyon`. (Sage's macOS app doesn't include it; "
    "see mathkit's README.)")


def _ensure_tachyon():
    """Sage runs Tachyon as a separate program named `tachyon`. Kernels started
    by Quarto may not have Sage's own program folders on PATH, so look there
    before giving up."""
    if shutil.which("tachyon"):
        return
    try:
        from sage import env
        roots = [getattr(env, name, None) for name in ("SAGE_LOCAL", "SAGE_VENV")]
    except ImportError:
        roots = []
    for root in filter(None, roots):
        folder = os.path.join(root, "bin")
        if os.path.exists(os.path.join(folder, "tachyon")):
            os.environ["PATH"] = folder + os.pathsep + os.environ.get("PATH", "")
            return
    raise RuntimeError(_TACHYON_MISSING)


# --- small vector helpers (plain tuples, so this file needs no numpy) -------

def _dot(u, v):
    return sum(a * b for a, b in zip(u, v))


def _cross(u, v):
    return (u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0])


def _norm(v):
    return math.sqrt(_dot(v, v))


def _unit(v):
    n = _norm(v)
    return tuple(c / n for c in v)


def _rotate(v, axis, degrees):
    """v turned by `degrees` about `axis` (Rodrigues' formula)."""
    k = _unit([float(c) for c in axis])
    t = math.radians(float(degrees))
    c, s = math.cos(t), math.sin(t)
    kxv, kv = _cross(k, v), _dot(k, v)
    return tuple(v[i] * c + kxv[i] * s + k[i] * kv * (1 - c) for i in range(3))


# --- camera -----------------------------------------------------------------

def _viewpoint(direction):
    """The viewer's `viewpoint` option that opens it looking from `direction`
    (a unit vector from the centre towards the camera). The viewer places its
    camera at  (rotation by −angle about axis) applied to the z-axis; turning
    the z-axis straight towards `direction` is a turn about z × direction."""
    n = _cross((0, 0, 1), direction)
    if _norm(n) < 1e-9:                     # straight above or below
        return None if direction[2] > 0 else [[1.0, 0.0, 0.0], 180.0]
    n = _unit(n)
    angle = math.degrees(math.acos(max(-1.0, min(1.0, direction[2]))))
    return [[round(-c, 4) + 0.0 for c in n], round(angle, 2)]   # + 0.0 turns -0.0 into 0.0


def _camera(graphic, aspect, opts):
    """Tachyon settings that reproduce a view of the interactive viewer.

    Takes the camera options (camera_position, viewpoint, zoom,
    light_position, viewdir, updir) out of `opts`, all in viewer
    coordinates. Returns (options for Tachyon, `viewpoint` for the viewer or
    None to keep its opening view).
    """
    lo, hi = graphic.bounding_box()
    centre = [aspect[i] * (float(lo[i]) + float(hi[i])) / 2 for i in range(3)]
    sides = [aspect[i] * (float(hi[i]) - float(lo[i])) for i in range(3)]
    scale = 2 / max(max(sides), 1e-9)                        # viewer units → Tachyon units
    distance = _norm(sides) / 2 / math.sin(math.radians(VIEWER_LENS / 2))

    position = opts.pop("camera_position", None)
    viewpoint = opts.pop("viewpoint", None)
    if position is not None:                                 # pasted from "Get camera"
        offset = [float(position[i]) - centre[i] for i in range(3)]
        if viewpoint is None:
            viewpoint = _viewpoint(_unit(offset))
    else:
        if viewpoint is not None:                            # pasted from "Get viewpoint"
            axis, angle = viewpoint
            direction = _rotate((0, 0, 1), axis, -float(angle))
        else:                                                # the viewer's opening view
            down, around = (math.radians(t) for t in VIEWER_START)
            direction = (math.sin(down) * math.cos(around),
                         math.sin(down) * math.sin(around),
                         math.cos(down))
        offset = [distance * c for c in direction]
    camera = tuple(scale * c for c in offset)

    light = opts.pop("light_position", None)
    if light is not None:
        light = tuple(scale * (float(light[i]) - centre[i]) for i in range(3))
    else:
        forward = _unit([-c for c in camera])
        right = _cross(forward, (0, 0, 1))
        right = _unit(right) if _norm(right) > 1e-9 else (1.0, 0.0, 0.0)
        up = _cross(right, forward)
        lr, lu = VIEWER_LIGHT[0] * aspect[0], VIEWER_LIGHT[1] * aspect[1]
        light = tuple(camera[i] + scale * (lr * right[i] + lu * up[i]) for i in range(3))

    tachyon = dict(
        camera_position=camera,
        viewdir=tuple(float(c) for c in opts.pop("viewdir", [-c for c in camera])),
        updir=tuple(float(c) for c in opts.pop("updir", (0, 0, 1))),
        light_position=light,
        zoom=float(opts.pop("zoom", 1)) / math.tan(math.radians(VIEWER_LENS / 2)),
    )
    return tachyon, viewpoint


# --- other helpers ----------------------------------------------------------

def _points(graphic):
    """Every point primitive in a (possibly nested) 3D scene."""
    stack = [graphic]
    while stack:
        g = stack.pop()
        children = getattr(g, "all", None)
        if children:
            stack.extend(children)
        elif type(g).__name__ == "Point" and hasattr(g, "size"):
            yield g


def _aspect(graphic, kwds):
    """Aspect multipliers (ax, ay, az) the viewer would use."""
    ar = kwds.get("aspect_ratio", (graphic._extra_kwds or {}).get("aspect_ratio"))
    if ar in (None, "automatic", "auto"):
        return (1.0, 1.0, 1.0)
    if not isinstance(ar, (list, tuple)):
        return (float(ar),) * 3
    return tuple(float(a) for a in ar)


def _extent(graphic, aspect):
    """Longest side of the plot's box, in plot units scaled by aspect_ratio."""
    (x0, y0, z0), (x1, y1, z1) = graphic.bounding_box()
    sides = [float(x1 - x0), float(y1 - y0), float(z1 - z0)]
    return max(max(a * s for a, s in zip(aspect, sides)), 1e-9)


def _square_figsize(fs):
    """Tachyon's resolution is 100*figsize, in whole pixels, and the image is
    kept square: for a non-square figsize Sage also sets Tachyon's
    `aspectratio`, but Tachyon already accounts for the image's shape, so the
    picture comes out stretched (12×9 made plots a third too tall). Cropping
    removes the extra white anyway."""
    if isinstance(fs, (list, tuple)):
        fs = max(fs)
    n = int(round(float(fs)))
    return [n, n]


def _has_own_aspect(graphic, kwds):
    """True if the plot or the show() call already chose an aspect ratio."""
    ar = kwds.get("aspect_ratio", (graphic._extra_kwds or {}).get("aspect_ratio"))
    return ar not in (None, "automatic", "auto")


def _crop(img):
    """Trim the white border Tachyon leaves around the plot, keeping a margin."""
    from PIL import ImageChops
    bg = PILImage.new("RGB", img.size, (255, 255, 255))
    box = ImageChops.difference(img, bg).convert("L").point(lambda v: 255 if v > 8 else 0).getbbox()
    if not box:
        return img
    m = int(CROP_MARGIN * max(img.size))
    return img.crop((max(box[0] - m, 0), max(box[1] - m, 0),
                     min(box[2] + m, img.width), min(box[3] + m, img.height)))


def view3d(**options):
    """Settings for the next 3D plot passed to show(). Use on a #hide line."""
    _pending.update(options)


def _project_root() -> pathlib.Path:
    here = pathlib.Path.cwd()
    for p in [here, *here.parents]:
        if (p / "_quarto.yml").exists():
            return p
    return here


def _show3d(graphic, **kwds):
    pending = dict(_pending)
    _pending.clear()
    opts = {**kwds, **pending}
    point_scale = POINT_SCALE * opts.pop("point_scale", 1)
    aspect = _aspect(graphic, opts)
    camera, viewpoint = _camera(graphic, aspect, opts)

    still_opts = {**STILL_DEFAULTS, **opts, **camera}
    for k in _VIEWER_ONLY:
        still_opts.pop(k, None)
    if not _has_own_aspect(graphic, opts):
        still_opts["aspect_ratio"] = 1   # the viewer's default; Tachyon's own default stretches to a cube
    still_opts["figsize"] = _square_figsize(still_opts["figsize"])

    # The viewer gets the show() call's own options, plus the view and any
    # aspect ratio chosen with view3d, so that it matches the still.
    viewer_opts = {k: v for k, v in kwds.items() if k != "viewer"}
    if "aspect_ratio" in pending:
        viewer_opts["aspect_ratio"] = pending["aspect_ratio"]
    if viewpoint:
        viewer_opts["viewpoint"] = viewpoint

    outdir = pathlib.Path.cwd() / "3d"
    outdir.mkdir(exist_ok=True)

    with tempfile.TemporaryDirectory() as tmp:
        tmp = pathlib.Path(tmp)

        # 1. Interactive viewer, named by its contents.
        graphic.save(str(tmp / "viewer.html"), online=True, **viewer_opts)
        html = (tmp / "viewer.html").read_bytes()
        name = hashlib.sha1(html).hexdigest()[:12]
        target = outdir / f"{name}.html"
        if not target.exists():
            target.write_bytes(html)

        # 2. Still image: shrink points for Tachyon (restored afterwards),
        #    render PNG, crop the white border, convert to JPEG.
        _ensure_tachyon()
        points = list(_points(graphic))
        original = [pt.size for pt in points]
        extent = _extent(graphic, aspect)
        try:
            for pt in points:
                pt.size = pt.size * point_scale * 200 / (240 * extent)
            graphic.save(str(tmp / "still.png"), viewer="tachyon", **still_opts)
        finally:
            for pt, size in zip(points, original):
                pt.size = size
        img = _crop(PILImage.open(tmp / "still.png").convert("RGB"))
        buf = io.BytesIO()
        dpi = max(img.size) / PDF_INCHES
        img.save(buf, "JPEG", quality=JPEG_QUALITY, optimize=True, dpi=(dpi, dpi))

    # 3. Image (Quarto applies the cell's fig-alt / fig-cap), then the link.
    display(Image(data=buf.getvalue(), format="jpeg"))
    site_path = target.relative_to(_project_root()).as_posix()
    display(Markdown(
        f'[Explore in 3D ↗](3d/{name}.html)'
        f'{{.site-link .figure-link .explore-3d site-path="{site_path}" target="_blank"}}'))


def show(obj, *args, **kwds):
    """Sage's show(), except that 3D graphics get a still image + viewer link."""
    if isinstance(obj, Graphics3d):
        return _show3d(obj, **kwds)
    return _sage_show(obj, *args, **kwds)


# g.show() (the method form) hands the plot to Sage's display manager, so
# intercept 3D graphics there too. Guarded so loading this file twice in one
# kernel doesn't wrap the wrapper.
from sage.repl.rich_output import get_display_manager as _get_dm

_dm = _get_dm()
if not hasattr(_dm, "_show3d_original_display_immediately"):
    _dm._show3d_original_display_immediately = _dm.display_immediately

    def _display_immediately(obj, **kwds):
        if isinstance(obj, Graphics3d):
            return _show3d(obj, **kwds)
        return _dm._show3d_original_display_immediately(obj, **kwds)

    _dm.display_immediately = _display_immediately
