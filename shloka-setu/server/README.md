# Shloka Setu API (server)

Backend for **Shloka Setu**, a phone app that helps BAMS (Ayurveda) students read the Sanskrit classics
(Carakasaṃhitā, Suśrutasaṃhitā, Aṣṭāṅgahṛdaya). A student photographs a shloka; the API returns the
Devanagari, the source verse, word-by-word meanings, English and Hindi translations, an explanation and a careful
modern-science correlation. There is also a Socratic AI tutor.

Stack: Node 22 + TypeScript (ESM), [Hono](https://hono.dev) on `@hono/node-server`, the official Anthropic
TypeScript SDK, zod, vitest. No database: content is read from `../content/data` at startup.

- [Quick start](#quick-start)
- [How it works](#how-it-works)
- [Endpoints](#endpoints) with curl examples and real outputs (mock mode)
- [Errors](#errors)
- [Configuration](#configuration)
- [Cost notes](#cost-notes)
- [Deployment](#deployment)
- [Development](#development)

## Quick start

```bash
cd shloka-setu/server
npm ci
cp .env.example .env        # optional; leave ANTHROPIC_API_KEY empty for mock mode
npm run dev                 # http://localhost:8787 (tsx watch)
# or
npm run build && npm start  # node dist/index.js
```

`.env` is not loaded automatically; export the variables or use `node --env-file=.env dist/index.js`
(`npm run dev` users: `npx tsx --env-file=.env watch src/index.ts`).

**Mock mode.** Without `ANTHROPIC_API_KEY` the server still runs. `/v1/search`, `/v1/verse` and curated
`/v1/explain` work fully (they never call an LLM). `/v1/scan` returns a demo ScanResult for AH.sutra.1.6 and
`/v1/tutor` returns a canned reply with real retrieved verse citations; both are flagged `"mock": true` and carry a
`notice`. `GET /health` reports `"mock": true`. This lets the mobile app be demoed and tested end to end without a key.

## How it works

```
photo ──► /v1/scan ──► Claude vision OCR (transcribe Devanagari only)
                              │
text ───► /v1/explain ◄───────┘
              │
              ├─ fuzzy retrieval over all corpus verses (no LLM)
              │
              ├─ strong match (score ≥ 0.65, clear margin) AND a curated translation exists
              │        └─► curated ScanResult, no LLM call  (cheap, expert-reviewable)
              │
              └─ otherwise ─► Claude writes the ScanResult as strict JSON (structured outputs),
                              grounded on the top-5 candidate verses; it must say when the verse
                              is not in our corpus. Output is re-validated with zod, retried once.
```

**Fuzzy search** (`src/search/`). Every verse and every query is reduced to a diacritic-free ASCII skeleton:
Devanagari → IAST (small built-in transliterator, `src/search/translit.ts`), strip diacritics, daṇḍas, digits,
hyphens, spaces and avagraha, then fold spelling variants (`sh/ś/ṣ→s`, aspirates `kh→k`, visarga dropped, `v/b`,
`ri/ṛ→r`, `ṃ/m/n` before consonants `→n`, `ee→i`, `oo→u`, doubled letters collapsed). So `वायुः पित्तं`,
`vāyuḥ pittaṃ` and `vayuh pittam` meet. Verses are indexed by character trigrams (long prose passages as
overlapping windows); candidates are scored by trigram containment/coverage plus a longest-common-substring bonus,
and very short queries are down-weighted. Typical scores: exact verse 0.9 to 1.0, a single line or an OCR-noisy line
0.6 to 0.9, unrelated text under 0.5.

**Content loading** (`src/content/`). All `corpus/*.json` (if two files cover the same text code, the one with more
verses wins, so the complete `charaka_samhita.json` supersedes the obsolete `charaka_selected.json` and no
selection-only ids leak in), every
`translations/<TEXT>/<sthana>/<chapter>.json`, and optional `glossary.json` / `syllabus.json`. Partial files are
handled: empty or truncated JSON (a file still being written) is skipped and logged, invalid records are skipped,
missing fields get defaults. Every `CONTENT_RELOAD_SECONDS` (default 60) the server checks file sizes/mtimes and
re-loads atomically if anything changed, so new translations show up without a restart.

**Claude calls** (`src/llm/`). All calls go through one wrapper: static system prompt with `cache_control`
(prompt caching), volatile data only in the user turn, `output_config.effort` per route, structured outputs
(`output_config.format` with a strict JSON schema) for OCR and explain, typed SDK error mapping to friendly errors,
`stop_reason` checks (refusal, max_tokens), and the server-side refusal fallback (`fallbacks: "default"`) for models
that support it. The client is dependency-injected (`createApp({ client })`), so tests use a fake.

## Endpoints

Base URL: `http://localhost:8787` in development, your deployment URL in production. All bodies are JSON
(`Content-Type: application/json`). All responses are JSON. The outputs below are **real responses from this server
in mock mode** (no API key), captured with the commands shown; long `word_meanings` arrays are cut to 2 entries
where marked (`"… (n more)"`).

### `GET /health`

```bash
curl -s http://localhost:8787/health
```

```json
{
  "status": "ok",
  "version": "0.1.0",
  "mock": true,
  "model": null,
  "content": {
    "verses": 25204,
    "texts": {
      "AH": 7422,
      "CS": 9544,
      "SS": 8238
    },
    "translated_verses": 1089,
    "chapters_with_translation": 21,
    "glossary_terms": 375,
    "syllabus": false,
    "skipped_files": 1,
    "loaded_at": "2026-11-02T00:51:58.368Z"
  },
  "uptime_s": 41
}
```

### `GET /v1/search?q=&limit=&text=`

Fuzzy search over all corpus verses, no LLM. `q`: Devanagari, IAST or loose romanisation (1 to 1000 chars).
`limit`: 1 to 50 (default 10). `text` (optional): `AH`, `CS` or `SS`. Each result is a verse record joined with
its translation (`translation` is `null` if no curated translation exists yet) plus `score` (0 to 1).

```bash
curl -s "http://localhost:8787/v1/search?q=vayuh%20pittam%20kaphashceti&limit=1"
```

```json
{
  "query": "vayuh pittam kaphashceti",
  "count": 1,
  "results": [
    {
      "score": 0.739,
      "id": "AH.sutra.1.6",
      "text": "ashtanga_hridaya",
      "text_code": "AH",
      "sthana": "sutra",
      "sthana_iast": "Sūtrasthāna",
      "sthana_devanagari": "सूत्रस्थान",
      "chapter": 1,
      "verse": 6,
      "iast": "aṣṭāv aṅgāni tasyāhuś cikitsā yeṣu saṃśritā |\nvāyuḥ pittaṃ kaphaś ceti trayo doṣāḥ samāsataḥ || 6 ||",
      "devanagari": "अष्टावङ्गानि तस्याहुश्चिकित्सा येषु संश्रिता ।\nवायुः पित्तं कफश्चेति त्रयो दोषाः समासतः ॥ ६ ॥",
      "variants": [],
      "ref": null,
      "source": null,
      "pada": null,
      "verse_in_pada": null,
      "source_title": "Aṣṭāṅgahṛdaya, Sūtrasthāna 1.6",
      "translation": {
        "id": "AH.sutra.1.6",
        "anvaya": "",
        "word_meanings": [
          {
            "sa": "अष्टौ",
            "iast": "aṣṭau",
            "en": "eight",
            "hi": "आठ"
          },
          {
            "sa": "अङ्गानि",
            "iast": "aṅgāni",
            "en": "branches",
            "hi": "अंग"
          },
          "… (12 more)"
        ],
        "english": "...these are declared to be its eight branches, on which treatment rests. Vāyu (vāta), pitta and kapha are, in brief, the three doṣas (functional principles of the body).",
        "hindi": "...ये आयुर्वेद के आठ अंग कहे गए हैं, जिन पर पूरी चिकित्सा आधारित है। संक्षेप में वायु (वात), पित्त और कफ, ये तीन दोष हैं।",
        "explanation_en": "The first line closes the list of eight branches. The second line introduces the central theory of the whole text: tridoṣa. 'Samāsataḥ' (in brief) indicates that each doṣa has subtypes (five each), described in chapter 12. Note that Vāgbhaṭa lists vāyu first because it is the strongest and the mover of the other two.",
        "explanation_hi": "पहली पंक्ति आठ अंगों की सूची पूरी करती है। दूसरी पंक्ति पूरे ग्रन्थ का मूल सिद्धान्त, त्रिदोष, बताती है। 'समासतः' (संक्षेप में) का अर्थ है कि हर दोष के आगे पाँच-पाँच भेद हैं, जो अध्याय 12 में बताए गए हैं। वायु को पहले इसलिए रखा गया क्योंकि वह सबसे बलवान है और बाकी दोनों को चलाता है।",
        "modern_correlation": {
          "en": "The three doṣas are often compared to broad regulatory functions: vāta to movement and neural signalling, pitta to metabolism and enzymatic transformation, and kapha to structure, cohesion and lubrication. These are teaching analogies, not one-to-one equivalents.",
          "hi": "तीनों दोषों की तुलना अक्सर शरीर के बड़े नियामक कार्यों से की जाती है: वात को गति और तंत्रिका संकेतों से, पित्त को चयापचय (metabolism) और एंज़ाइम से, और कफ को संरचना, जुड़ाव और चिकनाई से। ये केवल समझाने की उपमाएँ हैं, एकदम बराबर नहीं।"
        },
        "key_terms": [
          "tridoṣa",
          "vāta",
          "pitta",
          "kapha",
          "doṣa"
        ],
        "tags": [
          "tridosha",
          "definitions"
        ],
        "importance": "high",
        "mnemonic": "",
        "review_status": "ai_draft"
      },
      "chapter_info": {
        "id": "AH.sutra.1",
        "title_iast": "Āyuṣkāmīya Adhyāya",
        "title_devanagari": "आयुष्कामीयोऽध्यायः",
        "title_en": "The chapter on the desire for long life",
        "title_hi": "आयुष्कामीय अध्याय (दीर्घ आयु की कामना)"
      }
    }
  ]
}
```

### `GET /v1/verse/:id`

Verse plus translation, chapter info and neighbours (`prev_id` / `next_id`, `null` at a text boundary).
404 if the id does not exist. Verse records (here and in search results) pass through the corpus display fields
`ref` (e.g. `"Ca. Ci. 1.2.2"`; use it as the reference label when non-null), `source` (per-verse provenance such as
`dcs`), `pada` and `verse_in_pada` (Caraka Cikitsā 1-2, whose ids encode pāda×100+verse); they are `null` when the
corpus has none (Aṣṭāṅgahṛdaya). `source_title` is pāda-aware ("Cikitsāsthāna 1.2.2", not "1.202").

```bash
curl -s http://localhost:8787/v1/verse/AH.sutra.1.6
```

```json
{
  "id": "AH.sutra.1.6",
  "text": "ashtanga_hridaya",
  "text_code": "AH",
  "sthana": "sutra",
  "sthana_iast": "Sūtrasthāna",
  "sthana_devanagari": "सूत्रस्थान",
  "chapter": 1,
  "verse": 6,
  "iast": "aṣṭāv aṅgāni tasyāhuś cikitsā yeṣu saṃśritā |\nvāyuḥ pittaṃ kaphaś ceti trayo doṣāḥ samāsataḥ || 6 ||",
  "devanagari": "अष्टावङ्गानि तस्याहुश्चिकित्सा येषु संश्रिता ।\nवायुः पित्तं कफश्चेति त्रयो दोषाः समासतः ॥ ६ ॥",
  "variants": [],
  "ref": null,
  "source": null,
  "pada": null,
  "verse_in_pada": null,
  "source_title": "Aṣṭāṅgahṛdaya, Sūtrasthāna 1.6",
  "translation": {
    "id": "AH.sutra.1.6",
    "anvaya": "",
    "word_meanings": [
      {
        "sa": "अष्टौ",
        "iast": "aṣṭau",
        "en": "eight",
        "hi": "आठ"
      },
      {
        "sa": "अङ्गानि",
        "iast": "aṅgāni",
        "en": "branches",
        "hi": "अंग"
      },
      "… (12 more)"
    ],
    "english": "...these are declared to be its eight branches, on which treatment rests. Vāyu (vāta), pitta and kapha are, in brief, the three doṣas (functional principles of the body).",
    "hindi": "...ये आयुर्वेद के आठ अंग कहे गए हैं, जिन पर पूरी चिकित्सा आधारित है। संक्षेप में वायु (वात), पित्त और कफ, ये तीन दोष हैं।",
    "explanation_en": "The first line closes the list of eight branches. The second line introduces the central theory of the whole text: tridoṣa. 'Samāsataḥ' (in brief) indicates that each doṣa has subtypes (five each), described in chapter 12. Note that Vāgbhaṭa lists vāyu first because it is the strongest and the mover of the other two.",
    "explanation_hi": "पहली पंक्ति आठ अंगों की सूची पूरी करती है। दूसरी पंक्ति पूरे ग्रन्थ का मूल सिद्धान्त, त्रिदोष, बताती है। 'समासतः' (संक्षेप में) का अर्थ है कि हर दोष के आगे पाँच-पाँच भेद हैं, जो अध्याय 12 में बताए गए हैं। वायु को पहले इसलिए रखा गया क्योंकि वह सबसे बलवान है और बाकी दोनों को चलाता है।",
    "modern_correlation": {
      "en": "The three doṣas are often compared to broad regulatory functions: vāta to movement and neural signalling, pitta to metabolism and enzymatic transformation, and kapha to structure, cohesion and lubrication. These are teaching analogies, not one-to-one equivalents.",
      "hi": "तीनों दोषों की तुलना अक्सर शरीर के बड़े नियामक कार्यों से की जाती है: वात को गति और तंत्रिका संकेतों से, पित्त को चयापचय (metabolism) और एंज़ाइम से, और कफ को संरचना, जुड़ाव और चिकनाई से। ये केवल समझाने की उपमाएँ हैं, एकदम बराबर नहीं।"
    },
    "key_terms": [
      "tridoṣa",
      "vāta",
      "pitta",
      "kapha",
      "doṣa"
    ],
    "tags": [
      "tridosha",
      "definitions"
    ],
    "importance": "high",
    "mnemonic": "",
    "review_status": "ai_draft"
  },
  "chapter_info": {
    "id": "AH.sutra.1",
    "title_iast": "Āyuṣkāmīya Adhyāya",
    "title_devanagari": "आयुष्कामीयोऽध्यायः",
    "title_en": "The chapter on the desire for long life",
    "title_hi": "आयुष्कामीय अध्याय (दीर्घ आयु की कामना)"
  },
  "prev_id": "AH.sutra.1.5",
  "next_id": "AH.sutra.1.7"
}
```

A Caraka verse with `ref` and pāda numbering (no curated translation yet, so `translation` is `null`):

```bash
curl -s http://localhost:8787/v1/verse/CS.chikitsa.1.202
```

```json
{
  "id": "CS.chikitsa.1.202",
  "text": "charaka_samhita",
  "text_code": "CS",
  "sthana": "chikitsa",
  "sthana_iast": "Cikitsāsthāna",
  "sthana_devanagari": "चिकित्सास्थान",
  "chapter": 1,
  "verse": 202,
  "iast": "iti ha smāha bhagavān ātreyaḥ || 2 ||",
  "devanagari": "इति ह स्माह भगवानात्रेयः ॥ २ ॥",
  "variants": [],
  "ref": "Ca. Ci. 1.2.2",
  "source": "dcs",
  "pada": 2,
  "verse_in_pada": 2,
  "source_title": "Carakasaṃhitā, Cikitsāsthāna 1.2.2",
  "translation": null,
  "chapter_info": null,
  "prev_id": "CS.chikitsa.1.201",
  "next_id": "CS.chikitsa.1.203"
}
```

### `POST /v1/explain`

Body: `{ "text": string (2 to 3000 chars, Devanagari / IAST / loose), "lang"?: "en" | "hi" | "hinglish" }`.
Returns a `ScanResult` (see [Response shapes](#response-shapes)).

Curated path (strong match + curated translation, no LLM call, works in mock mode):

```bash
curl -s -X POST http://localhost:8787/v1/explain \
  -H 'content-type: application/json' \
  -d '{"text":"वायुः पित्तं कफश्चेति त्रयो दोषाः समासतः"}'
```

```json
{
  "ocr_text": "वायुः पित्तं कफश्चेति त्रयो दोषाः समासतः",
  "iast": "aṣṭāv aṅgāni tasyāhuś cikitsā yeṣu saṃśritā |\nvāyuḥ pittaṃ kaphaś ceti trayo doṣāḥ samāsataḥ || 6 ||",
  "devanagari": "अष्टावङ्गानि तस्याहुश्चिकित्सा येषु संश्रिता ।\nवायुः पित्तं कफश्चेति त्रयो दोषाः समासतः ॥ ६ ॥",
  "match": {
    "id": "AH.sutra.1.6",
    "score": 0.901,
    "source_title": "Aṣṭāṅgahṛdaya, Sūtrasthāna 1.6",
    "ref": null
  },
  "word_meanings": [
    {
      "sa": "अष्टौ",
      "iast": "aṣṭau",
      "en": "eight",
      "hi": "आठ"
    },
    {
      "sa": "अङ्गानि",
      "iast": "aṅgāni",
      "en": "branches",
      "hi": "अंग"
    },
    "… (12 more)"
  ],
  "english": "...these are declared to be its eight branches, on which treatment rests. Vāyu (vāta), pitta and kapha are, in brief, the three doṣas (functional principles of the body).",
  "hindi": "...ये आयुर्वेद के आठ अंग कहे गए हैं, जिन पर पूरी चिकित्सा आधारित है। संक्षेप में वायु (वात), पित्त और कफ, ये तीन दोष हैं।",
  "explanation_en": "The first line closes the list of eight branches. The second line introduces the central theory of the whole text: tridoṣa. 'Samāsataḥ' (in brief) indicates that each doṣa has subtypes (five each), described in chapter 12. Note that Vāgbhaṭa lists vāyu first because it is the strongest and the mover of the other two.",
  "explanation_hi": "पहली पंक्ति आठ अंगों की सूची पूरी करती है। दूसरी पंक्ति पूरे ग्रन्थ का मूल सिद्धान्त, त्रिदोष, बताती है। 'समासतः' (संक्षेप में) का अर्थ है कि हर दोष के आगे पाँच-पाँच भेद हैं, जो अध्याय 12 में बताए गए हैं। वायु को पहले इसलिए रखा गया क्योंकि वह सबसे बलवान है और बाकी दोनों को चलाता है।",
  "modern_correlation": {
    "en": "The three doṣas are often compared to broad regulatory functions: vāta to movement and neural signalling, pitta to metabolism and enzymatic transformation, and kapha to structure, cohesion and lubrication. These are teaching analogies, not one-to-one equivalents.",
    "hi": "तीनों दोषों की तुलना अक्सर शरीर के बड़े नियामक कार्यों से की जाती है: वात को गति और तंत्रिका संकेतों से, पित्त को चयापचय (metabolism) और एंज़ाइम से, और कफ को संरचना, जुड़ाव और चिकनाई से। ये केवल समझाने की उपमाएँ हैं, एकदम बराबर नहीं।"
  },
  "key_terms": [
    "tridoṣa",
    "vāta",
    "pitta",
    "kapha",
    "doṣa"
  ],
  "related_verse_ids": [
    "CS.sutra.1.57",
    "AH.sutra.1.5",
    "AH.sutra.1.7"
  ],
  "confidence": "high",
  "disclaimer": "AI-generated study aid. Verify with your teacher and the classical text.",
  "source": "curated",
  "in_corpus": true,
  "review_status": "ai_draft",
  "candidates": [
    {
      "id": "AH.sutra.1.6",
      "score": 0.901,
      "source_title": "Aṣṭāṅgahṛdaya, Sūtrasthāna 1.6",
      "ref": null
    },
    {
      "id": "CS.sutra.1.57",
      "score": 0.5,
      "source_title": "Carakasaṃhitā, Sūtrasthāna 1.57",
      "ref": "Ca. Sū. 1.57"
    },
    {
      "id": "SS.sharira.5.6",
      "score": 0.399,
      "source_title": "Suśrutasaṃhitā, Śārīrasthāna 5.6",
      "ref": "Su. Śā. 5.6"
    },
    {
      "id": "CS.sutra.26.8",
      "score": 0.375,
      "source_title": "Carakasaṃhitā, Sūtrasthāna 26.8",
      "ref": "Ca. Sū. 26.8"
    },
    {
      "id": "CS.nidana.5.3",
      "score": 0.367,
      "source_title": "Carakasaṃhitā, Nidānasthāna 5.3",
      "ref": "Ca. Ni. 5.3"
    }
  ],
  "mock": false
}
```

Strong corpus match but no curated translation yet, in mock mode (with a key this goes to Claude and returns
`"source": "ai"`):

```bash
curl -s -X POST http://localhost:8787/v1/explain \
  -H 'content-type: application/json' \
  -d '{"text":"pakvashaya kati sakthi shrotra asthi sparshanendriyam"}'
```

```json
{
  "ocr_text": "pakvashaya kati sakthi shrotra asthi sparshanendriyam",
  "iast": "pakvāśaya-kaṭī-sakthi-śrotrāsthi-sparśanendriyam |\nsthānaṃ vātasya tatrāpi pakvādhānaṃ viśeṣataḥ || 1 ||",
  "devanagari": "पक्वाशयकटीसक्थिश्रोत्रास्थिस्पर्शनेन्द्रियम् ।\nस्थानं वातस्य तत्रापि पक्वाधानं विशेषतः ॥ १ ॥",
  "match": {
    "id": "AH.sutra.12.1",
    "score": 0.891,
    "source_title": "Aṣṭāṅgahṛdaya, Sūtrasthāna 12.1",
    "ref": null
  },
  "word_meanings": [],
  "english": "",
  "hindi": "",
  "explanation_en": "",
  "explanation_hi": "",
  "modern_correlation": null,
  "key_terms": [],
  "related_verse_ids": [
    "AH.sutra.11.45",
    "AH.sutra.12.2"
  ],
  "confidence": "low",
  "disclaimer": "AI-generated study aid. Verify with your teacher and the classical text.",
  "source": "corpus_only",
  "in_corpus": true,
  "review_status": "ai_draft",
  "candidates": [
    {
      "id": "AH.sutra.12.1",
      "score": 0.891,
      "source_title": "Aṣṭāṅgahṛdaya, Sūtrasthāna 12.1",
      "ref": null
    },
    {
      "id": "SS.sutra.10.5",
      "score": 0.413,
      "source_title": "Suśrutasaṃhitā, Sūtrasthāna 10.5",
      "ref": "Su. Sū. 10.5"
    },
    {
      "id": "SS.sharira.9.7",
      "score": 0.406,
      "source_title": "Suśrutasaṃhitā, Śārīrasthāna 9.7",
      "ref": "Su. Śā. 9.7"
    },
    {
      "id": "CS.sutra.11.48",
      "score": 0.386,
      "source_title": "Carakasaṃhitā, Sūtrasthāna 11.48",
      "ref": "Ca. Sū. 11.48"
    },
    {
      "id": "CS.sutra.12.8",
      "score": 0.361,
      "source_title": "Carakasaṃhitā, Sūtrasthāna 12.8",
      "ref": "Ca. Sū. 12.8"
    }
  ],
  "mock": true,
  "notice": "Demo mode: AI explanations need an Anthropic API key on the server. Showing the closest verse from the corpus."
}
```

### `POST /v1/scan`

Body: `{ "imageBase64": string, "mediaType": "image/jpeg" | "image/png" | "image/webp" | "image/gif", "lang"?: ... }`.
`imageBase64` may be bare base64 or a data URL (`data:image/jpeg;base64,...`). Max decoded size 5 MB
(`MAX_IMAGE_BYTES`); the real type is taken from the file's magic bytes. Step 1 is Claude vision OCR (transcribe
the Devanagari exactly, line by line, no translation); step 2 is the `/v1/explain` flow on that text. The result
adds `ocr_text` and `ocr_legibility` (`clear | partial | poor`). If no Devanagari is found: 422 `no_text_found`.

**App tip:** resize photos to about 1500 px on the long edge, JPEG quality ~80 (200 to 400 KB) before upload.
Claude downsizes large images anyway, so bigger uploads only cost bandwidth and latency.

```bash
IMG=$(base64 -w0 shloka.jpg)     # macOS: base64 -i shloka.jpg
curl -s -X POST http://localhost:8787/v1/scan \
  -H 'content-type: application/json' \
  -d "{\"imageBase64\":\"$IMG\",\"mediaType\":\"image/jpeg\"}"
```

Mock mode (the image is validated but not read; a demo result for AH.sutra.1.6 is returned):

```json
{
  "ocr_text": "अष्टावङ्गानि तस्याहुश्चिकित्सा येषु संश्रिता ।\nवायुः पित्तं कफश्चेति त्रयो दोषाः समासतः ॥ ६ ॥",
  "iast": "aṣṭāv aṅgāni tasyāhuś cikitsā yeṣu saṃśritā |\nvāyuḥ pittaṃ kaphaś ceti trayo doṣāḥ samāsataḥ || 6 ||",
  "devanagari": "अष्टावङ्गानि तस्याहुश्चिकित्सा येषु संश्रिता ।\nवायुः पित्तं कफश्चेति त्रयो दोषाः समासतः ॥ ६ ॥",
  "match": {
    "id": "AH.sutra.1.6",
    "score": 1,
    "source_title": "Aṣṭāṅgahṛdaya, Sūtrasthāna 1.6",
    "ref": null
  },
  "word_meanings": [
    {
      "sa": "अष्टौ",
      "iast": "aṣṭau",
      "en": "eight",
      "hi": "आठ"
    },
    {
      "sa": "अङ्गानि",
      "iast": "aṅgāni",
      "en": "branches",
      "hi": "अंग"
    },
    "… (12 more)"
  ],
  "english": "...these are declared to be its eight branches, on which treatment rests. Vāyu (vāta), pitta and kapha are, in brief, the three doṣas (functional principles of the body).",
  "hindi": "...ये आयुर्वेद के आठ अंग कहे गए हैं, जिन पर पूरी चिकित्सा आधारित है। संक्षेप में वायु (वात), पित्त और कफ, ये तीन दोष हैं।",
  "explanation_en": "The first line closes the list of eight branches. The second line introduces the central theory of the whole text: tridoṣa. 'Samāsataḥ' (in brief) indicates that each doṣa has subtypes (five each), described in chapter 12. Note that Vāgbhaṭa lists vāyu first because it is the strongest and the mover of the other two.",
  "explanation_hi": "पहली पंक्ति आठ अंगों की सूची पूरी करती है। दूसरी पंक्ति पूरे ग्रन्थ का मूल सिद्धान्त, त्रिदोष, बताती है। 'समासतः' (संक्षेप में) का अर्थ है कि हर दोष के आगे पाँच-पाँच भेद हैं, जो अध्याय 12 में बताए गए हैं। वायु को पहले इसलिए रखा गया क्योंकि वह सबसे बलवान है और बाकी दोनों को चलाता है।",
  "modern_correlation": {
    "en": "The three doṣas are often compared to broad regulatory functions: vāta to movement and neural signalling, pitta to metabolism and enzymatic transformation, and kapha to structure, cohesion and lubrication. These are teaching analogies, not one-to-one equivalents.",
    "hi": "तीनों दोषों की तुलना अक्सर शरीर के बड़े नियामक कार्यों से की जाती है: वात को गति और तंत्रिका संकेतों से, पित्त को चयापचय (metabolism) और एंज़ाइम से, और कफ को संरचना, जुड़ाव और चिकनाई से। ये केवल समझाने की उपमाएँ हैं, एकदम बराबर नहीं।"
  },
  "key_terms": [
    "tridoṣa",
    "vāta",
    "pitta",
    "kapha",
    "doṣa"
  ],
  "related_verse_ids": [
    "AH.sutra.1.5",
    "AH.sutra.1.7"
  ],
  "confidence": "high",
  "disclaimer": "AI-generated study aid. Verify with your teacher and the classical text.",
  "source": "mock",
  "in_corpus": true,
  "review_status": "ai_draft",
  "candidates": [
    {
      "id": "AH.sutra.1.6",
      "score": 1,
      "source_title": "Aṣṭāṅgahṛdaya, Sūtrasthāna 1.6",
      "ref": null
    }
  ],
  "mock": true,
  "notice": "Demo mode: the photo was not read (no Anthropic API key on the server). This is a sample result for Aṣṭāṅgahṛdaya Sūtrasthāna 1.6.",
  "ocr_legibility": "clear"
}
```

### `POST /v1/tutor`

Body:
```json
{
  "messages": [ { "role": "user" | "assistant", "content": "string (1-4000 chars)" } ],
  "verseId": "AH.sutra.1.6",
  "lang": "en" | "hi" | "hinglish"
}
```
1 to 40 messages, the last one from the user. The server keeps only the last `TUTOR_MAX_HISTORY` (12) messages and
clips older ones. `verseId` (optional) pins a verse into the context (404 if unknown). `lang` omitted means "reply
in the student's own language and script". For the latest question the server retrieves up to 4 relevant verses
(the pinned verse, verse ids mentioned in the question, trigram matches for quoted Sanskrit, keyword matches over
curated translations, glossary terms) and passes them to Claude, which cites them inline as `[AH.sutra.1.6]`.

Response: `{ reply, citations, context_verse_ids, disclaimer, mock, model? }`. `citations` are the verse ids that
appear in the reply and exist in the corpus (hallucinated ids are dropped); `context_verse_ids` are the verses that
were given to the model. The tutor is a study aid: it refuses to diagnose or prescribe for real people and points
to a qualified vaidya or doctor (emergencies: 112 / 108).

```bash
curl -s -X POST http://localhost:8787/v1/tutor \
  -H 'content-type: application/json' \
  -d '{"messages":[{"role":"user","content":"vayuh pittam kaphashceti trayo doshah ka matlab samjhao"}],"lang":"hinglish"}'
```

Mock mode:

```json
{
  "reply": "[Demo mode] The AI tutor needs an Anthropic API key on the server. Here are the verses Shloka Setu found for your question:\n\n- [AH.sutra.1.6] Aṣṭāṅgahṛdaya, Sūtrasthāna 1.6: aṣṭāv aṅgāni tasyāhuś cikitsā yeṣu saṃśritā (...these are declared to be its eight branches, on which treatment rests. Vāyu (vāta), pitta and kapha are, in brief, the three doṣas (functional principles of  …)\n- [AH.sutra.9.8] Aṣṭāṅgahṛdaya, Sūtrasthāna 9.8: āgneyaṃ dāha-bhā-varṇa-prakāśa-pavanātmakam (...is āgneya (fiery); it produces burning, lustre, complexion and illumination. The vāyavya (airy) substance, of the nature of air (pavana), is predominant in d …)\n\nOpen them in the app for word meanings and translations. Remember: this is a study aid, not medical advice.",
  "citations": [
    "AH.sutra.1.6",
    "AH.sutra.9.8"
  ],
  "context_verse_ids": [
    "AH.sutra.1.6",
    "AH.sutra.9.8"
  ],
  "disclaimer": "Study aid only, not medical advice. For any health problem, consult a qualified vaidya or doctor.",
  "mock": true
}
```

### Response shapes

`ScanResult` (`/v1/explain`, `/v1/scan`) has every field from `docs/CONTENT_SCHEMA.md` section 6, always present,
plus additive fields:

| field | type | notes |
|---|---|---|
| `ocr_text` | string | text read from the photo (`/v1/scan`) or the input text (`/v1/explain`) |
| `iast` | string | IAST of the matched corpus verse (or the model's IAST when unmatched) |
| `match` | `{id, score, source_title, ref}` or `null` | `null` when the verse is not in our corpus; `ref` is additive (corpus display reference or `null`) |
| `word_meanings` | `{sa, iast, en, hi}[]` | may be empty (mock / corpus-only) |
| `english`, `hindi`, `explanation_en`, `explanation_hi` | string | may be `""` (mock / corpus-only) |
| `modern_correlation` | `{en, hi}` or `null` | `null` when no honest parallel exists |
| `key_terms`, `related_verse_ids` | string[] | |
| `confidence` | `"high" \| "medium" \| "low"` | |
| `disclaimer` | string | show it under the card |
| `devanagari` (additive) | string | canonical Devanagari of the matched verse (else the input) |
| `source` (additive) | `"curated" \| "ai" \| "corpus_only" \| "mock"` | where the content came from |
| `in_corpus` (additive) | boolean | |
| `review_status` (additive) | `"ai_draft" \| "expert_reviewed"` | show the "AI draft, pending expert review" badge unless `expert_reviewed` |
| `candidates` (additive) | `{id, score, source_title, ref}[]` | top search hits, for a "did you mean" list |
| `mock` (additive) | boolean | `true` = demo output, show a banner |
| `notice` (additive, optional) | string | human-readable note (demo mode, weak match) |
| `ocr_legibility` (additive, `/v1/scan`) | `"clear" \| "partial" \| "poor"` | |
| `model` (additive, optional) | string | model that produced AI content |

## Errors

Every non-2xx response has the same shape, and every response has an `X-Request-Id` header:

```json
{ "error": { "code": "validation_error", "message": "friendly text, safe to show", "details": [] }, "request_id": "uuid" }
```

| status | `error.code` | when |
|---|---|---|
| 400 | `validation_error` | bad body / query (zod issues in `details: [{path, message}]`) |
| 400 | `invalid_json` | body is not JSON |
| 404 | `not_found` | unknown verse id or route |
| 413 | `payload_too_large` | body over the limit, or image over 5 MB |
| 415 | `unsupported_media_type` | not JPEG / PNG / WebP / GIF |
| 422 | `no_text_found` | no Devanagari found in the photo |
| 422 | `ai_refused` | the model declined (rare) |
| 429 | `rate_limited` | per-IP limit hit; `Retry-After` header and `details.retry_after_seconds` |
| 502 | `ai_bad_output` | model output failed validation twice |
| 503 | `ai_busy` | Anthropic overloaded or rate limited; `Retry-After` header |
| 503 | `ai_unavailable` | Anthropic unreachable or misconfigured (search still works) |
| 504 | `ai_timeout` | the model took too long |
| 500 | `internal_error` | bug |

```bash
curl -s -i -X POST http://localhost:8787/v1/explain -H 'content-type: application/json' -d '{"text":""}'
```

```
HTTP/1.1 400 Bad Request
access-control-allow-origin: *
access-control-expose-headers: X-Request-Id,Retry-After
content-type: application/json
x-ratelimit-ai-limit: 12
x-ratelimit-ai-remaining: 7
x-ratelimit-general-limit: 120
x-ratelimit-general-remaining: 112
x-request-id: 9e49ae51-1409-4b8e-89bc-634b05629fc7
content-length: 203
Date: Mon, 02 Nov 2026 00:52:38 GMT
Connection: keep-alive
Keep-Alive: timeout=5

{"error":{"code":"validation_error","message":"Invalid request body: text: text is required","details":[{"path":"text","message":"text is required"}]},"request_id":"9e49ae51-1409-4b8e-89bc-634b05629fc7"}
```

```bash
curl -s -X POST http://localhost:8787/v1/scan -H 'content-type: application/json' \
  -d '{"imageBase64":"aGVsbG8gd29ybGQgbm90IGFuIGltYWdl","mediaType":"application/pdf"}'
```

```json
{
  "error": {
    "code": "unsupported_media_type",
    "message": "Unsupported image type \"application/pdf\". Use JPEG, PNG, WebP or GIF."
  },
  "request_id": "9d8611b3-636a-4f29-a6f6-f50c2fa45696"
}
```

After 12 AI requests in a minute from one IP:

```json
{
  "error": {
    "code": "rate_limited",
    "message": "Too many requests. Please wait a moment and try again.",
    "details": {
      "limit": 12,
      "window_seconds": 60,
      "retry_after_seconds": 60,
      "bucket": "ai"
    }
  },
  "request_id": "52c6b0d9-eb9b-4036-8f77-c4efcc571bbc"
}
```

Rate-limit headers on every `/v1` response: `X-RateLimit-General-Limit/Remaining` and, on AI routes,
`X-RateLimit-AI-Limit/Remaining`.

## Configuration

All configuration is via environment variables (see `.env.example`).

| variable | default | meaning |
|---|---|---|
| `PORT` / `HOST` | `8787` / `0.0.0.0` | listen address (Docker image uses 8080) |
| `LOG_LEVEL` | `info` | `debug \| info \| warn \| error \| silent`; JSON lines to stdout/stderr |
| `ANTHROPIC_API_KEY` | unset | unset = mock mode |
| `ANTHROPIC_MODEL` | `claude-opus-5-5` | any vision-capable Claude model id, e.g. `claude-sonnet-5-5`, `claude-haiku-5-5` |
| `ANTHROPIC_EFFORT_OCR` / `_EXPLAIN` / `_TUTOR` | `low` / `medium` / `low` | `output_config.effort` per route |
| `ANTHROPIC_TIMEOUT_MS` | `90000` | per request |
| `ANTHROPIC_MAX_RETRIES` | `2` | SDK retries on 408/409/429/5xx with backoff |
| `ANTHROPIC_FALLBACKS` | `true` | send `fallbacks: "default"` (beta `server-side-fallback-2026-07-01`) for models that support it |
| `MOCK_MODE` | `false` | force mock mode even with a key |
| `CONTENT_DIR` | `../content/data` | folder with `corpus/`, `translations/`, `glossary.json`, `syllabus.json` |
| `CONTENT_RELOAD_SECONDS` | `60` | hot reload check interval, `0` = off (image sets 0) |
| `MATCH_STRONG_THRESHOLD` | `0.65` | search score needed to serve curated content without the LLM |
| `CORS_ORIGINS` | `*` | `*` or comma-separated origins |
| `TRUST_PROXY` | `false` | set `true` behind a proxy / PaaS so `X-Forwarded-For` is used for rate limiting |
| `RATE_LIMIT_WINDOW_MS` | `60000` | window for both buckets |
| `RATE_LIMIT_MAX` | `120` | all `/v1/*` requests per IP per window (0 = off) |
| `RATE_LIMIT_AI_MAX` | `12` | `/v1/scan`, `/v1/explain`, `/v1/tutor` per IP per window (0 = off) |
| `JSON_BODY_LIMIT_BYTES` | `262144` | body limit for explain / tutor |
| `MAX_IMAGE_BYTES` | `5242880` | decoded image limit for scan |
| `TUTOR_MAX_HISTORY` | `12` | messages kept per tutor request |

The rate limiter is in memory and per instance. With several instances, put a shared limiter in front
(Cloud Armor, Cloudflare, an API gateway) or swap in a Redis-backed one.

## Cost notes

Search, verse lookup and curated explain cost nothing beyond hosting. Claude is called only for `/v1/scan` (OCR),
non-curated `/v1/explain`, and `/v1/tutor`. Estimates per call with the default `claude-opus-5-5`
($4 / $20 per million input / output tokens; cache reads $0.20/M), including adaptive thinking at the configured
effort:

| call | input tokens | output tokens | approx. cost (Opus 5.5) | Sonnet 5.5 | Haiku 5.5 |
|---|---|---|---|---|---|
| `/v1/explain`, curated hit | 0 | 0 | $0 | $0 | $0 |
| `/v1/explain`, AI (effort medium) | ~1.0k system (cached after the first call) + 0.6-1.5k | 2-4k (bilingual JSON + thinking) | $0.045-0.09 (₹4-8) | ~half | ~1/40 |
| `/v1/scan` OCR step (effort low) | ~1.6k image + 0.35k system | 0.3-1k | $0.01-0.03 | ~half | ~1/40 |
| `/v1/scan` total | OCR + explain | | $0.01-0.03 if curated, $0.06-0.12 if AI | | |
| `/v1/tutor` (effort low) | ~0.8k system (cached) + 1-4k context and history | 0.3-0.8k | $0.01-0.03 | ~half | ~1/40 |

How the server keeps tokens lean:
- Curated translations short-circuit the LLM entirely; the more chapters the content team finishes, the cheaper
  scans get. Watch `source` in responses and the `llm_call` log lines.
- The explain and tutor system prompts are frozen strings marked with `cache_control`, so repeat calls read them
  from the prompt cache (~0.1x price). The OCR prompt is below the 512-token cache minimum and is not cached.
- Only the top 5 candidate verses (clipped to 600 chars) go to explain; tutor context is at most 4 verses and
  3 glossary terms, and history is capped at 12 messages with older ones clipped.
- Effort is `low` for OCR and tutor, `medium` for explain; all three are configurable.
- Every Claude call logs `input_tokens`, `output_tokens`, `cache_read_input_tokens` and `cache_creation_input_tokens`
  (`"msg":"llm_call"`), so you can compute real per-call cost from logs.
- Cheapest switch: `ANTHROPIC_MODEL=claude-sonnet-5-5` (about half the cost) or `claude-haiku-5-5` (about 1/40);
  check Devanagari OCR quality on real textbook photos before switching OCR to Haiku.

## Deployment

The image needs `content/data`, so build from the **`shloka-setu/` root** with `-f server/Dockerfile`:

```bash
cd shloka-setu
docker build -f server/Dockerfile -t shloka-setu-api .
docker run --rm -p 8080:8080 -e ANTHROPIC_API_KEY=sk-ant-... -e TRUST_PROXY=false shloka-setu-api
curl -s localhost:8080/health
```

The image is `node:22-slim`, multi-stage (dev dependencies pruned), runs as the `node` user, listens on `$PORT`
(default 8080), has a `HEALTHCHECK` on `/health`, and bakes content in read-only (`CONTENT_RELOAD_SECONDS=0`).
Rebuild and redeploy to ship new translations. Measured with the full corpus (25,204 verses: AH 7,422, CS 9,544, SS 8,238, plus ~1,100 translated verses and the
glossary): about 210 MB RSS, and 1.8 s from process start to listening (1.45 s of that is parsing content and
building the search index). A hot reload briefly holds old and new content, so give it 512 MB.

Set `ANTHROPIC_API_KEY` as a secret, `TRUST_PROXY=true` behind any platform proxy, and `CORS_ORIGINS` if you also
serve a web build (native mobile apps do not need CORS).

- **Render**: New Web Service from the repo, Runtime "Docker", Dockerfile path `shloka-setu/server/Dockerfile`,
  Docker build context `shloka-setu`. Health check path `/health`. Add env vars `ANTHROPIC_API_KEY`, `TRUST_PROXY=true`.
- **Railway**: New service from the repo; set root directory to `shloka-setu` and the variable
  `RAILWAY_DOCKERFILE_PATH=server/Dockerfile`; add the same env vars. Railway injects `PORT`.
- **Fly.io**: from `shloka-setu/`: `fly launch --dockerfile server/Dockerfile --internal-port 8080 --no-deploy`,
  `fly secrets set ANTHROPIC_API_KEY=sk-ant-... TRUST_PROXY=true`, `fly deploy`. Add an HTTP check on `/health`.
- **Google Cloud Run**: from `shloka-setu/`:
  `gcloud builds submit --tag REGION-docker.pkg.dev/PROJECT/REPO/shloka-setu-api -f server/Dockerfile .`
  (or build locally and push), then
  `gcloud run deploy shloka-setu-api --image ... --port 8080 --memory 512Mi --set-env-vars TRUST_PROXY=true --set-secrets ANTHROPIC_API_KEY=anthropic-key:latest --allow-unauthenticated`.
  Cloud Run sets `PORT`. Choose an Indian region (`asia-south1` Mumbai) for latency.
- **Any Docker host / VM**: `docker run -d --restart unless-stopped -p 80:8080 --env-file .env shloka-setu-api`
  behind nginx or Caddy for TLS (`TRUST_PROXY=true`).

Without Docker: `npm ci && npm run build && CONTENT_DIR=/path/to/content/data node dist/index.js`.

## Development

```bash
npm run dev         # watch mode
npm test            # vitest (no network; Claude is a fake injected client)
npm run typecheck   # tsc --noEmit (src + tests)
npm run build       # compile to dist/
```

Layout:

```
server/
  src/
    index.ts              entrypoint: config, content load + hot reload, Anthropic client, HTTP server
    app.ts                createApp({cfg, store, client}): Hono routes, validation, CORS, limits, errors
    config.ts             env parsing (zod)
    types.ts              content schemas (lenient zod) + API types (ScanResult, VerseView, TutorReply)
    content/loader.ts     reads corpus / translations / glossary / syllabus, tolerant of partial files
    content/store.ts      current content + search index, change detection, atomic reload
    search/translit.ts    Devanagari -> IAST
    search/normalize.ts   skeleton(), trigrams, longest common substring
    search/index.ts       trigram index, scoring, keyword search over translations
    llm/claude.ts         Claude wrapper: caching, effort, structured output, fallbacks, error mapping, retry
    llm/prompts.ts        frozen system prompts (OCR, explain, tutor)
    llm/schemas.ts        JSON schemas for structured outputs + zod validators
    services/explain.ts   retrieval, curated / AI / mock ScanResult
    services/scan.ts      image validation, OCR, then explain
    services/tutor.ts     retrieval for the tutor, bounded history, citations, mock reply
    services/mock.ts      demo content for AH.sutra.1.6
    http/                 errors, JSON logger, rate limiter
  test/                   vitest suites + fixtures (fixture translations, partial/broken files)
```

Tests use the real corpus in `../content/data/corpus` and fixture translations in `test/fixtures`, so they do not
change when the real translation set grows.
