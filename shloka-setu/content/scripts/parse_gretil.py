#!/usr/bin/env python3
"""Parse GRETIL HTML e-texts of Ayurvedic classics into structured verse JSON.

Outputs (content/data/corpus/):
  ashtanga_hridaya.json  - every verse of the Astangahrdaya (Das & Emmerick transcription)
  charaka_selected.json  - the parts of the Carakasamhita available on GRETIL (Hellwig input)

Each verse record:
  {id, text, sthana, sthana_iast, chapter, verse, iast, devanagari, variants[]}

Usage:  python3 content/scripts/parse_gretil.py
"""
from __future__ import annotations

import html
import json
import re
import unicodedata
from pathlib import Path

from indic_transliteration import sanscript

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "raw" / "gretil"
OUT = ROOT / "data" / "corpus"

AH_STHANAS = {
    "Sūtrasthāna": ("sutra", "Sūtrasthāna", "सूत्रस्थान"),
    "Śārīrasthāna": ("sharira", "Śārīrasthāna", "शारीरस्थान"),
    "Nidānasthāna": ("nidana", "Nidānasthāna", "निदानस्थान"),
    "Cikitsāsthāna": ("chikitsa", "Cikitsāsthāna", "चिकित्सास्थान"),
    "Kalpasthāna": ("kalpa", "Kalpasthāna", "कल्पस्थान"),
    "Uttarasthāna": ("uttara", "Uttarasthāna", "उत्तरस्थान"),
}

CARAKA_STHANAS = {
    1: ("sutra", "Sūtrasthāna", "सूत्रस्थान"),
    2: ("nidana", "Nidānasthāna", "निदानस्थान"),
    3: ("vimana", "Vimānasthāna", "विमानस्थान"),
    4: ("sharira", "Śārīrasthāna", "शारीरस्थान"),
    5: ("indriya", "Indriyasthāna", "इन्द्रियस्थान"),
    6: ("chikitsa", "Cikitsāsthāna", "चिकित्सास्थान"),
    7: ("kalpa", "Kalpasthāna", "कल्पस्थान"),
    8: ("siddhi", "Siddhisthāna", "सिद्धिस्थान"),
}


def html_to_lines(path: Path) -> list[str]:
    t = path.read_text(encoding="utf-8", errors="replace")
    t = re.sub(r"<br\s*/?>", "\n", t, flags=re.I)
    t = re.sub(r"<[^>]+>", "", t)
    t = html.unescape(t)
    t = unicodedata.normalize("NFC", t)
    return t.splitlines()


def to_devanagari(iast: str) -> str:
    # The AH transcription marks compound boundaries with '-' ; remove for Devanagari.
    clean = iast.replace("-", "").replace("\u2019", "'")
    # Printed Devanagari editions write consonant-final words joined to the next
    # word (kapha\u015b ceti -> \u0915\u092b\u0936\u094d\u091a\u0947\u0924\u093f, param \u0101dara\u1e25 -> \u092a\u0930\u092e\u093e\u0926\u0930\u0903). Join within a line.
    clean = re.sub(r"(?<=[kg\u1e45cj\u00f1\u1e6d\u1e0d\u1e47tdnpbmyrlv\u015b\u1e63sh]) +(?=[^\s|/'])", "", clean)
    clean = re.sub(r" +'", "'", clean)  # vyāpino 'pi -> व्यापिनोऽपि
    dev = sanscript.transliterate(clean, sanscript.IAST, sanscript.DEVANAGARI)
    dev = dev.replace("'", "ऽ").replace("||", "॥").replace("|", "।").replace("//", "॥").replace("/", "।")
    dev = dev.replace("।।", "॥")
    return dev


def strip_dandas(s: str) -> str:
    return re.sub(r"\s*\|\|.*$", "", s).replace(" |", "").strip()


# ---------------------------------------------------------------- Astangahrdaya
AH_VERSE_END = re.compile(r"\|\|\s*(\d+)([a-f]*)\s*\|\|\s*$")
AH_VARIANT = re.compile(r"^\s+(\d+)\.(\d+)([a-f]+)v\s+(.*)$")


