#!/usr/bin/env python3
"""Validate Shloka Setu content files against docs/CONTENT_SCHEMA.md.

Usage:
  python3 content/scripts/validate_content.py                 # validate everything
  python3 content/scripts/validate_content.py translations/AH/sutra/1.json   # one file
Exit code 1 when any error is found.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

DATA = Path(__file__).resolve().parents[1] / "data"
DEV = re.compile(r"[ऀ-ॿ]")
TEXT_FILES = {"AH": "ashtanga_hridaya.json", "CS": "charaka_selected.json", "SS": "sushruta_samhita.json"}
_corpus_cache: dict[str, dict] = {}


def corpus_ids(text_code: str, sthana: str, chapter: int) -> list[str]:
    # prefer a full corpus file if present (e.g. charaka_samhita.json), fall back to selected
    candidates = {
        "AH": ["ashtanga_hridaya.json"],
        "CS": ["charaka_samhita.json", "charaka_selected.json"],
        "SS": ["sushruta_samhita.json"],
    }[text_code]
    for name in candidates:
        p = DATA / "corpus" / name
        if not p.exists():
            continue
        if name not in _corpus_cache:
            _corpus_cache[name] = json.loads(p.read_text(encoding="utf-8"))
        ids = [v["id"] for v in _corpus_cache[name]["verses"] if v["sthana"] == sthana and v["chapter"] == chapter]
        if ids:
            return ids
    return []


def err(errors: list[str], path: Path, msg: str) -> None:
    errors.append(f"{path.relative_to(DATA)}: {msg}")


def need_text(errors, path, obj, key, ctx, devanagari=False):
    v = obj.get(key)
    if not isinstance(v, str) or not v.strip():
        err(errors, path, f"{ctx}: missing/empty '{key}'")
        return
    if devanagari and not DEV.search(v):
        err(errors, path, f"{ctx}: '{key}' should contain Devanagari")


def validate_translation(path: Path, errors: list[str]) -> int:
    d = json.loads(path.read_text(encoding="utf-8"))
    text_code, sthana, chap = path.parts[-3], path.parts[-2], int(path.stem)
    ch = d.get("chapter", {})
    for k in ["title_iast", "title_devanagari", "title_en", "title_hi", "summary_en", "summary_hi"]:
        need_text(errors, path, ch, k, "chapter", devanagari=k in ("title_devanagari", "title_hi", "summary_hi"))
    if ch.get("id") != f"{text_code}.{sthana}.{chap}":
        err(errors, path, f"chapter.id should be {text_code}.{sthana}.{chap}")
    expected = corpus_ids(text_code, sthana, chap)
    got = [v.get("id") for v in d.get("verses", [])]
    if expected and got != expected:
        missing = [i for i in expected if i not in got]
        extra = [i for i in got if i not in expected]
        err(errors, path, f"verse ids differ from corpus: missing={missing[:10]}{'...' if len(missing) > 10 else ''} extra={extra[:10]} (order must match too)")
    for v in d.get("verses", []):
        ctx = v.get("id", "?")
        for k in ["english", "hindi", "explanation_en", "explanation_hi"]:
            need_text(errors, path, v, k, ctx, devanagari=k in ("hindi", "explanation_hi"))
        wm = v.get("word_meanings")
        if not isinstance(wm, list) or not wm:
            err(errors, path, f"{ctx}: word_meanings must be a non-empty list")
        else:
            for w in wm:
                if not all(isinstance(w.get(k), str) and w.get(k) for k in ("sa", "iast", "en", "hi")):
                    err(errors, path, f"{ctx}: word_meanings entry missing sa/iast/en/hi: {w}")
                    break
        mc = v.get("modern_correlation", "MISSING")
        if mc == "MISSING":
            err(errors, path, f"{ctx}: modern_correlation key missing (use null when none)")
        elif mc is not None and not (isinstance(mc, dict) and mc.get("en") and mc.get("hi")):
            err(errors, path, f"{ctx}: modern_correlation must be null or {{en, hi}}")
        if v.get("importance") not in ("high", "medium", "low"):
            err(errors, path, f"{ctx}: importance must be high|medium|low")
        if v.get("review_status") not in ("ai_draft", "expert_reviewed"):
            err(errors, path, f"{ctx}: review_status missing")
    return len(got)


def validate_quiz(path: Path, errors: list[str]) -> int:
    d = json.loads(path.read_text(encoding="utf-8"))
    qs = d.get("questions", [])
    seen = set()
    for q in qs:
        ctx = q.get("id", "?")
        if ctx in seen:
            err(errors, path, f"duplicate id {ctx}")
        seen.add(ctx)
        need_text(errors, path, q, "question_en", ctx)
        need_text(errors, path, q, "question_hi", ctx, devanagari=True)
        need_text(errors, path, q, "explanation_en", ctx)
        need_text(errors, path, q, "explanation_hi", ctx, devanagari=True)
        opts = q.get("options", [])
        n = {"mcq": 4, "true_false": 2, "shloka_completion": 4}.get(q.get("type"))
        if n is None:
            err(errors, path, f"{ctx}: bad type {q.get('type')}")
        elif len(opts) != n:
            err(errors, path, f"{ctx}: expected {n} options, got {len(opts)}")
        if not all(isinstance(o, dict) and o.get("en") and o.get("hi") for o in opts):
            err(errors, path, f"{ctx}: every option needs en and hi")
        if not isinstance(q.get("answer_index"), int) or not 0 <= q["answer_index"] < max(len(opts), 1):
            err(errors, path, f"{ctx}: bad answer_index")
        if q.get("difficulty") not in ("easy", "medium", "hard"):
            err(errors, path, f"{ctx}: difficulty must be easy|medium|hard")
    return len(qs)


def validate_glossary(path: Path, errors: list[str]) -> int:
    d = json.loads(path.read_text(encoding="utf-8"))
    terms = d.get("terms", [])
    seen = set()
    for t in terms:
        ctx = t.get("id", "?")
        if ctx in seen:
            err(errors, path, f"duplicate id {ctx}")
        seen.add(ctx)
        need_text(errors, path, t, "devanagari", ctx, devanagari=True)
        for k in ("iast", "simple", "en", "category"):
            need_text(errors, path, t, k, ctx)
        need_text(errors, path, t, "hi", ctx, devanagari=True)
    return len(terms)


def main() -> int:
    errors: list[str] = []
    targets = [DATA / a for a in sys.argv[1:]] if len(sys.argv) > 1 else None
    files = targets or sorted(DATA.rglob("*.json"))
    counts: dict[str, int] = {}
    for f in files:
        rel = f.relative_to(DATA).parts
        try:
            if rel[0] == "translations":
                counts["verses translated"] = counts.get("verses translated", 0) + validate_translation(f, errors)
            elif rel[0] == "quiz":
                counts["quiz questions"] = counts.get("quiz questions", 0) + validate_quiz(f, errors)
            elif rel[0] == "glossary.json":
                counts["glossary terms"] = validate_glossary(f, errors)
            else:
                json.loads(f.read_text(encoding="utf-8"))
        except json.JSONDecodeError as e:
            err(errors, f, f"invalid JSON: {e}")
    for k, v in counts.items():
        print(f"{k}: {v}")
    if errors:
        print(f"\n{len(errors)} error(s):")
        for e in errors[:200]:
            print(" -", e)
        return 1
    print("OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
