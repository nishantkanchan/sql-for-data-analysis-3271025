/**
 * Output schemas for Claude structured outputs: a JSON Schema (sent as
 * output_config.format; every object has additionalProperties:false and lists all
 * keys as required, as structured outputs require) plus a zod schema that validates
 * the parsed result again on our side.
 */
import { z } from "zod";

const S = { type: "string" } as const;
const strArray = { type: "array", items: S } as const;
const nullableString = { anyOf: [S, { type: "null" }] } as const;

// ---------- OCR ----------
export const OcrJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["lines", "contains_devanagari", "legibility"],
  properties: {
    lines: strArray,
    contains_devanagari: { type: "boolean" },
    legibility: { type: "string", enum: ["clear", "partial", "poor"] },
  },
};

export const OcrOutput = z.object({
  lines: z.array(z.string()),
  contains_devanagari: z.boolean(),
  legibility: z.enum(["clear", "partial", "poor"]),
});
export type OcrOutput = z.infer<typeof OcrOutput>;

// ---------- Explain ----------
const wordMeaning = {
  type: "object",
  additionalProperties: false,
  required: ["sa", "iast", "en", "hi"],
  properties: { sa: S, iast: S, en: S, hi: S },
} as const;

export const ExplainJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "devanagari",
    "iast",
    "matched_verse_id",
    "in_corpus",
    "word_meanings",
    "english",
    "hindi",
    "explanation_en",
    "explanation_hi",
    "modern_correlation",
    "key_terms",
    "related_verse_ids",
    "confidence",
  ],
  properties: {
    devanagari: S,
    iast: S,
    matched_verse_id: nullableString,
    in_corpus: { type: "boolean" },
    word_meanings: { type: "array", items: wordMeaning },
    english: S,
    hindi: S,
    explanation_en: S,
    explanation_hi: S,
    modern_correlation: {
      anyOf: [
        { type: "object", additionalProperties: false, required: ["en", "hi"], properties: { en: S, hi: S } },
        { type: "null" },
      ],
    },
    key_terms: strArray,
    related_verse_ids: strArray,
    confidence: { type: "string", enum: ["high", "medium", "low"] },
  },
};

export const ExplainOutput = z.object({
  devanagari: z.string(),
  iast: z.string(),
  matched_verse_id: z.string().nullable(),
  in_corpus: z.boolean(),
  word_meanings: z.array(z.object({ sa: z.string(), iast: z.string(), en: z.string(), hi: z.string() })),
  english: z.string().min(1),
  hindi: z.string(),
  explanation_en: z.string().min(1),
  explanation_hi: z.string(),
  modern_correlation: z.object({ en: z.string(), hi: z.string() }).nullable(),
  key_terms: z.array(z.string()),
  related_verse_ids: z.array(z.string()),
  confidence: z.enum(["high", "medium", "low"]),
});
export type ExplainOutput = z.infer<typeof ExplainOutput>;
