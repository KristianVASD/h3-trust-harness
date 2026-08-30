export async function completeJson(args: {
  model: string;
  system: string;
  user: string;
}): Promise<string> {
  const key = (process.env.OPENROUTER_API_KEY ?? "").trim();
  if (!key) {
    throw new Error("OPENROUTER_API_KEY is not set");
  }
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.H3_API_BASE ?? "http://localhost:8787",
      "X-Title": "H3 Trust Harness Worker",
    },
    body: JSON.stringify({
      model: args.model,
      messages: [
        { role: "system", content: args.system },
        { role: "user", content: args.user },
      ],
      response_format: { type: "json_object" },
      temperature: 0.2,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenRouter ${res.status}: ${text.slice(0, 500)}`);
  }
  const body = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = body.choices?.[0]?.message?.content?.trim() ?? "";
  if (!content) throw new Error("OpenRouter returned empty content");
  return content;
}

export function parseJsonObject(raw: string): Record<string, unknown> {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const text = (fenced?.[1] ?? raw).trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error("No JSON object in model response");
  }
  return JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
}
