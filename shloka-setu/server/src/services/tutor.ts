import { ApiError } from "../http/errors.js";
import type { BetaMessageParam } from "../llm/claude.js";
import { TUTOR_SYSTEM, langInstruction } from "../llm/prompts.js";
import { skeleton, wordTokens } from "../search/normalize.js";
import { TUTOR_DISCLAIMER, type GlossaryTerm, type Lang, type TutorReply } from "../types.js";
import type { Deps } from "./deps.js";

export interface TutorMessage {
  role: "user" | "assistant";
  content: string;
}

export interface TutorInput {
  messages: TutorMessage[];
  verseId?: string;
  lang?: Lang;
}

const MAX_CONTEXT_VERSES = 4;
const MAX_GLOSSARY_TERMS = 3;
/** Trigram score above which a verse is considered relevant to a question that quotes Sanskrit. */
const VERSE_RELEVANCE = 0.45;
const OLD_MESSAGE_CHARS = 1500;
const LAST_MESSAGE_CHARS = 4000;
const VERSE_ID_RE = /\b(?:AH|CS|SS)\.[a-z_]+\.\d+\.\d+\b/g;

export interface TutorContext {
  verseIds: string[];
  glossary: GlossaryTerm[];
  block: string;
}

/** Retrieve verses + glossary terms relevant to the latest question. Pure retrieval; no LLM. */
export function buildTutorContext(deps: Deps, question: string, verseId?: string): TutorContext {
  const { content, index } = deps.store;
  const ids: string[] = [];
  const add = (id: string) => {
    if (content.byId.has(id) && !ids.includes(id) && ids.length < MAX_CONTEXT_VERSES) ids.push(id);
  };
  if (verseId) add(verseId);
  for (const m of question.match(VERSE_ID_RE) ?? []) add(m);
  for (const h of index.search(question, 3)) if (h.score >= VERSE_RELEVANCE) add(h.id);
  for (const h of index.searchTranslations(question, 3)) if (h.score >= 0.3) add(h.id);

  const glossary = matchGlossary(content.glossary, question).slice(0, MAX_GLOSSARY_TERMS);
  for (const g of glossary) for (const ref of g.source_refs.slice(0, 1)) add(ref);

  const parts: string[] = [];
  for (const id of ids) {
    const v = content.byId.get(id)!;
    const t = content.translations.get(id);
    const lines = [`[${id}] ${content.sourceTitle(v)}`, `Sanskrit: ${clip(v.devanagari, 700)}`, `IAST: ${clip(v.iast, 700)}`];
    if (t?.english) lines.push(`English: ${clip(t.english, 500)}`);
    if (t?.explanation_en) lines.push(`Notes: ${clip(t.explanation_en, 500)}`);
    parts.push(lines.join("\n"));
  }
  for (const g of glossary) {
    parts.push(`Glossary: ${g.iast || g.simple} (${g.devanagari}): ${g.en}${g.modern ? ` Modern: ${g.modern}` : ""}`);
  }
  return { verseIds: ids, glossary, block: parts.length ? parts.join("\n\n") : "(no matching verses found in the corpus)" };
}

function matchGlossary(terms: GlossaryTerm[], question: string): GlossaryTerm[] {
  if (terms.length === 0) return [];
  const toks = new Set(wordTokens(question).map((w) => stem(skeleton(w))).filter((s) => s.length >= 3));
  return terms.filter((t) => [t.iast, t.simple, t.devanagari, t.id].some((name) => name && toks.has(stem(skeleton(name)))));
}

function stem(s: string): string {
  return s.length > 4 && s.endsWith("s") ? s.slice(0, -1) : s;
}

/** Keep the conversation bounded: last N turns, starting with a user turn, older turns clipped. */
export function boundHistory(messages: TutorMessage[], maxHistory: number): TutorMessage[] {
  let recent = messages.slice(-maxHistory);
  while (recent.length && recent[0]!.role !== "user") recent = recent.slice(1);
  return recent.map((m, i) => ({
    role: m.role,
    content: clip(m.content, i === recent.length - 1 ? LAST_MESSAGE_CHARS : OLD_MESSAGE_CHARS),
  }));
}