def parse_ah() -> list[dict]:
    lines = html_to_lines(RAW / "vagaah_u.htm")
    verses: list[dict] = []
    sthana_key = None
    chapter_counter: dict[str, int] = {}
    buf: list[str] = []
    started = False
    for raw in lines:
        line = raw.rstrip()
        stripped = line.strip()
        # GRETIL mis-encodes Ś in one heading as '”'
        heading = stripped.replace("”", "Ś")
        if heading in AH_STHANAS:
            sthana_key = heading
            chapter_counter[sthana_key] = chapter_counter.get(sthana_key, 0) + 1
            buf = []
            started = True
            continue
        if not started or not stripped:
            continue
        mv = AH_VARIANT.match(line)
        if mv:
            if verses:
                verses[-1]["variants"].append({"pada": mv.group(3), "reading": mv.group(4).strip()})
            continue
        if raw.startswith(" ") or raw.startswith("\t"):
            continue
        buf.append(stripped)
        m = AH_VERSE_END.search(stripped)
        if m:
            num = int(m.group(1))
            part = m.group(2)
            key, iast_name, dev_name = AH_STHANAS[sthana_key]
            ch = chapter_counter[sthana_key]
            text_iast = "\n".join(buf)
            # merge split verses like 78ab, 78c, 78d ... into a single record
            if part and part[0] != "a" and verses and verses[-1]["chapter"] == ch and verses[-1]["sthana"] == key and verses[-1]["verse"] == num:
                verses[-1]["iast"] += "\n" + text_iast
                verses[-1]["devanagari"] = to_devanagari(verses[-1]["iast"])
            else:
                verses.append({
                    "id": f"AH.{key}.{ch}.{num}",
                    "text": "ashtanga_hridaya",
                    "sthana": key,
                    "sthana_iast": iast_name,
                    "sthana_devanagari": dev_name,
                    "chapter": ch,
                    "verse": num,
                    "iast": text_iast,
                    "devanagari": to_devanagari(text_iast),
                    "variants": [],
                })
            buf = []
    return verses


# ---------------------------------------------------------------- Carakasamhita (selected)
CAR_END = re.compile(r"//\s*Car_(\d+),(\d+)\.(\d+)\s*$")


def parse_caraka() -> list[dict]:
    lines = html_to_lines(RAW / "caraka_u.htm")
    verses: list[dict] = []
    buf: list[str] = []
    in_comment = False
    started = False
    for raw in lines:
        stripped = raw.strip()
        if not started:
            if CAR_END.search(stripped) or stripped.startswith("athāto"):
                started = True
            else:
                continue
        if raw.startswith("     ") or raw.startswith("\t"):
            # commentary (Ayurvedadipika of Cakrapani) - indented, bracketed
            if stripped.startswith("["):
                in_comment = True
            if stripped.endswith("]"):
                in_comment = False
            continue
        if in_comment:
            if stripped.endswith("]"):
                in_comment = False
            continue
        if not stripped:
            continue
        m = CAR_END.search(stripped)
        buf.append(CAR_END.sub("", stripped).rstrip(" /").strip())
        if m:
            st, ch, vs = int(m.group(1)), int(m.group(2)), int(m.group(3))
            key, iast_name, dev_name = CARAKA_STHANAS[st]
            text_iast = "\n".join(b for b in buf if b)
            verses.append({
                "id": f"CS.{key}.{ch}.{vs}",
                "text": "charaka_samhita",
                "sthana": key,
                "sthana_iast": iast_name,
                "sthana_devanagari": dev_name,
                "chapter": ch,
                "verse": vs,
                "iast": text_iast,
                "devanagari": to_devanagari(text_iast),
                "variants": [],
            })
            buf = []
    return verses


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    ah = parse_ah()
    cs = parse_caraka()
    meta_ah = {
        "title": "Aṣṭāṅgahṛdaya of Vāgbhaṭa",
        "title_devanagari": "अष्टाङ्गहृदयम्",
        "source": "GRETIL (Göttingen Register of Electronic Texts in Indian Languages), file vagaah_u.htm",
        "source_url": "https://gretil.sub.uni-goettingen.de/gretil/1_sanskr/6_sastra/7_ayur/vagaah_u.htm",
        "transcription": "Machine-readable transcription by R.P. Das and R.E. Emmerick (1997)",
        "license_note": "GRETIL: 'for reference purposes only; copyright and terms of usage as for source file'. The Sanskrit work itself is in the public domain; obtain permission from the transcribers or re-key from a public-domain edition before commercial distribution.",
        "verse_count": len(ah),
    }
    meta_cs = {
        "title": "Carakasaṃhitā of Agniveśa (selected parts)",
        "title_devanagari": "चरकसंहिता",
        "source": "GRETIL, file caraka_u.htm, input by Oliver Hellwig, based on ed. J. Trikamji (Chaukhambha, 1994)",
        "source_url": "https://gretil.sub.uni-goettingen.de/gretil/1_sanskr/6_sastra/7_ayur/caraka_u.htm",
        "license_note": "GRETIL: 'for reference purposes only'. Mūla text only (Cakrapāṇi commentary excluded).",
        "verse_count": len(cs),
    }
    (OUT / "ashtanga_hridaya.json").write_text(json.dumps({"meta": meta_ah, "verses": ah}, ensure_ascii=False, indent=1), encoding="utf-8")
    (OUT / "charaka_selected.json").write_text(json.dumps({"meta": meta_cs, "verses": cs}, ensure_ascii=False, indent=1), encoding="utf-8")

    from collections import Counter
    print("AH verses:", len(ah))
    print(Counter((v["sthana"]) for v in ah))
    print("AH sutra chapters:", sorted(Counter(v["chapter"] for v in ah if v["sthana"] == "sutra").items()))
    print("CS verses:", len(cs), Counter((v["sthana"], v["chapter"]) for v in cs))


if __name__ == "__main__":
    main()
