#!/usr/bin/env python3
"""roles.py — read _palette.scss's roles, and write tokens.tex.

The shared stylesheets and blocks.tex ask for colors by role
(var(--mk-block-info) on the web, mkBlockInfo in LaTeX). In _palette.scss,
$roles says which palette key plays each role, and $role-maps-light /
$role-maps-dark list the Sass maps those keys are looked up in, per mode.
_roles.scss publishes the result as --mk-* properties for the web; this
script does the rest:

    python3 roles.py        writes tokens.tex next to itself: every color
                            role as \\definecolor{mkBlockInfo}{HTML}{…}
                            (light mode; PDF has no dark mode), after
                            checking that every role used exists

Also imported by mermaid-classes.py. Run by tools/check-generated.sh.
"""
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
PALETTE = HERE / "_palette.scss"
OUT = HERE / "tokens.tex"


def _text() -> str:
    return re.sub(r"//.*", "", PALETTE.read_text())  # without // comments


def read_map(name: str) -> list[tuple[str, str]]:
    """The (key, value) pairs of the Sass map called $name, in order."""
    m = re.search(rf"\${re.escape(name)}:\s*\((.*?)\);", _text(), re.S)
    if not m:
        raise SystemExit(f"map ${name} not found in {PALETTE.name}")
    return [(k, v.strip('"')) for k, v in re.findall(r'"([\w-]+)":\s*([^,\s]+)', m.group(1))]


def mode_maps(mode: str) -> list[str]:
    """The names of the maps listed in $role-maps-<mode> (light or dark)."""
    m = re.search(rf"\$role-maps-{mode}:\s*\(([^)]*)\)", _text())
    if not m:
        raise SystemExit(f"$role-maps-{mode} not found in {PALETTE.name}")
    return re.findall(r"\$([\w-]+)", m.group(1))


def roles() -> list[tuple[str, str]]:
    """The (role, palette key) pairs of $roles."""
    return read_map("roles")


def resolve(mode: str = "light") -> dict[str, str]:
    """Each role's value in the given mode, e.g. {"block-info": "#04a5e5"}."""
    names = mode_maps(mode)
    values = {}
    for name in names:
        values |= dict(read_map(name))
    out = {}
    for role, key in roles():
        if key not in values:
            raise SystemExit(f'$roles: "{role}" is "{key}", which is not in ' + " or ".join("$" + n for n in names))
        out[role] = values[key]
    return out


def camel(role: str) -> str:
    """block-info -> mkBlockInfo, the role's LaTeX color name."""
    return "mk" + "".join(w.capitalize() for w in role.split("-"))


def check_used() -> None:
    """Every --mk-<role> and mk<Role> in the shared files must be in $roles."""
    known = {r for r, _ in roles()}
    latex = {camel(r) for r in known}
    missing = []
    for f in sorted(HERE.glob("_*.scss")) + sorted(HERE.glob("*.tex")):
        if f.name == "tokens.tex":
            continue
        text = f.read_text()
        # --mk-name, but not the start of an interpolated name (--mk-block-#{$name})
        for name in re.findall(r"--mk-([\w-]*\w)(?![\w#-])", text):
            if name not in known:
                missing.append(f"{f.name}: --mk-{name}")
        # color names (mkText), not commands (\mkSomething)
        for name in re.findall(r"(?<![\\\w])(mk[A-Z]\w*)", text):
            if name not in latex:
                missing.append(f"{f.name}: {name}")
    # The block loop in _blocks.scss builds --mk-block-<name> from $block-icons.
    blocks = re.search(r"\$block-icons:\s*\((.*?)\);", (HERE / "_blocks.scss").read_text(), re.S)
    if blocks:
        for name in re.findall(r'"([\w-]+)":', blocks.group(1)):
            if f"block-{name}" not in known:
                missing.append(f"_blocks.scss: block {name} (--mk-block-{name})")
    if missing:
        raise SystemExit("roles used but not defined in $roles (_palette.scss):\n  " + "\n  ".join(missing))


def latex() -> str:
    lines = ["% tokens.tex — GENERATED from _palette.scss by roles.py. Do not edit.",
             "% The colors the shared environments use ($roles), light mode: PDF has no dark mode."]
    for role, v in resolve("light").items():
        if v.startswith("#"):
            lines.append(f"\\definecolor{{{camel(role)}}}{{HTML}}{{{v.lstrip('#').upper()}}}")
    return "\n".join(lines) + "\n"


if __name__ == "__main__":
    check_used()
    resolve("dark")            # fail here, not in Sass, if a dark value is missing
    OUT.write_text(latex())
    print(f"wrote {OUT.name} ({len(roles())} roles)")
