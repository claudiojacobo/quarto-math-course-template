#!/usr/bin/env python3
"""Generate mermaid-classes.mmd from _cells.scss and _palette.scss.

Mermaid node classes (A("x = 1"):::solution) are styled by the
`svg.mermaid-js .node.<class>` rules in _cells.scss. Those rules only reach
diagrams drawn in a browser on the site. For PDF, Quarto draws each diagram
in a headless browser before any filter runs, on a bare page that never sees
the site's CSS, so the classes have no effect there.

The one thing that reaches that page is the diagram's own text. So this
script copies the class rules into a mermaid `init` directive (themeCSS), and
a diagram that uses the classes includes it as its last line:

    {{< include /_extensions/claudiojacobo/mathkit/mermaid-classes.mmd >}}

(cjgg instead of mathkit in a site using the cjgg extension.)

Every colour keeps its CSS variable (a role; see $roles in _palette.scss),
with the light-mode value as a fallback:
    var(--mk-diagram-solution, #40a02b)
On the site the variables exist, so diagrams follow light and dark mode as
before; on the PDF's bare page they don't, so the light-mode colours are used.
(A diagram's own themeCSS replaces the default one Quarto gives web diagrams;
the only part of that not already in _cells.scss is the label font, so that
is carried over too.)

(Not `classDef`: mermaid writes classDef styles onto each shape as inline
!important styles, which no stylesheet can override, so dark mode would get
light-mode fills.)

Usage:  python3 mermaid-classes.py     (writes next to itself)
"""
import json
import re
import sys
from pathlib import Path

sys.dont_write_bytecode = True        # no __pycache__ in the extension folder
sys.path.insert(0, str(Path(__file__).resolve().parent))
import roles  # noqa: E402  (roles.py, next to this script)

HERE = Path(__file__).resolve().parent
OUT = HERE / "mermaid-classes.mmd"


def class_rules() -> list[tuple[str, str]]:
    text = re.sub(r"/\*.*?\*/", "", (HERE / "_cells.scss").read_text(), flags=re.S)
    rules = re.findall(r"svg\.mermaid-js\s+(\.node\.[\w-]+[^{]*?)\s*\{([^}]*)\}", text)
    if not rules:
        raise SystemExit("no `svg.mermaid-js .node.<class>` rules found in _cells.scss")
    return rules


def main() -> None:
    colours = roles.resolve()   # light mode

    def with_fallback(m: re.Match) -> str:
        name = m.group(1)
        if name not in colours or not colours[name].startswith("#"):
            raise SystemExit(f"--mk-{name} is not a color role in $roles (_palette.scss)")
        return f"var(--mk-{name}, {colours[name]})"

    css, names = [], []
    for selector, body in class_rules():
        body = re.sub(r"var\(--mk-([\w-]+)\)", with_fallback, body)
        body = " ".join(body.split())
        css.append(f"{selector} {{ {body} }}")
        names.append(selector.split(".")[2].split()[0])

    # A diagram's themeCSS replaces the one Quarto sets on web pages, whose
    # only effect not already covered by _cells.scss is the label font: keep
    # it (on the PDF's bare page the variables are missing, so `inherit`).
    css.append(".label, .nodeLabel, .cluster span { "
               "font-family: var(--mermaid-font-family, inherit); "
               "font-weight: var(--mermaid-font-weight, inherit); }")

    # Mermaid turns ' into " inside directives, and drops a themeCSS that
    # contains < or >; neither occurs in these rules.
    css_text = " ".join(css)
    assert "'" not in css_text and "<" not in css_text and ">" not in css_text
    directive = "%%{init: " + json.dumps({"themeCSS": css_text}, ensure_ascii=False) + "}%%"
    OUT.write_text(
        "%% GENERATED from _cells.scss and _palette.scss by mermaid-classes.py; do not edit.\n"
        f"%% Node classes: {', '.join(names)}.\n"
        + directive + "\n")
    print(f"wrote {OUT.name}: {len(names)} classes ({', '.join(names)})")


if __name__ == "__main__":
    main()
