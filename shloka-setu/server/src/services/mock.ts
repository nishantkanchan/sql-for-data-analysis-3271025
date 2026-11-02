import { DISCLAIMER_AI, type ScanResult, type VerseTranslation } from "../types.js";
import type { Deps } from "./deps.js";
import { curatedResult } from "./explain.js";

export const MOCK_SCAN_VERSE_ID = "AH.sutra.1.6";

/**
 * Built-in demo content for AH.sutra.1.6, used by /v1/scan in mock mode when no
 * curated translation file for that chapter has been loaded yet.
 */
const DEMO_TRANSLATION: VerseTranslation = {
  id: MOCK_SCAN_VERSE_ID,
  anvaya: "tasya aṣṭau aṅgāni āhuḥ yeṣu cikitsā saṃśritā. vāyuḥ pittaṃ kaphaḥ ca iti samāsataḥ trayaḥ doṣāḥ.",
  word_meanings: [
    { sa: "अष्टौ", iast: "aṣṭau", en: "eight", hi: "आठ" },
    { sa: "अङ्गानि", iast: "aṅgāni", en: "branches, limbs", hi: "अंग, शाखाएँ" },
    { sa: "तस्य", iast: "tasya", en: "its (of Āyurveda)", hi: "उसके (आयुर्वेद के)" },
    { sa: "आहुः", iast: "āhuḥ", en: "(the sages) say", hi: "(आचार्य) कहते हैं" },
    { sa: "चिकित्सा", iast: "cikitsā", en: "treatment, therapeutics", hi: "चिकित्सा, उपचार" },
    { sa: "येषु", iast: "yeṣu", en: "on which", hi: "जिन पर" },
    { sa: "संश्रिता", iast: "saṃśritā", en: "rests, depends", hi: "आश्रित है, टिकी है" },
    { sa: "वायुः", iast: "vāyuḥ", en: "Vāyu (Vāta)", hi: "वायु (वात)" },
    { sa: "पित्तम्", iast: "pittam", en: "Pitta", hi: "पित्त" },
    { sa: "कफः", iast: "kaphaḥ", en: "Kapha", hi: "कफ" },
    { sa: "च इति", iast: "ca iti", en: "and, thus", hi: "और, इस प्रकार" },
    { sa: "त्रयः", iast: "trayaḥ", en: "three", hi: "तीन" },
    { sa: "दोषाः", iast: "doṣāḥ", en: "doṣas (functional principles)", hi: "दोष" },
    { sa: "समासतः", iast: "samāsataḥ", en: "in brief", hi: "संक्षेप में" },
  ],
  english:
    "These are said to be its (Āyurveda's) eight branches, on which treatment rests. Vāyu (Vāta), Pitta and Kapha: in brief, these are the three doṣas.",
  hindi:
    "इन्हें आयुर्वेद के आठ अंग कहा गया है, जिन पर चिकित्सा आधारित है। संक्षेप में वायु (वात), पित्त और कफ, ये तीन दोष हैं।",
  explanation_en:
    "The first half completes verse 1.5, which lists the eight branches (aṣṭāṅga) of Āyurveda: kāya (internal medicine), bāla (paediatrics), graha (psychiatry), ūrdhvāṅga (diseases above the clavicle), śalya (surgery), daṃṣṭrā (toxicology), jarā (rejuvenation) and vṛṣa (aphrodisiacs/reproductive health). The second half introduces the tridoṣa, the core concept of the whole text. Remember it as '8 branches, 3 doṣas'.",
  explanation_hi:
    "श्लोक का पहला भाग 1.5 में गिनाए गए आयुर्वेद के आठ अंगों (कायचिकित्सा, बालरोग, ग्रहचिकित्सा, ऊर्ध्वांग, शल्य, दंष्ट्रा, जरा, वृष) को पूरा करता है। दूसरा भाग त्रिदोष (वात, पित्त, कफ) का परिचय देता है, जो पूरे ग्रंथ का मूल सिद्धांत है। याद रखें: '8 अंग, 3 दोष'।",
  modern_correlation: {
    en: "The eight branches are often compared to modern specialties (internal medicine, paediatrics, psychiatry, ENT/ophthalmology, surgery, toxicology, geriatrics, reproductive medicine). The three doṣas are often compared to broad regulatory functions: Vāta with movement and neural signalling, Pitta with metabolism and digestion, Kapha with structure, cohesion and lubrication. These are teaching analogies, not one-to-one equivalents.",
    hi: "आठ अंगों की तुलना अक्सर आधुनिक विशेषज्ञताओं (मेडिसिन, बालरोग, मनोरोग, ENT/नेत्र, सर्जरी, विषविज्ञान, जराचिकित्सा, प्रजनन चिकित्सा) से की जाती है। तीन दोषों की तुलना अक्सर शरीर के नियामक कार्यों से की जाती है: वात को गति और तंत्रिका संकेत, पित्त को चयापचय और पाचन, कफ को संरचना और स्नेहन से। ये केवल समझने के लिए तुलनाएँ हैं, एक-से-एक समानता नहीं।",
  },
  key_terms: ["aṣṭāṅga", "cikitsā", "doṣa", "vāta", "pitta", "kapha"],
  tags: ["tridosha", "ashtanga", "definitions"],
  importance: "high",
  mnemonic: "8 branches, 3 doṣas",
  review_status: "ai_draft",
};

