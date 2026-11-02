# Shloka Setu: content schema (source of truth)

Every content file lives under `shloka-setu/content/data/`. All files are UTF-8 JSON and
use `ensure_ascii=False` (real Devanagari, not `\u` escapes). The app and the API server
both read these shapes; do not change a field name without updating this document,
`app/src/types/content.ts` and `server/src/types.ts`.

Every AI-written record carries `"review_status": "ai_draft"`. A subject expert later
flips it to `"expert_reviewed"`. The app shows a small "AI draft, pending expert review"
badge on anything not reviewed.

IDs are stable and human-readable:
- Text codes: `AH` = Aṣṭāṅgahṛdaya, `CS` = Carakasaṃhitā, `SS` = Suśrutasaṃhitā.
- Sthāna keys: `sutra`, `nidana`, `vimana`, `sharira`, `indriya`, `chikitsa`, `kalpa`, `siddhi`, `uttara`.
- Verse id: `<TEXT>.<sthana>.<chapter>.<verse>`, for example `AH.sutra.1.6`.

---

## 1. Corpus: original Sanskrit (`content/data/corpus/<text>.json`)

Produced by `content/scripts/parse_gretil.py` (and other corpus scripts). Read-only source text.

```json
{
  "meta": { "title": "...", "title_devanagari": "...", "source": "...", "source_url": "...", "license_note": "...", "verse_count": 7423 },
  "verses": [
    {
      "id": "AH.sutra.1.6",
      "text": "ashtanga_hridaya",
      "sthana": "sutra",
      "sthana_iast": "Sūtrasthāna",
      "sthana_devanagari": "सूत्रस्थान",
      "chapter": 1,
      "verse": 6,
      "iast": "aṣṭāv aṅgāni tasyāhuś cikitsā yeṣu saṃśritā |\nvāyuḥ pittaṃ kaphaś ceti trayo doṣāḥ samāsataḥ || 6 ||",
      "devanagari": "अष्टावङ्गानि तस्याहुश्चिकित्सा येषु संश्रिता ।\nवायुः पित्तं कफश्चेति त्रयो दोषाः समासतः ॥ ६ ॥",
      "variants": [ { "pada": "b", "reading": "..." } ]
    }
  ]
}
```

## 2. Translations (`content/data/translations/<TEXT>/<sthana>/<chapter>.json`)

One file per chapter, for example `translations/AH/sutra/1.json`.

```json
{
  "chapter": {
    "id": "AH.sutra.1",
    "text": "ashtanga_hridaya",
    "sthana": "sutra",
    "chapter": 1,
    "title_iast": "Āyuṣkāmīya Adhyāya",
    "title_devanagari": "आयुष्कामीयोऽध्यायः",
    "title_en": "The chapter on the desire for long life",
    "title_hi": "आयुष्कामीय अध्याय (दीर्घ आयु की कामना)",
    "summary_en": "4-8 sentence overview of what the chapter teaches and why it matters for exams.",
    "summary_hi": "same in simple Hindi",
    "key_concepts": ["tridoṣa", "saptadhātu", "ṣaḍrasa"],
    "exam_focus_en": ["Frequently asked: the 8 branches (aṣṭāṅga) ...", "..."],
    "exam_focus_hi": ["..."],
    "syllabus_refs": ["AyUG-SA1"],
    "review_status": "ai_draft"
  },
  "verses": [
    {
      "id": "AH.sutra.1.6",
      "anvaya": "Optional: prose word order in IAST (Sanskrit), helps parsing",
      "word_meanings": [
        { "sa": "अष्टौ", "iast": "aṣṭau", "en": "eight", "hi": "आठ" },
        { "sa": "अङ्गानि", "iast": "aṅgāni", "en": "branches", "hi": "अंग / शाखाएँ" }
      ],
      "english": "Faithful, readable English translation of the verse.",
      "hindi": "सरल हिन्दी अनुवाद (देवनागरी में) - simple Hindi a first-year student understands.",
      "explanation_en": "2-5 sentences: what the verse means in context, how to remember it, how it links to other verses.",
      "explanation_hi": "same in simple Hindi",
      "modern_correlation": {
        "en": "Careful, non-overclaiming link to modern biology / physiology / medicine where a meaningful parallel exists. Say 'is often compared to' rather than 'is'.",
        "hi": "..."
      },
      "key_terms": ["doṣa", "vāta", "pitta", "kapha"],
      "tags": ["tridosha", "definitions"],
      "importance": "high",
      "mnemonic": "Optional memory aid",
      "review_status": "ai_draft"
    }
  ]
}
```

Rules:
- Exactly one verse object per corpus verse id in the chapter, in order. Do not invent verses.
  The Sanskrit itself is not repeated here: the app joins with the corpus by `id`.
