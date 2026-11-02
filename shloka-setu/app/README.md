# Shloka Setu (श्लोक-सेतु): mobile app

An offline-first Android/iOS study companion for BAMS students: read Aṣṭāṅgahṛdaya, Carakasaṃhitā and
Suśrutasaṃhitā with word-by-word meanings, English and Hindi translations, explanations and careful
modern-science notes; memorise shlokas; practise MCQs; review with spaced-repetition flashcards; scan a
shloka from a textbook photo; and ask an AI tutor.

Built with Expo SDK 58, TypeScript and expo-router. All study content ships inside the app. Only Scan,
"Explain with AI" and the Tutor need the API server (`../server`).

## Quick start (development)

```bash
cd shloka-setu/app
npm install
npm run content          # build assets/content from ../content/data (Node >= 22.18)
npm start                # Expo dev server; press w for web, or scan the QR code with Expo Go
```

Other scripts:

| Command | What it does |
| --- | --- |
| `npm run content` | Rebuild the offline content bundle (see below) |
| `npm test` | Jest unit tests (search, SRS, quiz scoring, content loading) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run export:web` | Static web build into `dist/` (single-page app) |

## Content bundle

`scripts/build-content.mjs` reads `../content/data` (override with `CONTENT_DATA_DIR=...`) and writes:

- `assets/content/texts.json`: every text, sthāna and chapter (verse counts, translated flag, chapter titles).
- `assets/content/chapters/<TEXT>.<sthana>.<n>.json`: one file per chapter. Translated chapters merge the
  Sanskrit (Devanagari + IAST + corpus `ref`) with the translation file; Sanskrit-only chapters carry compact
  `[verse, devanagari, ref?]` tuples and the app derives IAST on the device.
- `assets/content/search-index.json`: id + diacritic-free skeleton for every corpus verse (all three texts),
  for offline fuzzy search.
- `assets/content/quiz/<subject>.json` + `quiz-index.json` (subjects, professional year, topics),
  `glossary.json`, `syllabus.json` (when present), `highlights.json` (high-importance translated verses) and
  `meta.json` (counts, per-text source and licence notes shown in Settings).
- `src/content/manifest.generated.ts`: a static `require()` map (Metro cannot do dynamic requires). Chapter
  and quiz files are only evaluated when first opened.

The script tolerates partial content: missing translations, quiz files, glossary or syllabus are skipped,
half-written JSON files are reported and skipped, and an obsolete `*_selected.json` corpus is ignored when a
complete file for the same text exists. Rerun `npm run content` whenever `content/data` changes and commit
the generated `assets/content` and manifest (EAS builds use them as-is).

Types for both the source schema (`docs/CONTENT_SCHEMA.md`) and the bundle live in `src/types/content.ts`.

## Run on a phone with Expo Go

1. Install **Expo Go** from the Play Store.
2. Put the phone and computer on the same Wi-Fi, then `npm start` and scan the QR code.
   (Behind a restrictive network use `npx expo start --tunnel`.)
3. For Scan and Tutor, start the API (`cd ../server && npm run dev`, port 8787) and set the address in
   **More → Settings → API server address** to `http://<your-computer-LAN-IP>:8787`, then tap
   *Test connection*. `localhost` on the phone means the phone itself.

All native modules used (camera/image picker, speech, haptics, async-storage, svg, fonts) are part of Expo
Go, so no custom dev client is needed.

## Build an installable APK (EAS)

```bash
npm install -g eas-cli          # or use npx eas-cli@latest
eas login
eas init                        # first time only: links the project and writes the projectId into app.json
EXPO_PUBLIC_API_URL=https://your-server.example.com eas build -p android --profile preview
```

The `preview` profile in `eas.json` produces a directly installable `.apk` (internal distribution);
`production` produces an `.aab` for the Play Store. Download the APK from the link EAS prints and open it on
the phone (allow "install unknown apps").

Better than an inline env var: store the URL as an EAS environment variable
(`eas env:create --name EXPO_PUBLIC_API_URL --value https://... --environment preview`) or add
`"env": { "EXPO_PUBLIC_API_URL": "..." }` to the profile in `eas.json`.

