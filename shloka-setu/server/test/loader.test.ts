import fs from "node:fs";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { contentPaths, loadContent } from "../src/content/loader.js";
import { ContentStore } from "../src/content/store.js";
import { FIXTURES } from "./helpers.js";

const TMP = path.join(FIXTURES, "..", ".tmp", "content");

describe("content loader", () => {
  it("uses only the largest corpus file when two files cover the same text", () => {
    const c = loadContent(contentPaths(path.join(FIXTURES, "missing"), { corpusDir: path.join(FIXTURES, "corpus-dup") }));
    expect(c.stats.verses).toBe(3);
    expect(c.byId.has("CS.sutra.1.99")).toBe(false);
    expect(c.stats.skipped_files[0]!.reason).toMatch(/superseded by b_complete.json/);
    expect(c.textTitles.get("CS")).toBe("Complete");
  });

  it("starts with no translations/glossary/syllabus present", () => {
    const c = loadContent(contentPaths(path.join(FIXTURES, "missing"), { corpusDir: path.join(FIXTURES, "corpus-dup") }));
    expect(c.translations.size).toBe(0);
    expect(c.glossary).toEqual([]);
    expect(c.syllabus).toBeNull();
  });

  it("hot-reloads when translation files appear or change", () => {
    fs.rmSync(TMP, { recursive: true, force: true });
    fs.mkdirSync(path.join(TMP, "corpus"), { recursive: true });
    fs.copyFileSync(path.join(FIXTURES, "corpus-dup", "b_complete.json"), path.join(TMP, "corpus", "charaka.json"));
    const store = ContentStore.load(contentPaths(TMP));
    expect(store.content.translations.size).toBe(0);
    expect(store.reloadIfChanged()).toBe(false);

    const dir = path.join(TMP, "translations", "CS", "sutra");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "1.json"), JSON.stringify({ chapter: { id: "CS.sutra.1" }, verses: [{ id: "CS.sutra.1.2", english: "Thus spoke Lord Ātreya." }] }));
    expect(store.reloadIfChanged()).toBe(true);
    expect(store.content.translations.get("CS.sutra.1.2")?.english).toBe("Thus spoke Lord Ātreya.");
    expect(store.index.searchTranslations("Atreya spoke", 1)[0]?.id).toBe("CS.sutra.1.2");
  });

  afterAll(() => fs.rmSync(path.join(FIXTURES, "..", ".tmp"), { recursive: true, force: true }));
});
