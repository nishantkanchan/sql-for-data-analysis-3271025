#!/usr/bin/env python3
"""Build charaka_samhita.json and sushruta_samhita.json (content/data/corpus/).

Inputs (all under content/raw/, see content/data/corpus/README.md):
  dcs/carakasamhita.jsonl, dcs/susrutasamhita.jsonl   <- scripts/fetch_dcs.py (DCS, CC BY 4.0)
  vedicreserve/charaka_*.html                         <- MIU Vedic Reserve pages (fetched with Firecrawl)
  wikisource/caraka_kalpasthana.wiki, caraka_siddhisthana.wiki
                                                      <- sa.wikisource.org raw wikitext (Firecrawl)

Source plan
  Carakasaṃhitā
    Sūtra, Nidāna, Vimāna, Śārīra, Indriya, Cikitsā 1-5 : DCS (IAST); verse numbers that DCS
        lacks are filled from Vedic Reserve when that chapter's numbering is verified to agree.
    Cikitsā 6-30 : Vedic Reserve (Devanagari)  (DCS has only fragments of 22, 23, 30)
    Kalpa 1-12, Siddhi 1-12 : Sanskrit Wikisource (Devanagari)  (DCS has only fragments)
  Suśrutasaṃhitā : DCS, all 6 sthānas / 186 chapters.

Record schema: docs/CONTENT_SCHEMA.md section 1, plus three optional fields:
  `ref`    human citation, e.g. "Ca. Sū. 1.41", "Ca. Ci. 1.2.41", "Su. Sū. 15.41"
  `source` "dcs" | "vedicreserve" | "wikisource" (provenance of this verse's text)
  `pada`, `verse_in_pada`  only for Carakasaṃhitā Cikitsā 1 and 2, which are divided into
           four pādas each.  To keep ids in the `<TEXT>.<sthana>.<chapter>.<verse>` form
           (and the server's id regex) the verse number is encoded as pada*100 + verse,
           e.g. Ci. 1.2.41 -> CS.chikitsa.1.241 (no pāda has 100 verses; asserted).

Usage: python3 content/scripts/build_samhitas.py [--report]
"""
from __future__ import annotations

import argparse
import difflib
import html
import json
import re
import unicodedata
from collections import Counter, OrderedDict, defaultdict
from pathlib import Path

from indic_transliteration import sanscript

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "raw"
OUT = ROOT / "data" / "corpus"

STHANA_NAMES = {
    "sutra": ("Sūtrasthāna", "सूत्रस्थान"),
    "nidana": ("Nidānasthāna", "निदानस्थान"),
    "vimana": ("Vimānasthāna", "विमानस्थान"),
    "sharira": ("Śārīrasthāna", "शारीरस्थान"),
    "indriya": ("Indriyasthāna", "इन्द्रियस्थान"),
    "chikitsa": ("Cikitsāsthāna", "चिकित्सास्थान"),
    "kalpa": ("Kalpasthāna", "कल्पस्थान"),
    "siddhi": ("Siddhisthāna", "सिद्धिस्थान"),
    "uttara": ("Uttaratantra", "उत्तरतन्त्र"),
}
CS_ORDER = ["sutra", "nidana", "vimana", "sharira", "indriya", "chikitsa", "kalpa", "siddhi"]
SS_ORDER = ["sutra", "nidana", "sharira", "chikitsa", "kalpa", "uttara"]
CS_EXPECTED = {"sutra": 30, "nidana": 8, "vimana": 8, "sharira": 8, "indriya": 12, "chikitsa": 30, "kalpa": 12, "siddhi": 12}
SS_EXPECTED = {"sutra": 46, "nidana": 16, "sharira": 10, "chikitsa": 40, "kalpa": 8, "uttara": 66}
DCS_STHANA = {"Sū.": "sutra", "Nid.": "nidana", "Vim.": "vimana", "Śār.": "sharira", "Indr.": "indriya",
              "Cik.": "chikitsa", "Ka.": "kalpa", "Si.": "siddhi", "Utt.": "uttara"}
