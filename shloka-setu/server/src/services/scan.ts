import { ApiError } from "../http/errors.js";
import { OCR_SYSTEM } from "../llm/prompts.js";
import { OcrJsonSchema, OcrOutput } from "../llm/schemas.js";
import type { Lang, ScanResult } from "../types.js";
import type { Deps } from "./deps.js";
import { explainText } from "./explain.js";
import { mockScanResult } from "./mock.js";

export const ALLOWED_MEDIA_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
export type ImageMediaType = (typeof ALLOWED_MEDIA_TYPES)[number];

export interface ValidImage {
  data: string;
  mediaType: ImageMediaType;
  bytes: number;
}

function sniff(buf: Buffer): ImageMediaType | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf.length >= 6 && (buf.subarray(0, 6).toString("latin1") === "GIF87a" || buf.subarray(0, 6).toString("latin1") === "GIF89a")) return "image/gif";
  if (buf.length >= 12 && buf.subarray(0, 4).toString("latin1") === "RIFF" && buf.subarray(8, 12).toString("latin1") === "WEBP") return "image/webp";
  return null;
}

/**
 * Validate a base64 image from the app. Accepts a bare base64 string or a data URL
 * ("data:image/jpeg;base64,..."). Rejects non-images and images over maxBytes.
 * If the declared media type disagrees with the file's magic bytes, the real type wins.
 */
export function validateImage(imageBase64: string, mediaType: string, maxBytes: number): ValidImage {
  let data = imageBase64.trim();
  let declared = mediaType.toLowerCase().trim();
  if (declared === "image/jpg") declared = "image/jpeg";
  const dataUrl = /^data:([\w/+.-]+);base64,/i.exec(data);
  if (dataUrl) {
    declared = dataUrl[1]!.toLowerCase();
    data = data.slice(dataUrl[0].length);
  }
  if (!(ALLOWED_MEDIA_TYPES as readonly string[]).includes(declared)) {
    throw new ApiError(415, "unsupported_media_type", `Unsupported image type "${declared}". Use JPEG, PNG, WebP or GIF.`);
  }
  data = data.replace(/\s+/g, "");
  if (!data || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) {
    throw new ApiError(400, "validation_error", "imageBase64 is not valid base64.");
  }
  const padding = data.endsWith("==") ? 2 : data.endsWith("=") ? 1 : 0;
  const bytes = Math.floor((data.length * 3) / 4) - padding;
  if (bytes > maxBytes) {
    throw new ApiError(413, "payload_too_large", `Image is too large (${(bytes / 1048576).toFixed(1)} MB). Maximum is ${(maxBytes / 1048576).toFixed(0)} MB; please resize or crop the photo.`);
  }
  const head = Buffer.from(data.slice(0, 32), "base64");
  const real = sniff(head);
  if (!real) throw new ApiError(415, "unsupported_media_type", "The uploaded file is not a JPEG, PNG, WebP or GIF image.");
  return { data, mediaType: real, bytes };
}

/** /v1/scan: Claude vision OCR (transcribe only), then the /v1/explain flow on the transcribed text. */
export async function scanImage(deps: Deps, image: ValidImage, lang: Lang = "en"): Promise<ScanResult> {
  if (!deps.claude) return mockScanResult(deps);

  const { data: ocr } = await deps.claude.json(
    {
      route: "ocr",
      system: OCR_SYSTEM,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: image.mediaType, data: image.data } },
            { type: "text", text: "Transcribe the Sanskrit verse text in this photo." },
          ],
        },
      ],
      maxTokens: 4000,
      effort: deps.cfg.anthropic.effort.ocr,
      jsonSchema: OcrJsonSchema,
    },
    OcrOutput,
  );

  const lines = ocr.lines.map((l) => l.trim()).filter(Boolean);
  if (!ocr.contains_devanagari || lines.length === 0) {
    throw new ApiError(
      422,
      "no_text_found",
      "We could not find Sanskrit (Devanagari) text in this photo. Try a closer, well-lit photo of a single shloka.",
    );
  }
  const ocrText = lines.join("\n");
  const result = await explainText(deps, ocrText, lang);
  if (ocr.legibility === "poor" && result.confidence === "high") result.confidence = "medium";
  return { ...result, ocr_text: ocrText, ocr_legibility: ocr.legibility };
}
