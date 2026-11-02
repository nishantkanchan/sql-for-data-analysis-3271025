# Corpus: original Sanskrit texts

Read-only mūla text, one JSON file per work, record schema as in `docs/CONTENT_SCHEMA.md` section 1.
Each verse has `iast` and `devanagari`. Ids look like `<TEXT>.<sthana>.<chapter>.<verse>`.

| File | Work | Verses | Chapters | Source | License |
|---|---|---:|---:|---|---|
| `ashtanga_hridaya.json` | Aṣṭāṅgahṛdaya (complete) | 7,423 | 120 | GRETIL `vagaah_u.htm` (Das & Emmerick) | GRETIL: reference only |
| `charaka_selected.json` | Carakasaṃhitā, GRETIL selection (superseded, see below) | 596 | 11 (partial) | GRETIL `caraka_u.htm` (Hellwig) | GRETIL: reference only |
| `charaka_samhita.json` | **Carakasaṃhitā, complete** | 9,544 | 120/120 | DCS + MIU Vedic Reserve + Sanskrit Wikisource | mixed, per verse (see below) |
| `sushruta_samhita.json` | **Suśrutasaṃhitā, complete** | 8,238 | 186/186 | DCS | CC BY 4.0 |

Scripts (all in `content/scripts/`, all re-runnable):

```
python3 content/scripts/parse_gretil.py        # ashtanga_hridaya.json, charaka_selected.json
python3 content/scripts/fetch_dcs.py           # DCS sparse clone -> raw/dcs/*.jsonl (+ MANIFEST.json)
python3 content/scripts/fetch_web_sources.py   # Vedic Reserve + Wikisource pages -> raw/ (keeps existing files)
python3 content/scripts/build_samhitas.py --report   # charaka_samhita.json, sushruta_samhita.json, raw/build_report.json
```

Raw inputs live in `content/raw/<source>/`, each with a `MANIFEST.json` (URLs, fetch date, sha256, license).
`fetch_dcs.py` keeps the 38 MB annotated CoNLL-U clone in `~/.cache/shloka-setu/` and stores only a
text-only extract (6.4 MB) in the repository. The Vedic Reserve and Wikisource pages were fetched
with the Firecrawl scraper because the build container blocks those hosts; on an open network
`fetch_web_sources.py` downloads the same URLs directly.

## Record fields

Standard (schema section 1): `id, text, sthana, sthana_iast, sthana_devanagari, chapter, verse, iast, devanagari, variants`.

Added in `charaka_samhita.json` and `sushruta_samhita.json` (optional, the server schema is `.loose()`):