REF_ABBR = {"sutra": "Sū.", "nidana": "Ni.", "vimana": "Vi.", "sharira": "Śā.", "indriya": "In.",
            "chikitsa": "Ci.", "kalpa": "Ka.", "siddhi": "Si.", "uttara": "U."}
PADA_CHAPTERS = {1, 2}  # Caraka Cikitsā 1 (rasāyana) and 2 (vājīkaraṇa) have 4 pādas each

DEV_DIGITS = "०१२३४५६७८९"


def dev_num(n: int) -> str:
    return "".join(DEV_DIGITS[int(c)] for c in str(n))


def parse_dev_num(s: str) -> int:
    return int("".join(str(DEV_DIGITS.index(c)) for c in s))


# ------------------------------------------------------------------ transliteration
CONS_FINAL = "kgṅcjñṭḍṇtdnpbmyrlvśṣsh"


def iast_to_devanagari(iast: str) -> str:
    """Same approach as parse_gretil.to_devanagari: join consonant-final words to the
    next word within a line (as printed Devanagari editions do), then transliterate."""
    out_lines = []
    for line in iast.split("\n"):
        clean = line.replace("’", "'")
        clean = re.sub(rf"(?<=[{CONS_FINAL}]) +(?=[^\s|/'])", "", clean)
        clean = re.sub(r" +'", "'", clean)
        dev = sanscript.transliterate(clean, sanscript.IAST, sanscript.DEVANAGARI)
        dev = dev.replace("'", "ऽ").replace("||", "॥").replace("|", "।")
        out_lines.append(dev)
    return "\n".join(out_lines)


def devanagari_to_iast(dev: str) -> str:
    s = sanscript.transliterate(dev, sanscript.DEVANAGARI, sanscript.IAST)
    s = s.replace("॥", "||").replace("।", "|")
    s = s.replace("ऽ", "'")
    return unicodedata.normalize("NFC", s)


def clean_dev_line(s: str) -> str:
    s = unicodedata.normalize("NFC", s)
    s = re.sub(r"(?<=[ऀ-ॿ])-(?=[ऀ-ॿ])", "", s)  # print hyphenation: वयोब-लाग्नि
    s = s.replace("‌", "").replace("‍", "")
    s = re.sub(r"\s+", " ", s).strip()
    return s


def letters_only(s: str) -> str:
    """Comparison key: IAST letters without spaces/punctuation/anusvara variance."""
    s = s.lower().replace("ṃ", "m").replace("ṁ", "m")
    return re.sub(r"[^a-zāīūṛṝḷḹṅñṭḍṇśṣḥ]", "", s)


# ------------------------------------------------------------------ verse record
def make_record(text_code: str, text_key: str, sthana: str, chapter: int, verse: int,
                lines_iast: list[str] | None, lines_dev: list[str] | None, source: str,
                pada: int | None = None) -> dict:
    """lines_*: the verse's lines without dandas/numbers. Exactly one of the two is given."""
    vnum = verse if pada is None else pada * 100 + verse
    if pada is not None:
        assert verse < 100, (sthana, chapter, pada, verse)
    if lines_iast is not None:
        lines_iast = [l.strip() for l in lines_iast if l.strip()]
        iast = " |\n".join(lines_iast) + f" || {verse} ||"
        dev = iast_to_devanagari(iast)
    else:
        lines_dev = [l for l in (clean_dev_line(x) for x in lines_dev) if l]
        dev = " ।\n".join(lines_dev) + f" ॥ {dev_num(verse)} ॥"
        iast = devanagari_to_iast(dev)
    dev = dev.replace("।।", "॥")
    ref_num = f"{chapter}.{verse}" if pada is None else f"{chapter}.{pada}.{verse}"
    rec = {
        "id": f"{text_code}.{sthana}.{chapter}.{vnum}",
        "text": text_key,
        "sthana": sthana,
        "sthana_iast": STHANA_NAMES[sthana][0],
        "sthana_devanagari": STHANA_NAMES[sthana][1],
        "chapter": chapter,
        "verse": vnum,
        "iast": iast,
        "devanagari": dev,
        "variants": [],
        "ref": f"{'Ca.' if text_code == 'CS' else 'Su.'} {REF_ABBR[sthana]} {ref_num}",
        "source": source,
    }
    if pada is not None:
        rec["pada"] = pada
        rec["verse_in_pada"] = verse
    return rec


