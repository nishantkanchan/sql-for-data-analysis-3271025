#!/usr/bin/env python3
"""Download the web e-texts used for the Carakasaṃhitā gaps into content/raw/.

  raw/vedicreserve/charaka_*.html        MIU Vedic Reserve, Charaka Saṃhitā pages
  raw/wikisource/caraka_*.wiki           sa.wikisource.org raw wikitext (action=raw)

The copies in the repository were fetched on 2026-11-02 with the Firecrawl scraper,
because the build container blocks direct access to these hosts. On an unrestricted
network this script fetches the same URLs directly. Existing files are kept unless
--force is given. Then run scripts/build_samhitas.py.
"""
from __future__ import annotations

import argparse
import json
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "raw"

VEDICRESERVE = {
    "charaka_sutra.html": "https://vedicreserve.miu.edu/charaka/charaka_sutra_new.html",
    "charaka_nidana.html": "https://vedicreserve.miu.edu/charaka/nidana_new.html",
    "charaka_vimana.html": "https://vedicreserve.miu.edu/charaka/vimana_new.html",
    "charaka_sharira.html": "https://vedicreserve.miu.edu/charaka/sharira_new.html",
    "charaka_indriya.html": "https://vedicreserve.miu.edu/charaka/Indriya_new.html",
    "charaka_chikitsa_1-15.html": "https://vedicreserve.miu.edu/charaka/chikitsa_1-15_new.html",
    "charaka_chikitsa_16-30.html": "https://vedicreserve.miu.edu/charaka/chikitsa_16-30_new.html",
}
WIKISOURCE = {
    "caraka_kalpasthana.wiki": "चरकसंहिता/कल्पस्थानम्",
    "caraka_siddhisthana.wiki": "चरकसंहिता/सिद्धिस्थानम्",
}


def ws_raw_url(title: str) -> str:
    return "https://sa.wikisource.org/w/index.php?" + urllib.parse.urlencode({"title": title, "action": "raw"})


def fetch(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": "shloka-setu-corpus/1.0 (study app; contact via repo)"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read().decode("utf-8")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args()
    jobs = [(RAW / "vedicreserve" / fn, url) for fn, url in VEDICRESERVE.items()]
    jobs += [(RAW / "wikisource" / fn, ws_raw_url(t)) for fn, t in WIKISOURCE.items()]
    for path, url in jobs:
        if path.exists() and not args.force:
            print("keep", path.relative_to(ROOT))
            continue
        path.parent.mkdir(parents=True, exist_ok=True)
        try:
            path.write_text(fetch(url), encoding="utf-8")
            print("got ", path.relative_to(ROOT))
        except Exception as e:  # noqa: BLE001
            print("FAILED", url, e)
    for d, mapping in (("vedicreserve", VEDICRESERVE), ("wikisource", {k: ws_raw_url(v) for k, v in WIKISOURCE.items()})):
        man = RAW / d / "MANIFEST.json"
        if not man.exists():
            man.write_text(json.dumps({"files": mapping}, ensure_ascii=False, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main()
