import { describe, expect, it } from "vitest";
import { boundHistory } from "../src/services/tutor.js";
import { fakeClient, fakeMessage, makeApp, postJson } from "./helpers.js";

describe("POST /v1/tutor (Claude mocked)", () => {
  it("grounds the answer in retrieved verses and returns validated citations", async () => {
    const { client, create } = fakeClient(
      fakeMessage("The three doṣas are vāta, pitta and kapha [AH.sutra.1.6]. See also [AH.sutra.12.1] and [AH.sutra.404.1]. Which doṣa governs movement?"),
    );
    const app = makeApp({ client });
    const res = await postJson(app, "/v1/tutor", {
      messages: [{ role: "user", content: "vayuh pittam kaphashceti trayo doshah ka matlab kya hai?" }],
      lang: "hinglish",
    });
    expect(res.status).toBe(200);
    expect(create).toHaveBeenCalledTimes(1);
    const body = create.mock.calls[0]![0];
    expect(body.system[0].text).toMatch(/not a doctor/);
    expect(body.system[0].cache_control).toEqual({ type: "ephemeral" });
    expect(body.output_config).toEqual({ effort: "low" });
    const last = body.messages[body.messages.length - 1];
    expect(last.role).toBe("user");
    expect(last.content).toContain("[AH.sutra.1.6]");
    expect(last.content).toContain("Hinglish");

    expect(res.json.reply).toMatch(/three doṣas/);
    expect(res.json.citations).toEqual(["AH.sutra.1.6", "AH.sutra.12.1"]); // nonexistent id dropped
    expect(res.json.context_verse_ids).toContain("AH.sutra.1.6");
    expect(res.json.mock).toBe(false);
    expect(res.json.disclaimer).toMatch(/not medical advice/);
  });

  it("includes the selected verse (verseId) in context and keeps history", async () => {
    const { client, create } = fakeClient(fakeMessage("Good question! [AH.sutra.12.1]"));
    const app = makeApp({ client });
    const res = await postJson(app, "/v1/tutor", {
      verseId: "AH.sutra.12.1",
      messages: [
        { role: "user", content: "Explain this verse" },
        { role: "assistant", content: "It lists the seats of vāta." },
        { role: "user", content: "What is pakvashaya in modern terms?" },
      ],
    });
    expect(res.status).toBe(200);
    const body = create.mock.calls[0]![0];
    expect(body.messages).toHaveLength(3);
    expect(body.messages[2].content).toContain("[AH.sutra.12.1]");
    expect(res.json.context_verse_ids[0]).toBe("AH.sutra.12.1");
  });

  it("404s for an unknown verseId", async () => {
    const { client } = fakeClient(fakeMessage("x"));
    const res = await postJson(makeApp({ client }), "/v1/tutor", { verseId: "AH.sutra.99.1", messages: [{ role: "user", content: "hi" }] });
    expect(res.status).toBe(404);
  });

  it("rejects a conversation that ends with an assistant turn", async () => {
    const res = await postJson(makeApp(), "/v1/tutor", {
      messages: [
        { role: "user", content: "hi" },
        { role: "assistant", content: "hello" },
      ],
    });
    expect(res.status).toBe(400);
    expect(res.json.error.code).toBe("validation_error");
  });
});

describe("boundHistory", () => {
  it("keeps the last N turns, starts with a user turn and clips old messages", () => {
    const msgs = Array.from({ length: 31 }, (_, i) => ({ role: (i % 2 === 0 ? "user" : "assistant") as "user" | "assistant", content: `m${i} ` + "x".repeat(3000) }));
    const out = boundHistory(msgs, 12);
    expect(out.length).toBeLessThanOrEqual(12);
    expect(out[0]!.role).toBe("user");
    expect(out[out.length - 1]!.content.startsWith("m30")).toBe(true);
    expect(out[0]!.content.length).toBeLessThan(1600);
  });
});