# ------------------------------------------------------------------ DCS
def load_dcs(path: Path) -> "OrderedDict[tuple, OrderedDict[int, list[str]]]":
    """-> {(sthana, chapter, pada|None): {verse: [lines]}} in DCS order."""
    chapters: OrderedDict = OrderedDict()
    for raw in path.read_text(encoding="utf-8").splitlines():
        row = json.loads(raw)
        parts = [p.strip() for p in row["chapter_label"].split(",")]
        sthana = DCS_STHANA[parts[1]]
        nums = [int(p) for p in parts[2:]]
        pada = None
        if parts[0] == "Ca" and sthana == "chikitsa" and (len(nums) == 2 or nums[0] in PADA_CHAPTERS):
            if len(nums) == 1:      # DCS "Ca, Cik., 1" / "Ca, Cik., 2" = Cik. 1.1 and 1.2
                chapter, pada = 1, nums[0]
            else:                   # "Ca, Cik., 1, 3" = Cik. 1.3 ; "Ca, Cik., 2, 1" = Cik. 2.1
                chapter, pada = nums
        else:
            chapter = nums[0]
        key = (sthana, chapter, pada)
        text = row["text"].replace("ﾱ", "ḷ")  # DCS encodes vocalic l with U+FFB1 in 3 places
        text = unicodedata.normalize("NFC", re.sub(r"\s+", " ", text)).strip()
        if not row["counter"].isdigit() or not text:
            continue
        chapters.setdefault(key, OrderedDict()).setdefault(int(row["counter"]), []).append(text)
    return chapters


# ------------------------------------------------------------------ Devanagari line sources
NUM_END = re.compile(r"\s*([०-९]+)\s*$")
HEADING = re.compile(r"^\S*ऽध्यायः$|^(चरकसंहिता\s*)?\S*स्थान(म्)?$|^\S+\s+स्थान$")


def html_lines(fragment: str) -> list[str]:
    t = re.sub(r"<br\s*/?>", "\n", fragment, flags=re.I)
    t = re.sub(r"</?(p|h\d|div)[^>]*>", "\n", t, flags=re.I)
    t = re.sub(r"<[^>]+>", "", t)
    t = html.unescape(t).replace("\xa0", " ")
    return [l.strip() for l in t.splitlines() if l.strip()]


def vedicreserve_chapters(path: Path) -> dict[int, list[str]]:
    t = path.read_text(encoding="utf-8")
    parts = re.split(r'<a name="chapter(\d+)">', t)
    out = {}
    for i in range(1, len(parts), 2):
        frag = parts[i + 1]
        frag = frag.split("</div>\n\n \n", 1)[0] if i + 2 >= len(parts) else frag
        out[int(parts[i])] = html_lines(frag)
    return out


def wikisource_chapters(path: Path) -> dict[int, list[str]]:
    t = path.read_text(encoding="utf-8")
    t = t[t.index("<poem>") + 6: t.index("</poem>")]
    out: dict[int, list[str]] = {}
    n = 0
    for line in t.splitlines():
        line = line.strip()
        if not line:
            continue
        if re.fullmatch(r"\S+ऽध्यायः", line):
            n += 1
            out[n] = []
            continue
        if n:
            out[n].append(line)
    return out


def split_padas(lines: list[str]) -> dict[int, list[str]]:
    """Cikitsā 1 and 2 are each made of four pādas that restart their verse numbering;
    each pāda opens with '... pādaṃ vyākhyāsyāmaḥ 1'."""
    starts = [i for i, l in enumerate(lines) if "पादं व्याख्यास्यामः" in l]
    out = {}
    for k, st in enumerate(starts):
        end = starts[k + 1] if k + 1 < len(starts) else len(lines)
        out[k + 1] = lines[st:end]
    return out