App config (`app.json`): name "Shloka Setu", slug `shloka-setu`, Android package `in.shlokasetu.app`,
camera and photo-library permission texts (microphone blocked), adaptive icon and splash generated from the
SVG emblem, cleartext HTTP allowed so a LAN server works during testing.

## Configuring the API URL

- Build-time default: `EXPO_PUBLIC_API_URL` (falls back to `http://localhost:8787`).
- Run-time: **Settings → API server address**, saved on the device. *Reset* returns to the build default.
- Endpoints used: `POST /v1/scan`, `POST /v1/explain`, `POST /v1/tutor`, `GET /health`
  (see `docs/CONTENT_SCHEMA.md` §6 and `server/README.md`). The app sends `lang: "en" | "hi"`.

If the server is unreachable, Scan shows an offline notice and offers "type or paste the shloka", which runs
fuzzy search over the bundled index entirely on the device.

## Features

- **Onboarding**: language (English, हिन्दी or both), BAMS professional year, daily goal.
- **Home**: greeting, streak, today's goal, Shloka of the day (high-importance translated verse),
  continue reading, flashcards due, quick actions.
- **Library**: text → sthāna → chapter (summary, key concepts, exam focus) → verse list.
- **Verse**: large Devanagari with IAST toggle, tappable word chips, English/Hindi translation tabs,
  explanation, Modern-science card (only when present), glossary-linked key terms, audio (hi-IN voice),
  bookmark, ask tutor, previous/next across chapters, "AI draft, pending expert review" badge, memorisation
  (hide some, hide most, first letters, line by line; tap a hidden word to peek).
- **Scan**: camera or gallery → `/v1/scan` → result in the verse layout with link to the matched corpus verse;
  offline paste-and-search; "Explain with AI" for typed text.
- **Quiz**: subjects grouped by professional year, optional topic, 10 questions, optional 45 s timer, instant
  bilingual feedback with tappable verse references, results, review mistakes; mistakes become flashcards.
- **Flashcards**: SM-2 (Again/Hard/Good/Easy) over glossary terms, bookmarked and high-importance verses and
  quiz mistakes; deck filters; new-card allowance from the daily goal.
- **Glossary**: diacritic-insensitive search across Devanagari, IAST, simple spelling, English and Hindi;
  category filter; term detail with sources and related terms.
- **Tutor**: chat with `/v1/tutor` (optionally about a verse), citations as tappable verse links, disclaimer.
- **Progress**: verses studied, quiz accuracy by subject, 8-week activity calendar, cards due.
- **Settings**: language, year, goal, theme (system/light/dark), API URL, bundled-content stats, about,
  data sources and licences, disclaimer, reset progress.

## Code map

```
src/app/            routes (expo-router): (tabs)/ index, library, scan, practice, more;
                    text/[code], sthana/[key], chapter/[id], verse/[id], quiz/, flashcards,
                    glossary/, tutor, progress, bookmarks, settings, onboarding
src/components/     ui.tsx (design-system primitives), verse.tsx (shloka renderer, word chips, ...), Logo
src/content/        index.ts (content access), deck.ts (flashcards), manifest.generated.ts
src/lib/            normalize.ts + search.ts (offline fuzzy search), srs.ts, quiz.ts, dates.ts, api.ts
src/state/store.tsx settings + progress persisted with AsyncStorage
src/i18n/strings.ts every UI string in English and Hindi
src/theme/          palette (parchment / ink / turmeric, dark mode), fonts, spacing
__tests__/          jest tests
```

## Notes

- Fonts: Tiro Devanagari Sanskrit (shlokas, headings) and Noto Sans Devanagari (Hindi UI), SIL OFL.
- All translations, explanations, quiz items and glossary entries are AI drafts until marked
  `expert_reviewed`; the app badges them. It is a study aid, not medical advice.
- Licences of the Sanskrit e-texts differ per source (see Settings → Data sources); check them before any
  commercial distribution.
