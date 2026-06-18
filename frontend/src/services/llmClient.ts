/**
 * LlmClient — OpenAI-compatible chat completions via browser fetch().
 */

export class LlmClient {
  private apiKey: string;
  private baseUrl: string;
  private model: string;

  constructor(apiKey: string, baseUrl?: string, model?: string) {
    this.apiKey = apiKey;
    // Normalize: strip trailing /chat/completions, strip trailing /
    let url = (baseUrl || "https://api.openai.com/v1").replace(
      /\/chat\/completions$/,
      "",
    );
    this.baseUrl = url.replace(/\/$/, "");
    this.model = model || "gpt-4o-mini";
  }

  getModel(): string {
    return this.model;
  }

  /**
   * POST to {baseUrl}/chat/completions
   * Headers: Authorization: Bearer {apiKey}, Content-Type: application/json
   * Body: { model: this.model, messages, temperature: 0.7 }
   * Returns the assistant's message content.
   */
  async chat(messages: { role: string; content: string }[]): Promise<string> {
    const url = `${this.baseUrl}/chat/completions`;
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + this.apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        temperature: 0.7,
      }),
    });

    if (!resp.ok) {
      let detail = "";
      try {
        const err = await resp.json();
        detail = err.error?.message ?? JSON.stringify(err);
      } catch {
        detail = resp.statusText;
      }
      throw new Error(`LLM API error (${resp.status}): ${detail}`);
    }

    const data = await resp.json();
    return data.choices?.[0]?.message?.content ?? "";
  }
}