- `modern_correlation` is `null` when no honest parallel exists (for example invocations or lists of foods).
- `importance`: `high` = commonly asked or foundational definition, `medium`, `low`.
- `word_meanings` covers every meaningful word (skip particles like ca, tu, hi, eva only when trivial).

## 3. Syllabus (`content/data/syllabus.json`)

```json
{
  "meta": { "regulator": "NCISM", "curriculum": "BAMS (CBDC) ...", "source_urls": ["..."], "as_of": "2026-11" },
  "professionals": [
    {
      "id": "prof1", "name_en": "First Professional BAMS", "name_hi": "प्रथम व्यावसायिक",
      "duration": "...",
      "subjects": [
        {
          "id": "AyUG-PV", "code": "AyUG-PV", "name_en": "Padartha Vigyan", "name_hi": "पदार्थ विज्ञान",
          "name_sa": "पदार्थविज्ञानम्", "description_en": "...",
          "papers": [ { "id": "AyUG-PV-P1", "name_en": "...", "topics": [ { "id": "pv-dravya", "name_en": "...", "name_hi": "...", "text_refs": ["CS.sutra.1"] } ] } ]
        }
      ]
    }
  ]
}
```

## 4. Quiz bank (`content/data/quiz/<subject_id>.json`)

```json
{
  "subject_id": "AyUG-PV",
  "questions": [
    {
      "id": "AyUG-PV-0001",
      "subject_id": "AyUG-PV",
      "topic_id": "pv-dravya",
      "type": "mcq",
      "question_en": "How many Dravyas (substances) are described by Charaka?",
      "question_hi": "चरक के अनुसार द्रव्य कितने हैं?",
      "options": [ { "en": "Five", "hi": "पाँच" }, { "en": "Nine", "hi": "नौ" }, { "en": "Seven", "hi": "सात" }, { "en": "Six", "hi": "छह" } ],
      "answer_index": 1,
      "explanation_en": "Why the answer is correct and the others are not.",
      "explanation_hi": "...",
      "reference": "CS.sutra.1.48",
      "difficulty": "easy",
      "exam_tags": ["university", "aiapget"],
      "review_status": "ai_draft"
    }
  ]
}
```
`type` is `mcq` (4 options), `true_false` (2 options: True/False), or `shloka_completion`
(the stem gives part of a verse and the options complete it; put the Devanagari in `question_sa`).

## 5. Glossary (`content/data/glossary.json`)

```json
{
  "terms": [
    {
      "id": "dosha",
      "devanagari": "दोष",
      "iast": "doṣa",
      "simple": "Dosha",
      "en": "Functional bio-regulatory principle; literally 'that which vitiates'.",
      "hi": "दोष - शरीर के क्रियात्मक तत्व (वात, पित्त, कफ)",
      "modern": "Often compared to regulatory systems: Vāta ~ neural/kinetic, Pitta ~ metabolic/enzymatic, Kapha ~ structural/anabolic.",
      "category": "siddhanta",
      "source_refs": ["AH.sutra.1.6"],
      "related": ["vata", "pitta", "kapha"],
      "review_status": "ai_draft"
    }
  ]
}
```
`category` is one of: `siddhanta` (fundamental principles), `padartha`, `sharira` (anatomy),
`kriya` (physiology), `dravyaguna`, `rasashastra`, `nidana` (pathology/diagnosis),
`chikitsa` (therapeutics), `panchakarma`, `swasthavritta`, `shalya`, `shalakya`,
`prasuti`, `kaumarabhritya`, `agada`, `sanskrit` (grammar/language), `general`.

## 6. API (server) contracts

See `server/README.md`. Summary:
- `POST /v1/scan`: `{ imageBase64, mediaType, lang? }` gives `ScanResult`.
- `POST /v1/explain`: `{ text, lang? }` (Devanagari or IAST) gives `ScanResult`.
- `POST /v1/tutor`: `{ messages: [{role, content}], verseId? }` gives `{ reply }`.
- `GET /v1/search?q=`: fuzzy search over the corpus, works without an LLM.

`ScanResult`:
```json
{
  "ocr_text": "Devanagari as read from the image",
  "iast": "...",
  "match": { "id": "AH.sutra.1.6", "score": 0.92, "source_title": "Aṣṭāṅgahṛdaya, Sūtrasthāna 1.6" },
  "word_meanings": [ { "sa": "", "iast": "", "en": "", "hi": "" } ],
  "english": "", "hindi": "",
  "explanation_en": "", "explanation_hi": "",
  "modern_correlation": { "en": "", "hi": "" },
  "key_terms": [],
  "related_verse_ids": [],
  "confidence": "high | medium | low",
  "disclaimer": "AI-generated study aid. Verify with your teacher and the classical text."
}
```