const DEMO_OCR_TEXT = "अष्टावङ्गानि तस्याहुश्चिकित्सा येषु संश्रिता ।\nवायुः पित्तं कफश्चेति त्रयो दोषाः समासतः ॥ ६ ॥";

/** /v1/scan in mock mode: a clearly flagged demo result for AH.sutra.1.6 (the image is validated but not read). */
export function mockScanResult(deps: Deps): ScanResult {
  const { content } = deps.store;
  const view = content.view(MOCK_SCAN_VERSE_ID);
  const notice = "Demo mode: the photo was not read (no Anthropic API key on the server). This is a sample result for Aṣṭāṅgahṛdaya Sūtrasthāna 1.6.";
  if (view) {
    const withTranslation = view.translation ? view : { ...view, translation: DEMO_TRANSLATION };
    const hit = { id: view.id, score: 1 };
    const res = curatedResult(deps, withTranslation, hit, [{ id: view.id, score: 1, source_title: view.source_title }], DEMO_OCR_TEXT);
    return { ...res, source: "mock", mock: true, notice, ocr_legibility: "clear" };
  }
  // Corpus not loaded (should not happen in practice): fully static fallback.
  return {
    ocr_text: DEMO_OCR_TEXT,
    iast: "aṣṭāv aṅgāni tasyāhuś cikitsā yeṣu saṃśritā |\nvāyuḥ pittaṃ kaphaś ceti trayo doṣāḥ samāsataḥ || 6 ||",
    devanagari: DEMO_OCR_TEXT,
    match: { id: MOCK_SCAN_VERSE_ID, score: 1, source_title: "Aṣṭāṅgahṛdaya, Sūtrasthāna 1.6" },
    word_meanings: DEMO_TRANSLATION.word_meanings,
    english: DEMO_TRANSLATION.english,
    hindi: DEMO_TRANSLATION.hindi,
    explanation_en: DEMO_TRANSLATION.explanation_en,
    explanation_hi: DEMO_TRANSLATION.explanation_hi,
    modern_correlation: DEMO_TRANSLATION.modern_correlation,
    key_terms: DEMO_TRANSLATION.key_terms,
    related_verse_ids: ["AH.sutra.1.5", "AH.sutra.1.7"],
    confidence: "high",
    disclaimer: DISCLAIMER_AI,
    source: "mock",
    in_corpus: true,
    review_status: "ai_draft",
    candidates: [],
    mock: true,
    notice,
    ocr_legibility: "clear",
  };
}