def segment_verses(lines: list[str], log: list[str], ctx: str) -> "OrderedDict[int, list[str]]":
    """Group Devanagari lines into verses. A line ending in a Devanagari number closes that
    verse; preceding unnumbered lines belong to it. Colophons are dropped. Numbering typos
    of the e-text are repaired (see notes in the log)."""
    items: list[tuple[int, list[str]]] = []
    buf: list[str] = []
    in_colophon = False
    for line in lines:
        if line.startswith("<") or line.startswith("{{"):
            continue
        if in_colophon:
            if NUM_END.search(line):
                in_colophon = False
            continue
        is_agnivesha = bool(re.match(r"^इत्य[ा]?ग्निवेशकृते", line))
        if is_agnivesha or re.match(r"^इति .*(ऽध्यायः|स्थान[ंम]? समाप्त|समाप्ता)", line) \
                or re.match(r"^(समाप्तमिदं|सप्तमं कल्पस्थानं|इति (कल्प|सिद्धि)स्थान)", line) \
                or (re.match(r"^(इति|समाप्त|इत्य)", line) and len(line.split()) <= 5
                    and re.search(r"(चतुष्क[ःो]|ध्यायः)(\s|$)", line)):
            in_colophon = not NUM_END.search(line) and is_agnivesha
            buf = []
            continue
        if HEADING.match(line) and not NUM_END.search(line):
            continue
        m = NUM_END.search(line)
        if not m:
            # "iti <recipe-name>" lines close the preceding recipe in the printed text
            if line.startswith("इति ") and items and not buf:
                items[-1][1].append(line)
            else:
                buf.append(line)
            continue
        buf.append(line[: m.start()].rstrip())
        items.append((parse_dev_num(m.group(1)), buf))
        buf = []
    if buf:
        log.append(f"{ctx}: dropped trailing unnumbered lines: {' / '.join(buf)[:120]}")

    # --- numbering: separate the main verse sequence from sub-numbered lists
    # (the e-texts number items of prose lists 1, 2, 3 ... inside a verse; those items are
    # kept, with their number in brackets, as part of the next main verse) and repair typos.
    nums = [n for n, _ in items]
    out: OrderedDict = OrderedDict()
    m = 0
    pending: list[str] = []
    in_sub = False
    sub_last = 0
    for i, (n, ls) in enumerate(items):
        nxt = nums[i + 1] if i + 1 < len(nums) else None
        if nxt is None and n <= m and any(("ऽध्याय" in x or " नाम" in x) for x in ls):
            log.append(f"{ctx}: dropped colophon fragment numbered {n}")
            continue
        if nxt is None and n <= m and not in_sub:
            log.append(f"{ctx}: last verse numbered {n} after {m} read as {m + 1} (typo in e-text)")
            out[m + 1] = pending + ls
            pending = []
            break
        if in_sub and n == sub_last + 1 and (n != m + 1 or n in nums[i + 1:i + 80]):
            pending.extend(ls[:-1] + [f"{ls[-1]} ({dev_num(n)})"])
            sub_last = n
            continue
        if n == m + 1:
            main = n
        elif n != 1 and any(i + k < len(nums) and nums[i + k] == m + 1 + k for k in (1, 2, 3)):
            log.append(f"{ctx}: number {n} after {m} read as {m + 1} (typo in e-text)")
            main = m + 1
        elif n <= m:
            in_sub, sub_last = True, n
            pending.extend(ls[:-1] + [f"{ls[-1]} ({dev_num(n)})"])
            continue
        else:
            log.append(f"{ctx}: gap {m} -> {n}")
            main = n
        out[main] = pending + ls
        pending, in_sub, m = [], False, main
    if pending:
        out[m] = out.get(m, []) + pending
        log.append(f"{ctx}: trailing sub-numbered items appended to verse {m}")
    return out


# ------------------------------------------------------------------ alignment check
def similarity(a_iast: str, b_iast: str) -> float:
    a, b = letters_only(a_iast), letters_only(b_iast)
    if not a or not b:
        return 0.0
    return difflib.SequenceMatcher(None, a, b, autojunk=False).ratio()


