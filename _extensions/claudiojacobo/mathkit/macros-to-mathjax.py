#!/usr/bin/env python3
"""Generate mathjax-config.html from macros.tex.

LaTeX macro definitions are the single source of truth (macros.tex). The PDF
format reads that file directly as a preamble. For HTML, MathJax wants the
same macros as a JavaScript object, which this script writes into
mathjax-config.html together with the loader/output settings. The result is
included in the <head> of every page by the HTML format, so pages no
longer need `{{< include _macros.qmd >}}`.

Supported input (one definition per line is easiest, but not required):

    \\providecommand{\\Name}{body}
    \\newcommand{\\Name}[2]{body with #1 and #2}
    \\renewcommand{\\Name}[2][default]{body}     one optional first argument

Usage:  python3 macros-to-mathjax.py            (writes next to itself)
"""
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
SRC = HERE / "macros.tex"
OUT = HERE / "mathjax-config.html"

DEF_RE = re.compile(r"\\(?:provide|new|renew)command\{\\([A-Za-z]+)\}")


def read_braced(text: str, i: int) -> tuple[str, int]:
    """text[i] must be '{'. Return (contents, index after the matching '}')."""
    assert text[i] == "{", f"expected '{{' at {i}"
    depth, j = 0, i
    while j < len(text):
        c = text[j]
        if c == "\\":          # skip escaped character
            j += 2
            continue
        if c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0:
                return text[i + 1:j], j + 1
        j += 1
    raise SystemExit(f"unbalanced braces starting at offset {i}")


def parse(text: str) -> dict:
    # strip comments (a % not preceded by a backslash)
    text = re.sub(r"(?<!\\)%.*", "", text)
    macros: dict[str, object] = {}
    for m in DEF_RE.finditer(text):
        name, i = m.group(1), m.end()
        nargs, default = 0, None
        # optional [n]
        om = re.match(r"\s*\[(\d+)\]", text[i:])
        if om:
            nargs, i = int(om.group(1)), i + om.end()
            # optional [default] for the first argument
            dm = re.match(r"\s*\[([^\]]*)\]", text[i:])
            if dm:
                default, i = dm.group(1), i + dm.end()
        # skip whitespace to the body
        while text[i].isspace():
            i += 1
        body, _ = read_braced(text, i)
        body = " ".join(body.split())  # collapse newlines/indentation
        if nargs == 0:
            macros[name] = body
        elif default is None:
            macros[name] = [body, nargs]
        else:
            macros[name] = [body, nargs, default]
    return macros


# Names that already exist in LaTeX. \providecommand on these silently keeps
# the LaTeX one, so PDF and HTML would differ; such macros must use \renewcommand.
LATEX_BUILTINS = {"vector", "arg", "ker", "deg", "dim", "hom", "det", "exp", "lim",
                  "max", "min", "sup", "inf", "Re", "Im", "Pr", "gcd", "log", "ln"}


def main() -> None:
    text = SRC.read_text()
    for m in re.finditer(r"\\providecommand\{\\([A-Za-z]+)\}", text):
        if m.group(1) in LATEX_BUILTINS:
            print(f"warning: \\providecommand{{\\{m.group(1)}}} will be ignored by LaTeX "
                  f"(name already defined); use \\renewcommand", file=sys.stderr)
    macros = parse(text)
    if not macros:
        sys.exit("no macros found in macros.tex")
    # MathJax takes the macro table as plain JSON; backslashes in bodies
    # must be escaped once for the JavaScript string literal.
    table = json.dumps(macros, indent=2, ensure_ascii=False)
    html = f"""<!-- GENERATED from macros.tex by macros-to-mathjax.py. Do not edit; edit macros.tex. -->
<script>
  window.MathJax = {{
    loader: {{load: ['[tex]/mathtools', '[tex]/colortbl']}},
    tex: {{
      packages: {{'[+]': ['mathtools', 'colortbl']}},
      // {len(macros)} macros, shared with the PDF preamble via macros.tex,
      // then the project's own (macros.tex at its root; project-macros.lua)
      macros: Object.assign({table}, window.mkProjectMacros || {{}})
    }},
    output: {{
      // Let long display equations wrap on narrow screens (MathJax 4).
      // Readers can override per page: right-click an equation →
      // Math Settings → Wide Expressions.
      displayOverflow: 'linebreak',
      linebreaks: {{ inline: true, width: '100%', lineleading: 0.2 }}
    }}
  }};
</script>
"""
    OUT.write_text(html)
    print(f"wrote {OUT.name}: {len(macros)} macros")


if __name__ == "__main__":
    main()
