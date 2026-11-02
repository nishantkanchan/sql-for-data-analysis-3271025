# 04. Technology landscape and recommendations

Research date: November 2026. Scope: OCR for printed Devanagari Sanskrit, Sanskrit NLP (sandhi/segmentation, morphology, dictionaries), text-to-speech, and running on budget Android phones. Items marked **[verify]** need a hands-on test or licence check before we depend on them.

## 1. Constraints that drive the choices

- **Devices.** India shipped about 152 million smartphones in 2025 ([IDC via Reddit summary](https://www.reddit.com/r/Android/comments/1r6g11e/idc_india_smartphone_market_flat_at_152_million/)); the mass-budget segment (under about US$200) was 40% of Q3 2025 shipments ([IDC](https://my.idc.com/getdoc.jsp?containerId=prAP53921425)) and the INR 10,000-15,000 band leads volume ([Counterpoint](https://counterpointresearch.com/en/insights/india-smartphone-share)). Design target: 3-4 GB RAM Android, intermittent data, small storage budget.
- **Input.** Students photograph printed textbooks (Chaukhambha-style Devanagari with dense conjuncts, verse numbers, Hindi commentary on the same page), not handwritten manuscripts.
- **We already hold the text.** For the classical verses we have (or can get under CC BY 4.0 from DCS, see `03-sources-and-licensing.md`) a clean corpus. So OCR does not have to be perfect: it only needs to be good enough to **find the verse in our corpus** (fuzzy match), after which we show our verified text, not the OCR output.

## 2. OCR options for Devanagari / Sanskrit

| Option | Sanskrit support | Runs where | Licence / cost | Notes |
|---|---|---|---|---|
| **Google ML Kit Text Recognition v2** | Devanagari script model; Sanskrit (`sa`) listed as an *experimental* language ([ML Kit languages](https://developers.google.com/ml-kit/vision/text-recognition/v2/languages)) | **On device** (Android/iOS), offline | Free SDK (Google terms) | Best fit for a fast first pass on budget phones. Output quality on dense Sanskrit verse **[verify on 50 textbook photos]**. |
| **Tesseract 4/5 (LSTM)** | `san.traineddata`, `hin.traineddata` and `script/Devanagari.traineddata` in `tessdata_best` (we checked the repo listing) | On device (e.g. via Android wrappers) or server | Apache 2.0 ([tessdata_best LICENSE](https://github.com/tesseract-ocr/tessdata_best)) | Fully open and offline; `tessdata_best` models are large and slow on low-end phones; `tessdata_fast` variants are smaller **[verify size/speed]**. Accuracy on conjunct-heavy verse is typically below cloud OCR. |
| **Google Cloud Vision (DOCUMENT_TEXT_DETECTION)** | Sanskrit `sa` (Deva) listed under **experimental** languages; Hindi supported ([Cloud Vision OCR languages](https://docs.cloud.google.com/vision/docs/languages)) | Cloud | Paid per image | Strong general Devanagari OCR; use `languageHints: ["sa","hi"]`. |
| **Azure AI Vision Read (printed)** | Sanskrit (Devanagari) `sa` listed for printed text ([Azure language support](https://learn.microsoft.com/en-us/azure/ai-services/computer-vision/language-support)) | Cloud | Paid | Alternative/backup cloud OCR. |
| **Claude (LLM) vision** | Reads images directly; our server's `POST /v1/scan` contract already returns `ocr_text` plus explanation in one call (`docs/CONTENT_SCHEMA.md` section 6) | Cloud | Paid per token ([Claude vision docs](https://docs.claude.com/en/docs/build-with-claude/vision)) | Can read the verse *and* explain it in one step, and can be told to ignore the Hindi commentary on the page. Risk: hallucinated or "corrected" text, so always ground on corpus match and show the corpus text, not raw model OCR. **[verify accuracy against ML Kit + Cloud Vision]** |
| **Akshar Anveshini (IIT Bombay)** | Sanskrit OCR and post-editing system; reports 95.14% character accuracy on scanned books ([IIT Bombay](https://www.cse.iitb.ac.in/~ocr/)) | Research system | Check terms | Designed for book digitisation (useful for our own corpus OCR of PD editions), not for phone photos. |
| **IndicPhotoOCR (Bhashini, IIT Jodhpur)** | Scene-text detection/recognition for Indian languages, script identification; demo for 12 languages ([GitHub](https://github.com/Bhashini-IITJ/IndicPhotoOCR)) | Server (GPU) | Open source **[verify licence]** | Built for scene text (signboards), not dense book pages. Low priority. |
| Printed OCR research for low-resource Indic languages (incl. Sanskrit) | ([IIIT Hyderabad CVIT 2024 paper](https://cdn.iiit.ac.in/cdn/cvit.iiit.ac.in/images/ConferencePapers/2024/Printed-OCR-for-Extremely-Low-resource-Indic-Languages.pdf)) | Research | - | Background for future fine-tuning. |

### Recommended scan pipeline
1. **On device:** ML Kit v2 Devanagari OCR on the cropped verse region (user drags a box). Normalise (NFC, remove verse numbers/danda variants), transliterate to SLP1/IAST.
2. **On device, offline match:** character n-gram + edit-distance search against the bundled corpus index for the user's current subject (SA1 corpus is small). If top score is above a threshold, show the corpus verse and our cached translation: **no network needed**.
3. **Fallback (online):** send the image to `POST /v1/scan`; server tries Cloud Vision (`sa`,`hi` hints), re-runs the corpus match, and only then asks Claude to explain. If no corpus match, Claude reads and explains the verse with `confidence: low` and the standard disclaimer.
4. Log anonymised OCR-vs-match pairs (with consent) to improve the matcher.

## 3. Sanskrit NLP: segmentation, morphology, dictionaries

| Tool | What it does | Licence | Fit |
|---|---|---|---|
| **Digital Corpus of Sanskrit (DCS) data** | Gold word segmentation, lemmas and morphology for Caraka (82 ch.), Aṣṭāṅgahṛdaya (120), Suśruta (186) in CoNLL-U ([repo](https://github.com/OliverHellwig/sanskrit)) | CC BY 4.0 (`dcs/data/conllu/readme.md`) | **Use first.** For corpus verses we do not need a segmenter at all: DCS already gives the padaccheda and lemmas, which become the skeleton of `word_meanings`. |
| **Vidyut** (Ambuda) | Rust toolkit with Python bindings: `vidyut-sandhi` (apply/undo sandhi), `vidyut-cheda` (segment + annotate), `vidyut-kosha` (compact word-form store), `vidyut-prakriya` (Paninian derivation), `vidyut-lipi` (transliteration), `vidyut-chandas` (metre) ([repo README](https://github.com/ambuda-org/vidyut)) | MIT | **Best open engine for the server** and a candidate for on-device (Rust compiles to Android) **[verify binary size of kosha data]**. Use for user-typed or scanned text that is not in our corpus. |
| **Sanskrit Heritage Platform** (Gérard Huet, Inria) | Reader with sandhi segmentation, tagging, declension/conjugation, MW or Heritage lexicon; hands off to Samsādhanī (University of Hyderabad) for dependency parsing; OCaml source at gitlab.inria.fr ([manual, v3.76, Feb 2026](https://sanskrit.inria.fr/manual.html); [site](https://sanskrit.inria.fr/)) | Source available; licence **[verify]** | Gold-standard analyser for teachers and our content team (QA of AI word meanings). Heavy to embed; use as a reference or self-hosted service if the licence allows. |
| **sanskrit_parser** | Python sandhi split, morphological tagging, parsing; README warns of over/under-generation ([repo](https://github.com/kmadathil/sanskrit_parser)) | MIT | Usable fallback; Vidyut is faster and more maintained. |
| **ByT5-Sanskrit** (Nehrdich, Hellwig, Keutzer) | One byte-level T5 model for segmentation, lemmatisation and morphosyntactic tagging, fine-tuned on DCS ([arXiv 2409.13920](https://arxiv.org/abs/2409.13920); [inference scripts](https://github.com/dharmamitra/byt5-sanskrit-analyzers); base model `buddhist-nlp/byt5-sanskrit`, multitask `chronbmm/sanskrit5-multitask` on Hugging Face; hosted at [dharmamitra.org](http://dharmamitra.org)) | Model licences **[verify on Hugging Face]** | Highest-quality neural segmenter we found; server-side only (too large for budget phones). Good for scanned/typed verses outside the corpus. |
| **Cologne Digital Sanskrit Dictionaries** (Monier-Williams, Apte, etc.) | Source data on GitHub `sanskrit-lexicon/csl-orig` | CC BY-SA 4.0 ([LICENSE](https://github.com/sanskrit-lexicon/csl-orig)) | Lookup for English glosses; keep as separate attributed data. MW is English-only and dense, so our app should show a simplified gloss first and MW as "more". |
| **Sanskrit Heritage Dictionary** | Sanskrit-French, XML resources ([xml page](https://sanskrit.inria.fr/xml.html)) | **[verify]** | Morphology data more valuable than glosses for us. |

**Recommendation.** Two-tier NLP:
- *Corpus verses (most traffic):* precompute everything offline. DCS segmentation and lemmas, then Claude drafts `word_meanings` (Sanskrit, IAST, English, Hindi), translation, explanation and modern correlation per `CONTENT_SCHEMA.md` section 2, then expert review. Ship as static JSON in the app.
- *Unknown text (scan with no corpus match, or typed by user):* server runs Vidyut (fast, MIT) or ByT5-Sanskrit (better accuracy) for segmentation, attaches Cologne/DCS lemma glosses, and passes the analysis to Claude to produce the student-facing explanation with an explicit confidence level.

## 4. Text-to-speech (shloka recitation and Hindi explanations)

| Option | Sanskrit | Hindi | Runs where | Licence | Notes |
|---|---|---|---|---|---|
| **Indic Parler-TTS** (AI4Bharat + Hugging Face) | Yes, officially supported; Sanskrit speaker "Aryan" | Yes (Rohit, Divya, etc.) | Server (GPU recommended) | Apache 2.0 (per the [Hugging Face model card](https://huggingface.co/ai4bharat/indic-parler-tts) / [mirror note](https://huggingface.co/naklitechie/indic-parler-tts/commit/dd37df3cadd8b7ec06c3ca5cc7c85fc5ea02b399)) **[verify on card]** | 21 languages; pretrained variant trained on 143 h of Sanskrit audio ([pretrained card](https://huggingface.co/ai4bharat/indic-parler-tts-pretrained)). Recitation prosody (chandas, pauses at pada boundaries) **[verify with a Sanskrit teacher]**. |
| **Android system TTS (Google)** | Not a standard Sanskrit voice **[verify]**; Hindi voice reading Devanagari Sanskrit is an acceptable fallback | Yes, offline voice packs | On device | Free | Zero cost, offline; pronunciation of visarga/anusvara and long compounds will be imperfect. |
| **Cloud TTS (Google / Azure)** | **[verify]** | Yes ([Google Cloud TTS voices](https://docs.cloud.google.com/text-to-speech/docs/voices)) | Cloud | Paid | Good for Hindi/English explanation audio. |
| **Human recordings** | Best | Best | Static files | Our own | For the ~500 highest-importance verses (SA1 first), record a teacher's recitation once; compress to Opus (~10-20 KB per verse) and download per subject. |

**Recommendation.** Human recordings for "high" importance verses (exam recitation marks depend on it), pre-generated Indic Parler-TTS audio for the rest of the corpus (generated once on our server and cached, not real-time), Android system Hindi TTS for on-the-fly reading of explanations offline.

## 5. On-device strategy for budget Android

- **App shell:** React Native or Flutter is fine; keep the base APK small and download content packs per professional/subject (SA1 pack first).
- **Content packs:** verse JSON + translations + cards per subject, gzip-compressed; SQLite with FTS5 for offline search (Devanagari, IAST and Hindi/English meaning fields). Store audio separately and lazily.
- **Spaced repetition:** run locally (FSRS or SM-2 style scheduler over card ids), sync review logs when online. No server needed for daily study.
- **OCR:** ML Kit v2 on device; Tesseract only if we need a fully open fallback. Avoid shipping `tessdata_best` by default (size).
- **Matching:** n-gram index of the downloaded corpus pack in SQLite; works offline.
- **NLP on device:** precomputed data only at first. Consider Vidyut on device later (Rust library, MIT) once the size of its data files is measured **[verify]**.
- **LLM features (AI tutor, unknown-verse explain):** online only, via our server; cache answers per verse id so repeat questions are free and fast.
- **Data use:** default to Wi-Fi-only downloads for audio; show pack sizes before download.

## 6. Concrete recommendations (decisions to take now)

1. **Corpus:** move shipped Sanskrit to DCS (CC BY 4.0) and use its segmentation and lemmas as the base for word-by-word meanings (licensing detail in `03-sources-and-licensing.md`).
2. **Scan:** ML Kit v2 on device, then offline fuzzy match to corpus, then server fallback (Cloud Vision `sa`/`hi`, then Claude). Measure on a test set of 100 textbook photos across 3 publishers before choosing thresholds.
3. **Segmentation for unknown text:** Vidyut on the server now; evaluate ByT5-Sanskrit (after licence check) as an accuracy upgrade.
4. **Dictionary:** Cologne MW/Apte (CC BY-SA, attributed, kept separate) plus DCS lemma lookup; our own simplified Hindi/English glosses as the primary display.
5. **Audio:** teacher recordings for SA1 high-importance verses; Indic Parler-TTS batch generation for the rest; system Hindi TTS for explanations.
6. **Performance budget:** cold start under 3 s and SA1 pack under 15 MB without audio on a 3 GB RAM phone **[target, to test]**.
7. **Quality loop:** every AI-written record stays `review_status: "ai_draft"` until an expert flips it (schema rule); use the Sanskrit Heritage reader as the expert's checking tool.