def check_alignment(dcs_ch: dict[int, list[str]], dev_ch: dict[int, list[str]]) -> tuple[float, int]:
    common = sorted(set(dcs_ch) & set(dev_ch))
    if not common:
        return 0.0, 0
    sims = sorted(similarity(" ".join(dcs_ch[n]), devanagari_to_iast(" ".join(dev_ch[n]))) for n in common)
    return sims[len(sims) // 2], len(common)


def compress(nums: list[int]) -> str:
    """[1,2,3,7,9,10] -> '1-3,7,9-10'"""
    out, start, prev = [], None, None
    for n in nums:
        if start is None:
            start = prev = n
        elif n == prev + 1:
            prev = n
        else:
            out.append(f"{start}-{prev}" if start != prev else str(start))
            start = prev = n
    if start is not None:
        out.append(f"{start}-{prev}" if start != prev else str(start))
    return ",".join(out)


def fill_gaps(dch: dict[int, list[str]], vch: dict[int, list[str]], threshold: float = 0.8) -> dict[int, list[str]]:
    """Verses that DCS lacks, taken from the Vedic Reserve chapter, but only where the two
    e-texts demonstrably share the same numbering locally: the nearest DCS verse before the
    gap (and after it, if any) must have the same number and >= threshold textual similarity
    in Vedic Reserve."""
    def sim(n: int) -> float:
        if n not in dch or n not in vch:
            return 0.0
        return similarity(" ".join(dch[n]), devanagari_to_iast(" ".join(vch[n])))

    present = sorted(dch)
    filled: dict[int, list[str]] = {}
    for n in sorted(vch):
        if n in dch:
            continue
        below = [x for x in present if x < n]
        above = [x for x in present if x > n]
        ok_below = (not below and n == 1) or (below and sim(below[-1]) >= threshold)
        ok_above = (not above) or sim(above[0]) >= threshold
        if not below and above:  # leading gap (e.g. the opening 'athāto ...' line)
            ok_below = True
        if ok_below and ok_above and (below or above):
            filled[n] = vch[n]
    return filled


# ------------------------------------------------------------------ build
def build_caraka(log: list[str]) -> tuple[list[dict], dict]:
    dcs = load_dcs(RAW / "dcs" / "carakasamhita.jsonl")
    vr: dict[str, dict[int, list[str]]] = {}
    for st, fn in [("sutra", "charaka_sutra.html"), ("nidana", "charaka_nidana.html"),
                   ("vimana", "charaka_vimana.html"), ("sharira", "charaka_sharira.html"),
                   ("indriya", "charaka_indriya.html")]:
        vr[st] = vedicreserve_chapters(RAW / "vedicreserve" / fn)
    vr["chikitsa"] = {**vedicreserve_chapters(RAW / "vedicreserve" / "charaka_chikitsa_1-15.html"),
                      **vedicreserve_chapters(RAW / "vedicreserve" / "charaka_chikitsa_16-30.html")}
    ws = {"kalpa": wikisource_chapters(RAW / "wikisource" / "caraka_kalpasthana.wiki"),
          "siddhi": wikisource_chapters(RAW / "wikisource" / "caraka_siddhisthana.wiki")}

    verses: list[dict] = []
    chapter_sources: dict[str, str] = {}
    alignment: dict[str, dict] = {}
    for st in CS_ORDER:
        for ch in range(1, CS_EXPECTED[st] + 1):
            key = f"{st}.{ch}"
            use_dcs = st in ("sutra", "nidana", "vimana", "sharira", "indriya") or (st == "chikitsa" and ch <= 5)
            if use_dcs:
                padas = sorted((p for (s, c, p) in dcs if s == st and c == ch), key=lambda x: x or 0)
                for p in padas:
                    dch = dcs[(st, ch, p)]
                    merged: dict[int, tuple[str, list[str]]] = {n: ("dcs", ls) for n, ls in dch.items()}
                    vr_lines = None
                    if p is None and ch in vr.get(st, {}):
                        vr_lines = vr[st][ch]
                    elif p is not None and ch in vr.get(st, {}):
                        vr_lines = split_padas(vr[st][ch]).get(p)
                    if vr_lines:
                        pkey = key if p is None else f"{key}.pada{p}"
                        vch = segment_verses(vr_lines, log, f"vedicreserve CS {pkey}")
                        med, n_common = check_alignment(dch, vch)
                        alignment[pkey] = {"median_similarity": round(med, 3), "common_verses": n_common,
                                          "dcs_max": max(dch), "vedicreserve_max": max(vch) if vch else 0}
                        filled = fill_gaps(dch, vch)
                        for n, ls in filled.items():
                            merged[n] = ("vedicreserve", ls)
                        if filled:
                            log.append(f"CS {pkey}: filled {len(filled)} verse(s) missing in DCS from Vedic Reserve: {compress(sorted(filled))}")
                        missing = [n for n in vch if n not in merged and n <= max(vch)]
                        if missing:
                            log.append(f"CS {pkey}: Vedic Reserve has numbers {compress(missing)} not in DCS, but local numbering "
                                       "could not be verified; NOT filled")
                    for n in sorted(merged):
                        src, ls = merged[n]
                        if src == "dcs":
                            verses.append(make_record("CS", "charaka_samhita", st, ch, n, ls, None, "dcs", pada=p))
                        else:
                            verses.append(make_record("CS", "charaka_samhita", st, ch, n, None, ls, "vedicreserve", pada=p))
                chapter_sources[key] = "dcs" + ("+vedicreserve" if any(v["source"] == "vedicreserve" for v in verses if v["sthana"] == st and v["chapter"] == ch) else "")
                if not padas:
                    log.append(f"CS {key}: MISSING (not in DCS)")
            elif st == "chikitsa":
                vch = segment_verses(vr["chikitsa"][ch], log, f"vedicreserve CS {key}")
                for n, ls in vch.items():
                    verses.append(make_record("CS", "charaka_samhita", st, ch, n, None, ls, "vedicreserve"))
                chapter_sources[key] = "vedicreserve"
                # cross-check against the DCS fragments where they exist
                if (st, ch, None) in dcs:
                    med, n_common = check_alignment(dcs[(st, ch, None)], vch)
                    alignment[key] = {"median_similarity": round(med, 3), "common_verses": n_common,
                                      "dcs_max": max(dcs[(st, ch, None)]), "vedicreserve_max": max(vch)}
            else:
                wch = segment_verses(ws[st][ch], log, f"wikisource CS {key}")
                for n, ls in wch.items():
                    verses.append(make_record("CS", "charaka_samhita", st, ch, n, None, ls, "wikisource"))
                chapter_sources[key] = "wikisource"
                if (st, ch, None) in dcs:
                    med, n_common = check_alignment(dcs[(st, ch, None)], wch)
                    alignment[key] = {"median_similarity": round(med, 3), "common_verses": n_common,
                                      "dcs_max": max(dcs[(st, ch, None)]), "wikisource_max": max(wch)}
    return verses, {"chapter_sources": chapter_sources, "alignment": alignment}


def build_sushruta(log: list[str]) -> list[dict]:
    dcs = load_dcs(RAW / "dcs" / "susrutasamhita.jsonl")
    verses = []
    for st in SS_ORDER:
        for ch in range(1, SS_EXPECTED[st] + 1):
            dch = dcs.get((st, ch, None))
            if not dch:
                log.append(f"SS {st}.{ch}: MISSING (not in DCS)")
                continue
            for n in sorted(dch):
                verses.append(make_record("SS", "sushruta_samhita", st, ch, n, dch[n], None, "dcs"))
    return verses


def chapter_stats(verses: list[dict], order: list[str], expected: dict[str, int]) -> dict:
    stats = {}
    for st in order:
        chs = Counter(v["chapter"] for v in verses if v["sthana"] == st)
        gaps = {}
        for ch in sorted(chs):
            nums = sorted(v.get("verse_in_pada", v["verse"]) + 1000 * v.get("pada", 0)
                          for v in verses if v["sthana"] == st and v["chapter"] == ch)
            missing = []
            prev = None
            for n in nums:
                if prev is not None and n // 1000 == prev // 1000 and n - prev > 1:
                    missing.extend(range(prev % 1000 + 1, n % 1000))
                prev = n
            first = nums[0] % 1000
            if first > 1:
                missing = list(range(1, first)) + missing
            if missing:
                gaps[ch] = missing
        stats[st] = {
            "chapters_expected": expected[st],
            "chapters_present": len(chs),
            "missing_chapters": [c for c in range(1, expected[st] + 1) if c not in chs],
            "verses": sum(chs.values()),
            "verses_per_chapter": {str(c): chs[c] for c in sorted(chs)},
            "internal_number_gaps": {str(k): v for k, v in gaps.items()},
        }
    return stats


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--report", action="store_true", help="print per-chapter counts and the repair log")
    args = ap.parse_args()
    log: list[str] = []

    cs, cs_info = build_caraka(log)
    ss = build_sushruta(log)
    for name, vs in (("CS", cs), ("SS", ss)):
        dup = [k for k, n in Counter(v["id"] for v in vs).items() if n > 1]
        assert not dup, f"{name} duplicate ids: {dup[:10]}"

    cs_stats = chapter_stats(cs, CS_ORDER, CS_EXPECTED)
    ss_stats = chapter_stats(ss, SS_ORDER, SS_EXPECTED)
    dcs_manifest = json.loads((RAW / "dcs" / "MANIFEST.json").read_text(encoding="utf-8"))
    src_counts = Counter(v["source"] for v in cs)

    meta_cs = {
        "title": "Carakasaṃhitā of Agniveśa, redacted by Caraka and completed by Dṛḍhabala (complete mūla text)",
        "title_devanagari": "चरकसंहिता",
        "source": (
            "Composite of three e-texts of the vulgate (Trikamji Acharya) text: "
            f"(1) Digital Corpus of Sanskrit (DCS), Oliver Hellwig, CoNLL-U dump, commit {dcs_manifest['commit'][:10]} "
            "- Sūtra, Nidāna, Vimāna, Śārīra, Indriya and Cikitsā 1-5; "
            "(2) Maharishi International University 'Vedic Reserve' Charaka Saṃhitā pages - Cikitsā 6-30 and verses missing in DCS; "
            "(3) Sanskrit Wikisource (sa.wikisource.org) - Kalpa and Siddhi."
        ),
        "source_url": "https://github.com/OliverHellwig/sanskrit/tree/master/dcs/data/conllu/files/Carakasa%E1%B9%83hit%C4%81",
        "source_urls": {
            "dcs": "https://github.com/OliverHellwig/sanskrit/tree/master/dcs/data/conllu/files/Carakasa%E1%B9%83hit%C4%81",
            "vedicreserve": [
                "https://vedicreserve.miu.edu/charaka/chikitsa_1-15_new.html",
                "https://vedicreserve.miu.edu/charaka/chikitsa_16-30_new.html",
                "https://vedicreserve.miu.edu/charaka/charaka_sutra_new.html",
                "https://vedicreserve.miu.edu/charaka/nidana_new.html",
                "https://vedicreserve.miu.edu/charaka/vimana_new.html",
                "https://vedicreserve.miu.edu/charaka/sharira_new.html",
                "https://vedicreserve.miu.edu/charaka/Indriya_new.html",
            ],
            "wikisource": [
                "https://sa.wikisource.org/wiki/चरकसंहिता/कल्पस्थानम्",
                "https://sa.wikisource.org/wiki/चरकसंहिता/सिद्धिस्थानम्",
            ],
        },
        "edition": "Carakasaṃhitā, ed. Jādavji Trikamji Ācārya (Nirnaya Sagar, 3rd ed. 1941; reprinted by Chaukhambha), "
                   "verse numbering of that edition as carried by each e-text.",
        "license_note": (
            "The Sanskrit work is in the public domain. Per-verse `source` field shows provenance. "
            f"DCS verses ({src_counts.get('dcs', 0)}): CC BY 4.0, attribution required - 'Oliver Hellwig: The Digital Corpus of Sanskrit (DCS), 2010-2024'. "
            f"Wikisource verses ({src_counts.get('wikisource', 0)}): Wikisource text is offered under CC BY-SA 4.0 (attribute sa.wikisource.org contributors; share-alike applies to that portion). "
            f"Vedic Reserve verses ({src_counts.get('vedicreserve', 0)}): Maharishi International University's Vedic Literature Collection publishes "
            "no reuse licence - treat as REFERENCE ONLY until permission is obtained from MIU or the text is re-keyed/verified "
            "from a public-domain printed edition (e.g. Trikamji 1941)."
        ),
        "notes": (
            "Cikitsā 1 and 2 have four pādas each; their verse number is pada*100+verse (CS.chikitsa.1.241 = Ci. 1.2.41), "
            "see fields pada/verse_in_pada/ref. Dandas and the verse number were added to iast/devanagari for display, "
            "as in ashtanga_hridaya.json. Devanagari of DCS verses and IAST of Devanagari-source verses are machine "
            "transliterations (indic_transliteration). Prose passages are single records per printed number."
        ),
        "verse_count": len(cs),
        "verse_count_by_source": dict(src_counts),
        "chapter_count": sum(s["chapters_present"] for s in cs_stats.values()),
        "chapter_sources": cs_info["chapter_sources"],
    }
    meta_ss = {
        "title": "Suśrutasaṃhitā (complete mūla text: Sūtra, Nidāna, Śārīra, Cikitsā, Kalpa, Uttaratantra)",
        "title_devanagari": "सुश्रुतसंहिता",
        "source": f"Digital Corpus of Sanskrit (DCS), Oliver Hellwig, CoNLL-U dump, commit {dcs_manifest['commit'][:10]} ({dcs_manifest['commit_date'][:10]})",
        "source_url": "https://github.com/OliverHellwig/sanskrit/tree/master/dcs/data/conllu/files/Su%C5%9Brutasa%E1%B9%83hit%C4%81",
        "edition": "Suśrutasaṃhitā, ed. Jādavji Trikamji Ācārya and Nārāyaṇ Rām Ācārya (Nirnaya Sagar; reprinted by Chaukhambha), "
                   "verse numbering as in DCS.",
        "license_note": (
            "The Sanskrit work is in the public domain. This e-text is from the DCS, licensed CC BY 4.0: reuse (including "
            "commercial) is allowed with attribution - 'Oliver Hellwig: The Digital Corpus of Sanskrit (DCS), 2010-2024'. "
            "Devanagari is a machine transliteration of the DCS IAST (indic_transliteration)."
        ),
        "notes": "Dandas and the verse number were added to iast/devanagari for display. Prose passages are single records per printed number.",
        "verse_count": len(ss),
        "chapter_count": sum(s["chapters_present"] for s in ss_stats.values()),
    }
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "charaka_samhita.json").write_text(json.dumps({"meta": meta_cs, "verses": cs}, ensure_ascii=False, indent=1), encoding="utf-8")
    (OUT / "sushruta_samhita.json").write_text(json.dumps({"meta": meta_ss, "verses": ss}, ensure_ascii=False, indent=1), encoding="utf-8")
    report = {"charaka_samhita": {"stats": cs_stats, "alignment": cs_info["alignment"]},
              "sushruta_samhita": {"stats": ss_stats}, "log": log}
    (RAW / "build_report.json").write_text(json.dumps(report, ensure_ascii=False, indent=1), encoding="utf-8")

    for name, stats, total in (("Carakasaṃhitā", cs_stats, len(cs)), ("Suśrutasaṃhitā", ss_stats, len(ss))):
        print(f"{name}: {total} verses")
        for st, s in stats.items():
            print(f"  {st:9s} chapters {s['chapters_present']:3d}/{s['chapters_expected']:<3d} verses {s['verses']:5d}"
                  + (f"  MISSING {s['missing_chapters']}" if s["missing_chapters"] else ""))
    print("CS verses by source:", dict(src_counts))
    if args.report:
        for st, s in list(cs_stats.items()) + [("SS." + k, v) for k, v in ss_stats.items()]:
            print(st, s["verses_per_chapter"])
            if s["internal_number_gaps"]:
                print("   gaps:", s["internal_number_gaps"])
        print("alignment:", json.dumps(cs_info["alignment"], ensure_ascii=False))
        print("\n".join(log))


if __name__ == "__main__":
    main()
