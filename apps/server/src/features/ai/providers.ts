// Provider-agnostic completion. One interface, thin REST adapters for Anthropic / OpenAI / Gemini —
// no SDKs (keeps dependencies down). Returns the text plus token counts for the usage ledger.
export type CompleteArgs = { provider: string; model: string; apiKey: string; system: string; user: string; maxTokens?: number };
export type CompleteResult = { text: string; tokensIn: number; tokensOut: number };

export async function complete(a: CompleteArgs): Promise<CompleteResult> {
  const maxTokens = a.maxTokens ?? 700;
  if (a.provider === "anthropic") {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": a.apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: a.model, max_tokens: maxTokens, system: a.system, messages: [{ role: "user", content: a.user }] }),
    });
    if (!r.ok) throw new Error(`anthropic ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const j = await r.json();
    return { text: (j.content ?? []).map((c: any) => c.text ?? "").join(""), tokensIn: j.usage?.input_tokens ?? 0, tokensOut: j.usage?.output_tokens ?? 0 };
  }
  if (a.provider === "openai") {
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { authorization: `Bearer ${a.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ model: a.model, max_tokens: maxTokens, messages: [{ role: "system", content: a.system }, { role: "user", content: a.user }] }),
    });
    if (!r.ok) throw new Error(`openai ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const j = await r.json();
    return { text: j.choices?.[0]?.message?.content ?? "", tokensIn: j.usage?.prompt_tokens ?? 0, tokensOut: j.usage?.completion_tokens ?? 0 };
  }
  if (a.provider === "gemini") {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${a.model}:generateContent?key=${encodeURIComponent(a.apiKey)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: a.system }] }, contents: [{ role: "user", parts: [{ text: a.user }] }], generationConfig: { maxOutputTokens: maxTokens } }),
    });
    if (!r.ok) throw new Error(`gemini ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const j = await r.json();
    const text = (j.candidates?.[0]?.content?.parts ?? []).map((p: any) => p.text ?? "").join("");
    return { text, tokensIn: j.usageMetadata?.promptTokenCount ?? 0, tokensOut: j.usageMetadata?.candidatesTokenCount ?? 0 };
  }
  throw new Error(`unknown provider: ${a.provider}`);
}
