export type FetchedPage = {
  url: string;
  ok: boolean;
  status: number;
  contentType: string;
  html: string;
  text: string;
};

const UA = "Mozilla/5.0 (compatible; H3-OmegaWorker/1.0; +https://h3-trust-harness.vercel.app)";

export async function fetchPage(url: string, timeoutMs = 20000): Promise<FetchedPage> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml" },
      redirect: "follow",
    });
    const buf = Buffer.from(await res.arrayBuffer());
    const html = decodeBody(buf, res.headers.get("content-type"));
    return {
      url: res.url || url,
      ok: res.ok,
      status: res.status,
      contentType: res.headers.get("content-type") ?? "",
      html,
      text: stripTags(html).slice(0, 20000),
    };
  } catch (err) {
    return {
      url,
      ok: false,
      status: 0,
      contentType: "",
      html: "",
      text: err instanceof Error ? err.message : String(err),
    };
  } finally {
    clearTimeout(timer);
  }
}

function decodeBody(buf: Buffer, contentType: string | null): string {
  const declared = /charset=([^;]+)/i.exec(contentType ?? "")?.[1]?.trim();
  const encodings = [declared, "utf-8", "windows-1252", "latin-1"].filter(
    Boolean,
  ) as string[];
  for (const enc of encodings) {
    try {
      return new TextDecoder(enc).decode(buf);
    } catch {
      /* try next */
    }
  }
  return buf.toString("utf8");
}

export function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}
