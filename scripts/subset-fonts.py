# Font subsetting pipeline (editing-time tool — never runs in the build).
#
# SOURCES AND LICENCE. Both faces are SIL Open Font License 1.1:
#
#   Pretendard      Kil Hyung-jin — https://github.com/orioncactus/pretendard
#                   licence: licenses/Pretendard-OFL.txt
#                   (upstream: .../pretendard/main/LICENSE)
#   Noto Serif KR   Adobe / Google — https://github.com/notofonts/noto-cjk
#                   licence: licenses/NotoSerifKR-OFL.txt
#                   (upstream: .../noto-cjk/main/Serif/LICENSE)
#
# WHAT THIS SCRIPT PRODUCES IS A MODIFIED VERSION in the OFL's sense — SIL's
# own FAQ 2.6 says subsetting a webfont is modification — which is why the
# licence copies are in the repository at all: OFL section 2 conditions
# redistribution of a modified font on shipping the notice and the licence
# with it. Read licenses/README.md before changing anything here; it also
# records the UNRESOLVED Reserved Font Name question on 'Pretendard'.
#
# Produces the three self-hosted woff2 files the design system requires
# (tokens.md §3: Pretendard Variable ×1 + Noto Serif KR 400/700 ×2, total
# budget < 1.5MB, CDN forbidden):
#
#   public/fonts/PretendardVariable-sub.woff2
#   public/fonts/NotoSerifKR-400-sub.woff2
#   public/fonts/NotoSerifKR-700-sub.woff2
#
# Glyph coverage: KS X 1001 Hangul syllables (the 2,350 EUC-KR-encodable
# syllables — derived programmatically, not hardcoded), ASCII, Latin-1
# supplement (é for artist names), general punctuation, and the exact symbols
# the UI micro-copy uses (↗ → ● ©). Rebuild + rerun if new glyphs appear.
#
# Also emits TTF siblings into src/assets/fonts/ for satori (Pretendard as a static 400 instance) (OG cards):
# satori cannot read woff2, and these build-only files never ship in dist.
#
# Usage:  python scripts/subset-fonts.py <PretendardVariable.ttf> <NotoSerifKR[wght].ttf>
# Deps :  pip install fonttools brotli
import sys
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

ROOT = Path(__file__).resolve().parent.parent
OUT_WEB = ROOT / "public" / "fonts"
OUT_BUILD = ROOT / "src" / "assets" / "fonts"


def ksx1001_hangul() -> set[str]:
    """The 2,350 KS X 1001 syllables.

    Python's euc_kr codec silently covers the full CP949 extension (all
    11,172 syllables), so mere encodability is NOT the test: a KS X 1001
    syllable is one whose CP949 bytes fall in the two-byte EUC range
    lead 0xB0-0xC8 / trail 0xA1-0xFE."""
    out = set()
    for code in range(0xAC00, 0xD7A4):
        ch = chr(code)
        try:
            b = ch.encode("cp949")
        except UnicodeEncodeError:
            continue
        if len(b) == 2 and 0xB0 <= b[0] <= 0xC8 and 0xA1 <= b[1] <= 0xFE:
            out.add(ch)
    return out


def charset() -> str:
    chars = set()
    chars.update(chr(c) for c in range(0x20, 0x7F))        # ASCII
    chars.update(chr(c) for c in range(0xA0, 0x100))       # Latin-1 (é, ©, ·)
    chars.update("‐–—‘’“”•…′″↗→↘←●○◦" )                    # punctuation + UI symbols
    chars.update(ksx1001_hangul())
    return "".join(sorted(chars))


def run_subset(src: Path, dest: Path, text: str, flavor: str | None) -> int:
    # Lean flags: default layout-feature list (a wildcard pulls in huge CJK
    # feature closures), no glyph names, no hinting — CJK outlines are
    # effectively unhinted anyway and hints cost hundreds of KB.
    #
    # --name-IDs KEEPS 13 AND 14 (licence description, licence URL) ON TOP OF
    # the subsetter's default 0-6. The default DROPS them, and it had: the
    # three font files committed here carry a copyright line and no licence
    # record at all. OFL section 2 wants the notice travelling with the font,
    # and SIL's Functional Equivalence criteria (FAQ 2.8) name licence
    # metadata explicitly. Cost is a few KB per file against a 1536KB budget
    # — nothing worth trading a licence notice for.
    args = [
        str(src),
        f"--output-file={dest}",
        f"--text={text}",
        "--name-IDs+=13,14",
        "--no-hinting",
        "--desubroutinize",
        "--notdef-outline",
        "--drop-tables+=DSIG",
    ]
    if flavor:
        args.append(f"--flavor={flavor}")
    subset.main(args)
    return dest.stat().st_size


def instance_weight(src: Path, weight: int, dest: Path) -> None:
    font = TTFont(str(src))
    instantiateVariableFont(font, {"wght": weight}, inplace=True)
    font.save(str(dest))


def main() -> None:
    if len(sys.argv) != 3:
        print("usage: python scripts/subset-fonts.py <PretendardVariable.ttf> <NotoSerifKR[wght].ttf>")
        sys.exit(1)
    pretendard, noto = Path(sys.argv[1]), Path(sys.argv[2])
    OUT_WEB.mkdir(parents=True, exist_ok=True)
    OUT_BUILD.mkdir(parents=True, exist_ok=True)
    text = charset()
    print(f"charset: {len(text)} chars")

    sizes = {}
    # Pretendard stays variable for the web (single file, whole weight axis)…
    sizes["PretendardVariable-sub.woff2"] = run_subset(
        pretendard, OUT_WEB / "PretendardVariable-sub.woff2", text, "woff2"
    )
    # …but satori chokes on variable TTFs ("reading '256'" crash) — the
    # build-side copy must be a static 400 instance.
    inst400 = OUT_BUILD / "Pretendard-inst400.ttf"
    instance_weight(pretendard, 400, inst400)
    run_subset(inst400, OUT_BUILD / "Pretendard-400-sub.ttf", text, None)
    inst400.unlink()

    # Noto Serif KR: static 400/700 instances (only weights the system uses).
    for weight in (400, 700):
        inst = OUT_BUILD / f"NotoSerifKR-{weight}.ttf"
        instance_weight(noto, weight, inst)
        sizes[f"NotoSerifKR-{weight}-sub.woff2"] = run_subset(
            inst, OUT_WEB / f"NotoSerifKR-{weight}-sub.woff2", text, "woff2"
        )
        run_subset(inst, OUT_BUILD / f"NotoSerifKR-{weight}-sub.ttf", text, None)
        inst.unlink()  # keep only the subset TTF for satori

    total = sum(sizes.values())
    for name, size in sizes.items():
        print(f"{name}: {size / 1024:.0f} KB")
    print(f"web total: {total / 1024:.0f} KB (budget 1536 KB)")
    if total > 1.5 * 1024 * 1024:
        print("WARNING: over the 1.5MB budget — shrink the charset or weights.")
        sys.exit(2)


if __name__ == "__main__":
    main()