export function extractCitations(deps: Deps, reply: string): string[] {
  const found = reply.match(VERSE_ID_RE) ?? [];
  return [...new Set(found)].filter((id) => deps.store.content.byId.has(id));
}

export async function tutor(deps: Deps, input: TutorInput): Promise<TutorReply> {
  const { content } = deps.store;
  if (input.verseId && !content.byId.has(input.verseId)) {
    throw new ApiError(404, "not_found", `Verse ${input.verseId} was not found.`);
  }
  const history = boundHistory(input.messages, deps.cfg.tutorMaxHistory);
  const last = history[history.length - 1];
  if (!last || last.role !== "user") {
    throw new ApiError(400, "validation_error", "The last message must be from the user.");
  }
  const ctx = buildTutorContext(deps, last.content, input.verseId);

  if (!deps.claude) return mockTutorReply(deps, ctx, input.lang);

  const messages: BetaMessageParam[] = history.slice(0, -1).map((m) => ({ role: m.role, content: m.content }));
  messages.push({
    role: "user",
    content: `CONTEXT (retrieved from the Shloka Setu corpus):\n${ctx.block}\n\nReply language: ${langInstruction(input.lang)}\n\nStudent's question:\n${last.content}`,
  });

  const res = await deps.claude.call({
    route: "tutor",
    system: TUTOR_SYSTEM,
    messages,
    maxTokens: 4000,
    effort: deps.cfg.anthropic.effort.tutor,
  });
  if (!res.text) throw new ApiError(502, "ai_bad_output", "The tutor returned an empty answer. Please try again.");
  return {
    reply: res.text,
    citations: extractCitations(deps, res.text),
    context_verse_ids: ctx.verseIds,
    disclaimer: TUTOR_DISCLAIMER,
    mock: false,
    model: res.model,
  };
}

function mockTutorReply(deps: Deps, ctx: TutorContext, lang?: Lang): TutorReply {
  const { content } = deps.store;
  const hi = lang === "hi";
  const head = hi
    ? "[डेमो मोड] AI ट्यूटर के लिए सर्वर पर Anthropic API key चाहिए। आपके प्रश्न से जुड़े श्लोक नीचे दिए गए हैं:"
    : "[Demo mode] The AI tutor needs an Anthropic API key on the server. Here are the verses Shloka Setu found for your question:";
  const lines = ctx.verseIds.map((id) => {
    const v = content.byId.get(id)!;
    const t = content.translations.get(id);
    const firstLine = v.iast.split("\n")[0]?.replace(/\s*\|+\s*$/, "") ?? "";
    const gloss = t ? (hi ? t.hindi : t.english) : "";
    return `- [${id}] ${content.sourceTitle(v)}: ${clip(firstLine, 120)}${gloss ? ` (${clip(gloss, 160)})` : ""}`;
  });
  const none = hi
    ? "- कोई मिलता-जुलता श्लोक नहीं मिला। श्लोक का कोई अंश (देवनागरी या रोमन में) लिखकर देखें।"
    : "- No matching verse found. Try typing part of the shloka (Devanagari or roman).";
  const tail = hi
    ? "इन्हें ऐप में खोलकर शब्दार्थ और अनुवाद पढ़ें। याद रखें: यह केवल अध्ययन सहायता है, चिकित्सा सलाह नहीं।"
    : "Open them in the app for word meanings and translations. Remember: this is a study aid, not medical advice.";
  const reply = [head, "", ...(lines.length ? lines : [none]), "", tail].join("\n");
  return {
    reply,
    citations: ctx.verseIds,
    context_verse_ids: ctx.verseIds,
    disclaimer: TUTOR_DISCLAIMER,
    mock: true,
  };
}

function clip(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n)} …` : s;
}
