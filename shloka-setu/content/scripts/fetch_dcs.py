#!/usr/bin/env python3
"""Fetch the Carakasaṃhitā and Suśrutasaṃhitā from the Digital Corpus of Sanskrit (DCS).

Source: Oliver Hellwig, The Digital Corpus of Sanskrit, CoNLL-U dump on GitHub
        https://github.com/OliverHellwig/sanskrit  (dcs/data/conllu/files/<Text>/*.conllu)
License: CC BY 4.0 (see dcs/data/conllu/readme.md in that repository).

The full repository is large, so this script makes a shallow, blob-less, sparse
clone that checks out only the two text folders (~38 MB of annotated CoNLL-U),
then writes a compact text-only extract (one JSON object per DCS sentence line)
to content/raw/dcs/:

  carakasamhita.jsonl, susrutasamhita.jsonl, MANIFEST.json

Each JSONL row: {seq, file, chapter_label, chapter_id, sent_id, counter, subcounter, text}
(`counter` is the verse number in the printed edition, `subcounter` the line/pāda
within the verse.)  The morphological annotation is dropped.

Usage:
  python3 content/scripts/fetch_dcs.py                    # clone into ~/.cache and extract
  python3 content/scripts/fetch_dcs.py --repo-dir /path/to/existing/clone   # reuse a clone
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "raw" / "dcs"
REPO_URL = "https://github.com/OliverHellwig/sanskrit.git"
TEXTS = {
    "Carakasaṃhitā": "carakasamhita.jsonl",
    "Suśrutasaṃhitā": "susrutasamhita.jsonl",
}
CONLLU_DIR = "dcs/data/conllu/files"


def run(cmd: list[str], cwd: Path | None = None) -> str:
    return subprocess.run(cmd, cwd=cwd, check=True, capture_output=True, text=True).stdout


def ensure_clone(repo_dir: Path) -> None:
    sparse = [f"{CONLLU_DIR}/{t}/*" for t in TEXTS]
    if not (repo_dir / ".git").exists():
        repo_dir.parent.mkdir(parents=True, exist_ok=True)
        print(f"cloning {REPO_URL} (shallow, blob-less, sparse) -> {repo_dir}")
        run(["git", "clone", "--depth", "1", "--filter=blob:none", "--no-checkout", REPO_URL, str(repo_dir)])
    else:
        print(f"reusing clone at {repo_dir}; pulling latest")
        try:
            run(["git", "fetch", "--depth", "1", "origin"], cwd=repo_dir)
            run(["git", "reset", "--hard", "origin/HEAD"], cwd=repo_dir)
        except subprocess.CalledProcessError as e:  # offline: keep what we have
            print("  fetch failed, using existing checkout:", e.stderr.strip()[:200])
    run(["git", "sparse-checkout", "set", "--no-cone", *sparse], cwd=repo_dir)
    run(["git", "checkout"], cwd=repo_dir)


FNAME = re.compile(r"^(?P<text>.+?)-(?P<seq>\d{4})-(?P<label>.+)-(?P<cid>\d+)\.conllu$")


def extract(repo_dir: Path, text: str, out_path: Path) -> dict:
    folder = repo_dir / CONLLU_DIR / text
    files = sorted(folder.glob("*.conllu"))
    rows = 0
    chapters = 0
    with out_path.open("w", encoding="utf-8") as out:
        for f in files:
            m = FNAME.match(f.name)
            if not m:
                raise SystemExit(f"unexpected file name {f.name}")
            chapters += 1
            cur: dict = {}
            for line in f.read_text(encoding="utf-8").splitlines():
                if line.startswith("# text = "):
                    cur = {"text": line[len("# text = "):].strip()}
                elif line.startswith("# sent_id = "):
                    cur["sent_id"] = int(line.split("=", 1)[1])
                elif line.startswith("# sent_counter = "):
                    cur["counter"] = line.split("=", 1)[1].strip()
                elif line.startswith("# sent_subcounter ="):
                    cur["subcounter"] = line.split("=", 1)[1].strip()
                    row = {
                        "seq": int(m["seq"]),
                        "file": f.name,
                        "chapter_label": m["label"],
                        "chapter_id": int(m["cid"]),
                        **cur,
                    }
                    out.write(json.dumps(row, ensure_ascii=False) + "\n")
                    rows += 1
                    cur = {}
    return {"text": text, "file": out_path.name, "chapters": chapters, "lines": rows}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo-dir", type=Path, default=Path.home() / ".cache" / "shloka-setu" / "OliverHellwig-sanskrit")
    ap.add_argument("--no-fetch", action="store_true", help="do not clone/pull; use --repo-dir as is")
    args = ap.parse_args()
    if not args.no_fetch:
        ensure_clone(args.repo_dir)
    OUT.mkdir(parents=True, exist_ok=True)
    commit = run(["git", "rev-parse", "HEAD"], cwd=args.repo_dir).strip()
    commit_date = run(["git", "log", "-1", "--format=%cI"], cwd=args.repo_dir).strip()
    summary = [extract(args.repo_dir, t, OUT / fn) for t, fn in TEXTS.items()]
    manifest = {
        "source": "Digital Corpus of Sanskrit (DCS), Oliver Hellwig, CoNLL-U dump",
        "repository": "https://github.com/OliverHellwig/sanskrit",
        "path": CONLLU_DIR,
        "commit": commit,
        "commit_date": commit_date,
        "extracted": dt.date.today().isoformat(),
        "license": "CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/)",
        "citation": "Oliver Hellwig: The Digital Corpus of Sanskrit (DCS). 2010-2024.",
        "texts": summary,
    }
    (OUT / "MANIFEST.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf-8")
    for s in summary:
        print(f"{s['text']}: {s['chapters']} chapter files, {s['lines']} lines -> raw/dcs/{s['file']}")
    print("commit", commit, commit_date)


if __name__ == "__main__":
    main()
