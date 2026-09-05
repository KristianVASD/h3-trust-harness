import { createServer } from "node:http";
import { listLlmCalls } from "./llm-trace.js";
import { listPromptNames, loadPrompt, savePrompt } from "./load-prompt.js";

const JOBS: Record<string, string> = {
  decide: "Chooses the next worker step (discover / probe / extract / …)",
  discover: "Finds real sector lists for open gaps — never KvK chrome",
  probe: "Reads one list page: structure, barrier, membership rate",
};

function htmlPage(): string {
  const names = listPromptNames();
  const first = names[0] ?? "discover";
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>OmegaClaw prompt desk</title>
  <style>
    :root { color-scheme: dark; }
    body { margin: 0; font: 15px/1.45 ui-sans-serif, system-ui, sans-serif;
      background: #111; color: #eee; }
    header { padding: 1rem 1.25rem; border-bottom: 1px solid #333;
      display: flex; justify-content: space-between; gap: 1rem; align-items: baseline; }
    h1 { font-size: 1.1rem; margin: 0; letter-spacing: .04em; }
    .sub { color: #9aa; font-size: .85rem; }
    main { display: grid; grid-template-columns: 16rem 1fr; min-height: calc(100vh - 3.4rem); }
    nav { border-right: 1px solid #333; padding: .75rem; }
    nav button { display: block; width: 100%; text-align: left; margin: 0 0 .4rem;
      padding: .55rem .7rem; background: #1a1a1a; color: #eee; border: 1px solid #333;
      border-radius: 6px; cursor: pointer; }
    nav button.active { border-color: #6ee7b7; background: #13261c; }
    nav small { display: block; color: #888; font-size: .75rem; margin-top: .2rem; }
    section { padding: 1rem 1.25rem; display: flex; flex-direction: column; gap: .7rem; }
    textarea, pre { flex: 1; min-height: 22rem; width: 100%; box-sizing: border-box;
      background: #0b0b0b; color: #f3f3f3; border: 1px solid #333; border-radius: 8px;
      padding: .8rem; font: 13px/1.5 ui-monospace, Consolas, monospace; overflow: auto; }
    .row { display: flex; gap: .6rem; align-items: center; flex-wrap: wrap; }
    button.save { background: #6ee7b7; color: #042; border: 0; border-radius: 6px;
      padding: .45rem .9rem; font-weight: 600; cursor: pointer; }
    .status { color: #9aa; font-size: .85rem; }
    .ok { color: #6ee7b7; }
    .err { color: #fca5a5; }
    .call { border: 1px solid #333; border-radius: 8px; padding: .7rem .8rem; margin: 0 0 .6rem; }
    .call.bad { border-color: #7f1d1d; }
    #calls { overflow: auto; }
  </style>
</head>
<body>
  <header>
    <div>
      <h1>OmegaClaw prompt desk</h1>
      <div class="sub">Local worker only — prompts, and the last model replies (or 429s).</div>
    </div>
    <div class="sub" id="model"></div>
  </header>
  <main>
    <nav id="nav"></nav>
    <section id="prompt-pane">
      <div class="row">
        <strong id="title">${first}</strong>
        <button class="save" type="button" id="save">Save</button>
        <span class="status" id="status">Loaded from apps/worker/prompts</span>
      </div>
      <p class="sub" id="hint"></p>
      <textarea id="body" spellcheck="false"></textarea>
    </section>
    <section id="calls-pane" hidden>
      <div class="row">
        <strong>Last model calls</strong>
        <span class="status" id="call-status">Polling every 3s</span>
      </div>
      <p class="sub">Empty preview = the model returned nothing useful, or only a rate-limit error.</p>
      <div id="calls"></div>
    </section>
  </main>
  <script>
    const JOBS = ${JSON.stringify(JOBS)};
    const names = ${JSON.stringify(names)};
    let current = ${JSON.stringify(first)};
    let mode = "prompt";
    const nav = document.getElementById("nav");
    const body = document.getElementById("body");
    const title = document.getElementById("title");
    const hint = document.getElementById("hint");
    const status = document.getElementById("status");
    const promptPane = document.getElementById("prompt-pane");
    const callsPane = document.getElementById("calls-pane");

    function mark() {
      for (const btn of nav.querySelectorAll("button")) {
        btn.classList.toggle("active", btn.dataset.name === (mode === "calls" ? "calls" : current));
      }
    }

    async function load(name) {
      mode = "prompt";
      current = name;
      promptPane.hidden = false;
      callsPane.hidden = true;
      title.textContent = name;
      hint.textContent = JOBS[name] || "";
      mark();
      const res = await fetch("/api/prompts/" + name);
      const data = await res.json();
      body.value = data.body ?? "";
      status.textContent = "Loaded " + name + ".md";
      status.className = "status";
    }

    async function save() {
      status.textContent = "Saving…";
      const res = await fetch("/api/prompts/" + current, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: body.value }),
      });
      if (!res.ok) {
        status.textContent = "Save failed";
        status.className = "status err";
        return;
      }
      status.textContent = "Saved — next engine call uses this text";
      status.className = "status ok";
    }

    async function loadCalls() {
      const res = await fetch("/api/calls");
      const data = await res.json();
      const box = document.getElementById("calls");
      const rows = data.calls || [];
      document.getElementById("call-status").textContent = rows.length
        ? rows.length + " calls in this worker process"
        : "No calls yet — restart worker and let a run hit discover/probe";
      box.innerHTML = rows.map((c) => {
        const head = (c.ok ? "OK" : "FAIL") + " · " + c.job + " · " + (c.model || "")
          + (c.status ? " · HTTP " + c.status : "")
          + (c.chars ? " · " + c.chars + " chars" : "")
          + (c.waitSec ? " · wait " + c.waitSec + "s" : "");
        const text = c.error || c.preview || "(empty)";
        return '<div class="call' + (c.ok ? "" : " bad") + '"><strong>' + head
          + '</strong><div class="sub">' + c.at + '</div><pre>'
          + text.replace(/[<>&]/g, (ch) => ({ "<":"&lt;", ">":"&gt;", "&":"&amp;" }[ch]))
          + "</pre></div>";
      }).join("");
    }

    function showCalls() {
      mode = "calls";
      promptPane.hidden = true;
      callsPane.hidden = false;
      mark();
      loadCalls();
    }

    const callBtn = document.createElement("button");
    callBtn.type = "button";
    callBtn.dataset.name = "calls";
    callBtn.innerHTML = "Last calls<small>Model replies and 429s</small>";
    callBtn.onclick = showCalls;
    nav.appendChild(callBtn);

    for (const name of names) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.dataset.name = name;
      btn.innerHTML = name + "<small>" + (JOBS[name] || "Prompt file") + "</small>";
      btn.onclick = () => load(name);
      nav.appendChild(btn);
    }
    document.getElementById("save").onclick = save;
    fetch("/api/meta").then((r) => r.json()).then((m) => {
      document.getElementById("model").textContent = m.model || "";
    });
    setInterval(() => { if (mode === "calls") loadCalls(); }, 3000);
    load(current);
  </script>
</body>
</html>`;
}

export function startPromptDesk(): void {
  const port = Number(process.env.WORKER_PROMPT_PORT ?? 8788);
  if (!port) return;

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", `http://127.0.0.1:${port}`);
    const send = (code: number, body: unknown, type = "application/json") => {
      const text = typeof body === "string" ? body : JSON.stringify(body);
      res.writeHead(code, { "Content-Type": `${type}; charset=utf-8` });
      res.end(text);
    };

    if (req.method === "GET" && url.pathname === "/") {
      send(200, htmlPage(), "text/html");
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/meta") {
      send(200, {
        model: process.env.OPENROUTER_MODEL ?? "minimax/minimax-m3:free",
        prompts: listPromptNames(),
      });
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/calls") {
      send(200, { calls: listLlmCalls() });
      return;
    }
    const match = url.pathname.match(/^\/api\/prompts\/([a-z0-9][a-z0-9_-]{0,40})$/i);
    if (match) {
      const name = match[1]!;
      if (req.method === "GET") {
        try {
          send(200, { name, body: loadPrompt(name) });
        } catch (err) {
          send(404, { error: err instanceof Error ? err.message : String(err) });
        }
        return;
      }
      if (req.method === "PUT") {
        const chunks: Buffer[] = [];
        req.on("data", (c) => chunks.push(c as Buffer));
        req.on("end", () => {
          try {
            const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8")) as {
              body?: string;
            };
            if (typeof parsed.body !== "string") {
              send(400, { error: "body string required" });
              return;
            }
            savePrompt(name, parsed.body);
            send(200, { ok: true, name });
          } catch (err) {
            send(400, { error: err instanceof Error ? err.message : String(err) });
          }
        });
        return;
      }
    }
    send(404, { error: "not found" });
  });

  server.listen(port, "127.0.0.1", () => {
    console.log(`Prompt desk http://127.0.0.1:${port}  (edit apps/worker/prompts)`);
  });
}