- `ref`: human citation, e.g. `Ca. Sū. 1.41`, `Ca. Ci. 1.2.41`, `Su. Sū. 15.41`.
- `source`: where this verse's text comes from: `dcs`, `vedicreserve` or `wikisource`.
- `pada`, `verse_in_pada`: only for Carakasaṃhitā Cikitsā 1 (rasāyana) and 2 (vājīkaraṇa).
  Each is split into four pādas that restart their verse numbering. To keep the four-part id
  (and the server's id regex `^[A-Z]{2,4}\.[a-z_]+\.\d+\.\d+[a-z]?$`), **the verse number is
  pada × 100 + verse**: `CS.chikitsa.1.241` = Ci. 1.2.41, `CS.chikitsa.2.455` = Ci. 2.4.55.
  No pāda has 100 verses (the build checks this).

Display conventions, the same as `ashtanga_hridaya.json`: lines are joined with ` |` / ` ।`, and the
verse ends with `|| N ||` / `॥ N ॥`. Prose passages are one record per printed number. Where the
e-text numbers items of a prose list inside a verse, the items stay in that verse with their
sub-number in brackets, e.g. `… (३)`.
Devanagari for DCS verses, and IAST for Devanagari-source verses, are machine transliterations
(`indic_transliteration`). DCS verses use the `to_devanagari` approach from `parse_gretil.py`:
a consonant-final word is joined to the next word within a line.

## charaka_samhita.json: complete Carakasaṃhitā (8 sthānas, 120 chapters)

All three e-texts follow the vulgate text and verse numbering of Jādavji Trikamji Ācārya's edition.
The build checks this: where two sources overlap, it compares the same verse numbers. The median
textual similarity was 1.0 for every overlapping chapter that was used (see `alignment` in
`raw/build_report.json`).

| Sthāna | Chapters | Verses | Source of the text |
|---|---:|---:|---|
| Sūtra | 30/30 | 1,957 | DCS 1,736 + Vedic Reserve 221 (Sū 1.131-140, 27.178-352, 30.34-68 and 30.90 are missing in DCS) |
| Nidāna | 8/8 | 247 | DCS 243 + Vedic Reserve 4 (Ni 1.1-2, 1.7-8) |
| Vimāna | 8/8 | 354 | DCS 343 + Vedic Reserve 11 (Vi 6.12-22) |
| Śārīra | 8/8 | 425 | DCS |
| Indriya | 12/12 | 379 | DCS 378 + Vedic Reserve 1 (In 11.20) |
| Cikitsā | 30/30 | 5,105 | DCS for Ci 1-5 (1,058 verses, incl. all 8 pādas of Ci 1-2); Vedic Reserve for Ci 6-30 (4,047) |
| Kalpa | 12/12 | 378 | Sanskrit Wikisource |
| Siddhi | 12/12 | 699 | Sanskrit Wikisource |
| **Total** | **120** | **9,544** | DCS 4,183 · Vedic Reserve 4,284 · Wikisource 1,077 |

The build fills a verse missing in DCS from Vedic Reserve only when the neighbouring verses carry the
same number with ≥ 0.8 textual similarity in both texts. In Sū 4, Sū 14 and Vi 5 the two texts
number verses differently, so those chapters stay DCS-only.

Known small gaps, where the source e-text itself skips a number: Ci 26.169, Ci 26.236 and Si 3.2
(Si 3.2 is the formula *iti ha smāha bhagavān ātreyaḥ*). The repairs the build made for numbering
typos in the e-texts are listed in `raw/build_report.json` → `log`.

### Licensing of charaka_samhita.json (read before publishing)

The Sanskrit work is in the public domain. The e-texts carry different terms, so check each verse's `source` field:

- `dcs` (4,183 verses): **CC BY 4.0.** Attribution: "Oliver Hellwig: The Digital Corpus of Sanskrit (DCS), 2010-2024".
- `wikisource` (1,077 verses, all of Kalpa and Siddhi): Wikisource text is **CC BY-SA 4.0**. Attribute "Sanskrit Wikisource contributors". Share-alike applies to that portion.
- `vedicreserve` (4,284 verses: Cikitsā 6-30 plus the gap fills above): Maharishi International
  University's Vedic Literature Collection states **no licence. Treat it as reference only.** Before
  public or commercial distribution, do one of these:
  - get written permission from MIU;
  - proof-read and re-key the text against a public-domain printing of the Trikamji edition;
  - replace it when an openly licensed e-text appears. The DCS may add these chapters, or Sanskrit
    Wikisource may get a Cikitsā page; today that page redirects to Śārīra.

### What is still missing, and why

The text itself is complete: all 120 chapters. The gap is licensing, not text. No openly licensed
machine-readable source exists today for Cikitsā 6-21 and 24-29, or for the larger parts of
Ci 22, 23 and 30:

- the DCS has only Ci 1-5 and fragments of 22, 23 and 30;
- Sanskrit Wikisource has no Cikitsā page;
- GRETIL has only a selection.

These verses therefore come from MIU Vedic Reserve, which is reference only (see above).

## sushruta_samhita.json: complete Suśrutasaṃhitā

Source: DCS (CoNLL-U dump, commit recorded in `raw/dcs/MANIFEST.json`). License: **CC BY 4.0**.

| Sthāna | Chapters | Verses |
|---|---:|---:|
| Sūtra | 46/46 | 2,029 |
| Nidāna | 16/16 | 530 |
| Śārīra | 10/10 | 441 |
| Cikitsā | 40/40 | 2,031 |
| Kalpa | 8/8 | 555 |
| Uttara(tantra) | 66/66 | 2,652 |
| **Total** | **186** | **8,238** |

Known gaps in the DCS numbering: Su Sū 3.11-21 (DCS leaves out most of this prose chapter that
lists the work's chapters), Sū 34.6, Sū 38.1-2 and Ci 30.3. The verse numbering is the DCS one,
for example Su Sū 15.41 *samadoṣaḥ samāgniś ca…*. Some printed editions number that verse 15.48,
because editions differ in how they count prose.

## charaka_selected.json (superseded; kept unchanged because translations reference it)

`charaka_samhita.json` supersedes it. `validate_content.py` already prefers `charaka_samhita.json`.
The server also loads the full file first, alphabetically, so on duplicate ids the full text wins.
Ids are compatible, except for these parsing problems in `charaka_selected.json`:

- `CS.chikitsa.1.*` there is Ci 1.1 (pāda 1). In the full file it is `CS.chikitsa.1.101` onwards.
- `CS.chikitsa.2.*` there is **Ci 1.2** (prāṇakāmīya rasāyanapāda), not Cikitsā 2. In the full file it is `CS.chikitsa.1.201` onwards.
- `CS.indriya.1.*` there is actually **Śārīra 1** (katidhāpuruṣīya). Compare `CS.sharira.1.*` in the full file.
- The first verse of several chapters contains GRETIL header lines (`*****`, `Carakasaṃhitā, Sūtrasthāna, 12`).
  It sometimes also contains the tail of the previous chapter, for example `CS.sutra.26.44` and `CS.vimana.1.1`.
- Its chapters are partial selections: for example, Sū 1 has 43 of 140 verses. A translation made from
  it covers only part of the chapter in the full corpus, so `validate_content.py` reports the
  missing ids.
- While both files sit in this folder, the server also loads the 106 ids that exist only in the
  selection: `CS.chikitsa.1.1-82` and `CS.chikitsa.2.1-24`. They would appear as extra, misnumbered
  Cikitsā verses. Once nothing depends on `charaka_selected.json`, move it out of `data/corpus/`.
