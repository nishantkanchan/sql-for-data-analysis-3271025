# Architecture

```
┌──────────────────────────── content/ (source of truth, JSON) ────────────────────────────┐
│ corpus/        Sanskrit mūla: AH 7,422 · CS 9,544 · SS 8,238 verses (Devanagari + IAST)   │
│ translations/  per-chapter EN/HI translation, word meanings, explanation, modern link     │
│ quiz/          bilingual MCQ banks per NCISM subject                                      │
│ glossary.json  918 trilingual terms · syllabus.json NCISM BAMS curriculum                 │
│ scripts/       parse_gretil · fetch_dcs · build_samhitas · validate_content · report      │
└───────────────┬──────────────────────────────────────────────┬───────────────────────────┘
                │ npm run content (build-content.mjs)           │ loaded at startup (hot reload in dev)
                ▼                                               ▼
┌──────────── app/ (Expo, offline-first) ────────────┐   ┌──────────── server/ (Hono API) ────────────┐
│ assets/content: per-chapter JSON (lazy require),   │   │ /v1/search   trigram fuzzy search, no LLM  │
│ search index, quiz, glossary                       │   │ /v1/verse    verse + translation           │
│ Library · Verse · Memorise · Quiz · Flashcards     │──▶│ /v1/explain  curated-first, Claude if gap  │
│ (SM-2) · Glossary · Progress: fully offline        │   │ /v1/scan     Claude vision OCR → explain   │
│ Scan · Explain · Tutor: need the API               │   │ /v1/tutor    retrieval-grounded chat       │
│ AsyncStorage: progress, bookmarks, SRS state       │   │ mock mode without ANTHROPIC_API_KEY        │
└────────────────────────────────────────────────────┘   └──────────────────┬─────────────────────────┘
                                                                            │ @anthropic-ai/sdk
                                                                            ▼
                                                                   Claude (vision + structured output)
```

## The scan pipeline

1. **Capture.** The app resizes the photo to about 1,500 px and posts base64 to `/v1/scan`.
2. **OCR.** Claude vision transcribes the Devanagari line by line, with no translation, at low effort.
3. **Retrieval.** The text is normalised to a diacritic-free ASCII skeleton (Devanagari → IAST, then
   strip marks; folds ś/ṣ/sh→s, v/b, ṛ/ri, anusvāra). It is then scored against all 25k verses by
   character-trigram similarity plus a longest-common-substring bonus, so noisy partial lines still match.
4. **Curated-first.** If the best match scores ≥ 0.65, is clearly ahead of the runner-up and has a
   translation, the curated (reviewable) content is returned and **no LLM call is made**.
5. **Generated fallback.** Otherwise Claude produces a schema-validated `ScanResult` grounded in the
   top candidates, says whether the verse is in our corpus, and is retried once if the output fails validation.
6. **Display.** The app renders the result in the same layout as the verse screen and links to the
   matched verse.

The same normalisation runs on-device (`app/src/lib/normalize.ts` + `search.ts`), so
typed or pasted shlokas match offline.

## Design choices
- **JSON files, not a database.** The content is static, versioned in git, easy to review in PRs, and bundles
  straight into the app. When per-user data arrives (accounts, sync, class mode), add Postgres or Supabase
  for *user* state only.
- **Verse ids as the join key.** For example `AH.sutra.1.6`. The corpus, translations, quiz references,
  glossary references, tutor citations and app routes all use the same id.
- **`review_status` on every generated record.** This drives the "AI draft" badge in the UI and the
  expert-review workflow.
- **Mock mode.** The whole product can be demoed and tested without an API key.

## Scaling notes
- Bundle size: today the content is about 20.7 MB raw (about 5.5 MB gzipped). Translating everything
  would grow that to about 100 MB, at which point split it into downloadable packs per text or sthāna.
- API: the server is stateless apart from an in-memory rate limiter. To scale out, move rate
  limiting to Redis and set `TRUST_PROXY=true` behind a load balancer.
- Cost: search, verse lookup and curated explain are free. Each AI explain, OCR or tutor call costs a
  few US cents on Opus 5.5 (see `server/README.md`). Switching `ANTHROPIC_MODEL` to Sonnet or Haiku
  reduces this; test OCR quality on real textbook photos first.

## Testing
| Layer | Command | What it covers |
|---|---|---|
| Content | `python3 content/scripts/validate_content.py` | Schema, ids aligned to the corpus, Devanagari present |
| Server | `cd server && npm test && npm run typecheck` | 73 tests: search ranking, curated/AI paths, scan, tutor, mock, limits |
| App | `cd app && npx jest && npx tsc --noEmit` | 42 tests: search, SRS, quiz scoring, content loading |
| App UI | `npx expo export --platform web` + Playwright | Screenshots in `docs/screenshots/` |
