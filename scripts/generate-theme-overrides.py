#!/usr/bin/env python3
"""
Generates src/styles/themes/overrides.css.

The app styles many surfaces with fixed Tailwind colours (zinc neutrals, amber warnings,
green/red status, mint accents). Those read well on the dark Mint theme but not on the
expressive themes. This script finds every colour utility used in src/ and writes one scoped
override per class that maps it to the active theme's tokens. Mint is excluded, so its look
is unchanged.

Run from the repo root after adding new colour classes:
    python3 scripts/generate-theme-overrides.py
"""

import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "src"
OUT = SRC / "styles" / "themes" / "overrides.css"

SCOPE = ':root:not([data-ui-theme="albatross-mint"])'

NEUTRALS = {"zinc", "stone", "slate", "gray", "neutral"}
WARN = {"amber", "yellow"}
SUCCESS = {"emerald", "green"}
DANGER = {"red"}
ACCENT = {"mint", "sky", "indigo", "violet"}
FAMILIES = NEUTRALS | WARN | SUCCESS | DANGER | ACCENT | {"white", "black"}

TOKEN_RE = re.compile(
    r"^(?:(hover|focus|focus-visible|active):)?"
    r"(bg|text|border|ring|outline)-"
    r"(" + "|".join(sorted(FAMILIES)) + r")"
    r"(?:-(\d{2,3}))?"
    r"(?:/(\d{1,3}))?$"
)

PROP = {
    "bg": "background-color",
    "text": "color",
    "border": "border-color",
    "ring": "--tw-ring-color",
    "outline": "outline-color",
}

STATE = {
    None: "",
    "hover": ":hover",
    "focus": ":focus",
    "focus-visible": ":focus-visible",
    "active": ":active",
}


def mix(base, alpha, fallback="transparent", percent=None):
    """Apply an opacity (Tailwind /NN) to a base colour."""
    if percent is None:
        if alpha is None:
            return base
        percent = int(alpha)
    return f"color-mix(in srgb, {base} {percent}%, {fallback})"


def resolve(prop, family, shade, alpha):
    """Return the CSS value for a token, or None if the token is not mapped."""
    shade_n = int(shade) if shade else None

    if family in NEUTRALS:
        if prop == "text":
            value = "var(--foreground)" if (shade_n or 0) in (0, 100, 200, 300, 700, 800, 900, 950) else "var(--muted-foreground)"
        elif prop == "bg":
            if shade_n in (900, 950):
                value = "var(--card)"
            elif shade_n == 800:
                value = "var(--muted)"
            else:
                value = "var(--secondary)"
        else:
            value = "var(--border)"
        return mix(value, alpha)

    if family == "white":
        if prop == "text":
            return "var(--ui-on-solid)"
        if prop == "bg":
            return mix("var(--foreground)", alpha) if alpha else "var(--card)"
        return "var(--border)"

    if family == "black":
        if prop == "text":
            return "var(--foreground)"
        if alpha is None:
            return None
        return mix("var(--foreground)", alpha)

    if family in WARN:
        if prop == "text":
            value = "var(--ui-on-warn)" if shade_n in (900, 950) else "var(--ui-warn-text)"
            return mix(value, alpha)
        if prop == "bg":
            if alpha is None:
                return "var(--ui-warn)" if shade_n in (400, 500, 600) or shade_n is None else "var(--card)"
            if shade_n is not None and shade_n >= 700:
                return mix("var(--ui-warn)", alpha, fallback="var(--card)", percent=int(alpha) // 4)
            return mix("var(--ui-warn)", alpha)
        return mix("var(--ui-warn)", alpha) if alpha else "var(--ui-warn)"

    if family in SUCCESS:
        if prop == "text":
            return mix("var(--ui-success-text)", alpha)
        if prop == "bg":
            if alpha is None:
                return "var(--ui-success)" if shade_n in (500, 600, 700) or shade_n is None else "var(--card)"
            if shade_n is not None and shade_n >= 800:
                return mix("var(--ui-success)", alpha, fallback="var(--card)", percent=int(alpha) // 4)
            return mix("var(--ui-success)", alpha)
        return mix("var(--ui-success)", alpha) if alpha else "var(--ui-success)"

    if family in DANGER:
        if prop == "text":
            return mix("var(--ui-danger-text)", alpha)
        return mix("var(--destructive)", alpha) if alpha else "var(--destructive)"

    if family in ACCENT:
        return mix("var(--primary)", alpha) if prop != "text" else mix("var(--primary)", alpha)

    return None


def collect_tokens():
    tokens = set()
    for path in SRC.rglob("*"):
        if path.suffix not in (".ts", ".tsx"):
            continue
        for match in re.finditer(r"[A-Za-z0-9:\-/\[\]\.\(\)%_]+", path.read_text(encoding="utf-8")):
            tokens.add(match.group(0))
    return tokens


def escape(token):
    return re.sub(r"([^A-Za-z0-9_-])", r"\\\1", token)


def main():
    rules = []
    unmapped = []
    for token in sorted(collect_tokens()):
        m = TOKEN_RE.match(token)
        if not m:
            continue
        state, kind, family, shade, alpha = m.groups()
        value = resolve(kind, family, shade, alpha)
        if value is None:
            unmapped.append(token)
            continue
        selector = f"{SCOPE} .{escape(token)}{STATE[state]}"
        rules.append(f"{selector} {{ {PROP[kind]}: {value}; }}")

    header = [
        "/*",
        " * GENERATED by scripts/generate-theme-overrides.py. Do not edit by hand.",
        " *",
        " * The app uses fixed Tailwind colours for neutrals, warnings, status and accents.",
        " * On the expressive themes (Bold, Yuzu, Sunset, Signal, Ledger, Clay) each class is",
        " * re-pointed at that theme's tokens. Albatross Mint is excluded and keeps its colours.",
        " */",
        "",
    ]
    body = "\n".join(rules) + "\n"
    footer = ""
    if unmapped:
        footer = "\n/* Not mapped (review by hand): " + ", ".join(unmapped) + " */\n"
    OUT.write_text("\n".join(header) + body + footer, encoding="utf-8")
    print(f"Wrote {len(rules)} rules to {OUT.relative_to(ROOT)}")
    if unmapped:
        print("Unmapped:", ", ".join(unmapped))


if __name__ == "__main__":
    main()
