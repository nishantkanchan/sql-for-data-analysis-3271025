# Shloka Setu (श्लोक-सेतु): Product Requirements

> *A bridge between the Sanskrit of the Saṃhitās and the language a BAMS student already thinks in.*

## 1. Problem

BAMS (Bachelor of Ayurvedic Medicine and Surgery) students in India study from Sanskrit
classics: the Carakasaṃhitā, Suśrutasaṃhitā and Aṣṭāṅgahṛdaya, plus Laghutrayī texts.
Almost all of these students were educated in English or Hindi up to Class 12. Once at
college they face:

1. **A language wall.** Shlokas are dense, compound-heavy and sandhi-joined Sanskrit. Without
   word-by-word help a student cannot tell where one word ends and the next begins.
2. **Volume.** Thousands of verses, 15+ subjects across three professional years, and
   university exams that expect verbatim quotation of key shlokas.
3. **Rote learning without meaning.** Students memorise sounds they don't understand, which
   is fragile under exam stress and useless in clinical reasoning.
4. **No bridge to modern science.** The curriculum also teaches modern physiology, anatomy
   and pathology, but nothing helps students connect "pācaka pitta" to digestive enzymes,
   or "ṛtucaryā" to chronobiology, in a careful, non-overclaiming way.
5. **Fragmented, expensive help.** Commentaries are copyrighted print books, coaching is
   costly and city-bound, and YouTube is unstructured.

See `docs/research/` for evidence, numbers and the competitor scan.

## 2. Users

| Persona | Need | Shloka Setu answer |
|---|---|---|
| **Aditi, 1st-prof student** (English-medium CBSE, Maharashtra) | Understand AH Sūtrasthāna and Padārtha Vijñāna; survive her first university exam | Verse-by-verse English, word chips, chapter summaries, exam-focus lists, quizzes |
| **Rohit, 2nd-prof student** (Hindi-medium, UP; budget Android phone) | Caraka Pūrvārdha in Hindi; offline use on a hostel connection | Full Hindi mode, offline bundle, small app size |
| **Fatima, final-year student / AIAPGET aspirant** | Rapid revision; MCQ practice across all subjects | 1,200+ bilingual MCQs, spaced-repetition flashcards, mistakes deck |
| **Dr. Joshi, lecturer** | Point students to correct, reviewed meanings | Expert-review workflow (`review_status`), shareable verse ids |

## 3. Product principles

1. **Meaning before memorisation.** Every verse shows *what each word means* before asking a student to recite it.
2. **Bilingual by default.** English, Hindi, or both side by side. Regional languages next.
3. **Offline-first.** All curated study content ships in the app. AI features need a network; reading never does.
4. **Curated before generated.** The scan and explain features first match against our corpus and return curated (reviewable) translations. The LLM fills gaps only, and says so.
5. **Honest modern science.** Correlations use "often compared to" language, never "Ayurveda proved X". When there is no honest parallel, we show nothing.
6. **Study aid, not medical advice.** The tutor refuses to prescribe for real patients.

## 4. Feature set

### MVP (built in this repository)
| Area | Feature | Status |
|---|---|---|
| Learn | Library: text, then sthāna, then chapter, then verse, with chapter summaries and exam focus | ✅ |
| Learn | Verse view: Devanagari, IAST, word-by-word chips, English/Hindi translations, explanation, modern correlation, key terms | ✅ |
| Learn | Audio read-aloud (device TTS) | ✅ |
| Memorise | Memorisation mode: progressive hiding of pādas | ✅ |
| Understand | **Scan a shloka**: camera/gallery, then OCR, corpus match, meaning and modern correlation | ✅ (needs API key for live OCR; mock mode otherwise) |
| Understand | Type/paste a shloka, then offline fuzzy match | ✅ |
| Practice | Quiz by subject/topic, bilingual explanations, references to verses | ✅ |
| Practice | Spaced-repetition flashcards from glossary, bookmarks and mistakes | ✅ |
| Reference | Trilingual glossary (Devanagari / IAST / English / Hindi + modern correlate) | ✅ |
| Ask | AI tutor grounded in retrieved verses, with citations | ✅ (API key) |
| Track | Streaks, accuracy by subject, cards due | ✅ |

### Next (roadmap)
- **Expert review console**: teachers approve or edit AI-draft content, so `review_status` becomes `expert_reviewed`.
- **More texts**: full Caraka and Suśruta translations, then Laghutrayī (Mādhava Nidāna, Śārṅgadhara, Bhāvaprakāśa).
- **Regional languages**: Marathi, Gujarati, Kannada, Malayalam, Tamil, Telugu, Bengali.
- **Recitation coach**: record a recitation, then speech-to-text alignment and feedback on missed words and metre (chandas).
- **Mock exams**: university-pattern papers and timed AIAPGET mocks, with analytics.
- **Sanskrit grammar track**: micro-lessons on sandhi, vibhakti and samāsa, using verses from the syllabus as examples.
- **Class mode**: teachers assign chapters and see their class's quiz performance.
- **Community corrections** with moderator approval.

## 5. Success metrics
- D7 retention ≥ 35%, D30 ≥ 20% (study apps benchmark).
- Weekly active learners per college ≥ 30% of the enrolled batch at pilot colleges.
- Scan → "this helped" rating ≥ 80%; scan curated-match rate ≥ 60% for syllabus verses.
- Quiz accuracy improvement on repeated topics ≥ 15 points over 4 weeks.
- Expert-reviewed share of high-importance verses: 100% before public launch.

## 6. Business model (proposal)
- **Free**: all offline content, quizzes, flashcards and glossary, plus 5 scans and 10 tutor messages a day.
- **Pro (₹99-149/month or ₹799/year)**: unlimited scans and tutor, mock exams, and offline audio packs.
- **College licence**: per-seat annual pricing with class mode and teacher analytics.
- The unit cost of AI calls is kept low by the curated-first path, which needs no LLM call for matched verses. See `server/README.md` for per-call costs.

## 7. Risks and mitigations
| Risk | Mitigation |
|---|---|
| Inaccurate AI translations | Curated-first retrieval; `ai_draft` badges; expert review before launch; citations everywhere |
| Text licensing | Sanskrit mūla is public domain; digital transcriptions are tracked per source in `content/data/corpus/README.md` and `docs/research/03-sources-and-licensing.md`; re-key or license before commercial launch |
| Overclaiming science | Style rules in the content brief; null correlations allowed; reviewer checklist |
| Medical-advice liability | Tutor system prompt refuses patient-specific advice; disclaimers |
| Low-end devices | Lean bundle; offline JSON; no heavy on-device ML in the MVP |
