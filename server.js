const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const ROOT_DIR = __dirname;
const PUBLIC_DIR = path.join(ROOT_DIR, "public");
const ENV_PATH = path.join(ROOT_DIR, ".env");

loadEnvFile(ENV_PATH);

const PORT = Number(process.env.PORT || 8787);
const OPENAI_API_KEY = (process.env.OPENAI_API_KEY || "").trim();
const OPENAI_MODEL = (process.env.OPENAI_MODEL || "gpt-4.1-mini").trim();
const OLLAMA_BASE_URL = (process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434")
  .trim()
  .replace(/\/+$/, "");
const OLLAMA_MODEL = (process.env.OLLAMA_MODEL || "qwen3:8b").trim();
const AI_PROVIDER = normalizeProvider(process.env.AI_PROVIDER);

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
};

const server = http.createServer(async (req, res) => {
  try {
    const requestUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    const pathname = decodeURIComponent(requestUrl.pathname);

    if (req.method === "GET" && pathname === "/api/health") {
      const status = await detectRuntimeStatus();
      return sendJson(res, 200, status);
    }

    if (req.method === "POST" && pathname === "/api/ai/revise") {
      const body = await readJsonBody(req, 2 * 1024 * 1024);
      const instruction = String(body.instruction || "").trim();
      const html = String(body.html || "").trim();
      const history = Array.isArray(body.history) ? body.history : [];

      if (!instruction) {
        throw new UserFacingError("Falta instruction.");
      }

      if (!html) {
        throw new UserFacingError("Falta html.");
      }

      const revision = await reviseHtmlWithAi({
        html,
        instruction,
        history,
      });

      return sendJson(res, 200, revision);
    }

    if (req.method === "GET") {
      return serveStatic(pathname, res);
    }

    sendJson(res, 404, { error: "Ruta no encontrada." });
  } catch (error) {
    const statusCode = error instanceof UserFacingError ? error.status : 500;
    const payload = { error: error.message || "Error interno en el servidor." };
    if (statusCode === 500) {
      payload.detail = error.message;
    }
    sendJson(res, statusCode, payload);
  }
});

server.listen(PORT, () => {
  console.log(`HTML APLICACION disponible en http://localhost:${PORT}`);
});

async function detectRuntimeStatus() {
  const ollamaAvailable = await isOllamaAvailable();
  const openaiAvailable = Boolean(OPENAI_API_KEY);

  return {
    ok: true,
    message: "Servidor activo",
    providerConfig: AI_PROVIDER,
    activeProvider: chooseProvider({
      configProvider: AI_PROVIDER,
      ollamaAvailable,
      openaiAvailable,
    }),
    openaiAvailable,
    ollamaAvailable,
    models: {
      openai: OPENAI_MODEL,
      ollama: OLLAMA_MODEL,
    },
  };
}

async function reviseHtmlWithAi({ html, instruction, history }) {
  const prompts = buildAiPrompts({ html, instruction, history });
  const ollamaAvailable = await isOllamaAvailable();
  const openaiAvailable = Boolean(OPENAI_API_KEY);

  const provider = chooseProvider({
    configProvider: AI_PROVIDER,
    ollamaAvailable,
    openaiAvailable,
  });

  if (!provider) {
    throw new UserFacingError(
      [
        "No hay IA disponible.",
        "Opcion recomendada (gratis y open source): instala Ollama y ejecuta:",
        `1) ollama pull ${OLLAMA_MODEL}`,
        "2) vuelve a ejecutar node server.js",
        "Alternativa: configurar OPENAI_API_KEY en .env",
      ].join(" "),
      400
    );
  }

  if (provider === "ollama") {
    return reviseHtmlWithOllama(prompts);
  }

  return reviseHtmlWithOpenAi(prompts);
}

function chooseProvider({ configProvider, ollamaAvailable, openaiAvailable }) {
  if (configProvider === "ollama") {
    return ollamaAvailable ? "ollama" : null;
  }

  if (configProvider === "openai") {
    return openaiAvailable ? "openai" : null;
  }

  if (ollamaAvailable) return "ollama";
  if (openaiAvailable) return "openai";
  return null;
}

async function reviseHtmlWithOllama(prompts) {
  const response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      stream: false,
      format: "json",
      think: false,
      messages: [
        { role: "system", content: prompts.systemPrompt },
        { role: "user", content: prompts.userPrompt },
      ],
    }),
  });

  const raw = await response.text();
  const data = parseJsonSafe(raw);

  if (!response.ok) {
    const modelHint =
      raw.toLowerCase().includes("model") && raw.toLowerCase().includes("not found")
        ? ` Ejecuta: ollama pull ${OLLAMA_MODEL}`
        : "";
    throw new UserFacingError(
      `Ollama fallo (${response.status}). ${raw || "Sin detalle."}${modelHint}`,
      502
    );
  }

  const rawText = String(data?.message?.content || data?.response || "").trim();
  const parsed = parseJsonObject(rawText);

  if (
    !parsed ||
    typeof parsed.assistant_reply !== "string" ||
    typeof parsed.updated_html !== "string"
  ) {
    throw new UserFacingError("No se pudo interpretar la respuesta de Ollama.", 502);
  }

  const updatedHtml = parsed.updated_html.trim();
  const updatedText =
    typeof parsed.updated_text === "string" && parsed.updated_text.trim()
      ? parsed.updated_text.trim()
      : htmlToText(updatedHtml);

  return {
    assistantReply: parsed.assistant_reply.trim() || "Cambios aplicados.",
    updatedHtml,
    updatedText,
    model: `ollama:${OLLAMA_MODEL}`,
  };
}

async function reviseHtmlWithOpenAi(prompts) {
  if (!OPENAI_API_KEY) {
    throw new UserFacingError(
      "OPENAI_API_KEY no configurada. Usa AI_PROVIDER=ollama o define la clave.",
      400
    );
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      input: [
        {
          role: "system",
          content: [{ type: "input_text", text: prompts.systemPrompt }],
        },
        {
          role: "user",
          content: [{ type: "input_text", text: prompts.userPrompt }],
        },
      ],
    }),
  });

  if (!response.ok) {
    const failText = await response.text();
    throw new UserFacingError(`OpenAI API fallo (${response.status}): ${failText}`, 502);
  }

  const data = await response.json();
  const rawText = extractTextFromResponse(data);
  const parsed = parseJsonObject(rawText);

  if (
    !parsed ||
    typeof parsed.assistant_reply !== "string" ||
    typeof parsed.updated_html !== "string"
  ) {
    throw new UserFacingError("No se pudo interpretar la respuesta de OpenAI.", 502);
  }

  const updatedHtml = parsed.updated_html.trim();
  const updatedText =
    typeof parsed.updated_text === "string" && parsed.updated_text.trim()
      ? parsed.updated_text.trim()
      : htmlToText(updatedHtml);

  return {
    assistantReply: parsed.assistant_reply.trim() || "Cambios aplicados.",
    updatedHtml,
    updatedText,
    model: OPENAI_MODEL,
  };
}

function buildAiPrompts({ html, instruction, history }) {
  const cleanHistory = history
    .filter((item) => item && typeof item.role === "string" && typeof item.text === "string")
    .slice(-8);

  const systemPrompt = [
    "Eres un experto en construir emails HTML precisos y claros.",
    "Tu trabajo es editar el HTML completo segun la instruccion del usuario.",
    "Reglas importantes:",
    "1) Devuelve SIEMPRE un objeto JSON valido y nada mas.",
    '2) El JSON debe tener: "assistant_reply", "updated_html", "updated_text".',
    "3) updated_html debe ser un documento HTML completo listo para email.",
    "4) Usa estructura compatible con email: tablas, estilos inline y layout robusto.",
    "5) Mantente directo y funcional: sin relleno innecesario.",
    "6) updated_text debe ser texto plano equivalente al email.",
  ].join("\n");

  const historyText =
    cleanHistory.length === 0
      ? "Sin historial previo."
      : cleanHistory
          .map((item, idx) => `${idx + 1}. ${item.role.toUpperCase()}: ${item.text}`)
          .join("\n");

  const userPrompt = [
    `INSTRUCCION DEL USUARIO: ${instruction}`,
    "",
    "HISTORIAL RECIENTE:",
    historyText,
    "",
    "HTML ACTUAL:",
    html,
  ].join("\n");

  return { systemPrompt, userPrompt };
}

async function isOllamaAvailable() {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1200);
    const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`, {
      method: "GET",
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return response.ok;
  } catch (_) {
    return false;
  }
}

function extractTextFromResponse(data) {
  if (typeof data?.output_text === "string" && data.output_text.trim()) {
    return data.output_text.trim();
  }

  if (Array.isArray(data?.output)) {
    const chunks = [];
    for (const item of data.output) {
      if (!Array.isArray(item?.content)) continue;
      for (const part of item.content) {
        if (typeof part?.text === "string") {
          chunks.push(part.text);
        }
      }
    }
    const merged = chunks.join("\n").trim();
    if (merged) return merged;
  }

  return "";
}

function parseJsonObject(rawText) {
  if (!rawText) return null;

  try {
    return JSON.parse(rawText);
  } catch (_) {}

  const fenced = rawText.match(/```json\s*([\s\S]*?)```/i);
  if (fenced && fenced[1]) {
    try {
      return JSON.parse(fenced[1]);
    } catch (_) {}
  }

  const firstBrace = rawText.indexOf("{");
  const lastBrace = rawText.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    const candidate = rawText.slice(firstBrace, lastBrace + 1);
    try {
      return JSON.parse(candidate);
    } catch (_) {}
  }

  return null;
}

function parseJsonSafe(raw) {
  try {
    return JSON.parse(raw);
  } catch (_) {
    return {};
  }
}

function htmlToText(html) {
  return String(html || "")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<\/(p|div|h1|h2|h3|h4|h5|h6|li|tr)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function serveStatic(pathname, res) {
  const normalizedPath = pathname === "/" ? "/index.html" : pathname;
  const filePath = path.normalize(path.join(PUBLIC_DIR, normalizedPath));

  if (!filePath.startsWith(PUBLIC_DIR)) {
    return sendJson(res, 403, { error: "Acceso denegado." });
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      if (err.code === "ENOENT") {
        return sendJson(res, 404, { error: "Archivo no encontrado." });
      }
      return sendJson(res, 500, { error: "No se pudo leer el archivo." });
    }

    const ext = path.extname(filePath).toLowerCase();
    const mime = MIME_TYPES[ext] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": mime });
    res.end(data);
  });
}

function sendJson(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function readJsonBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    let data = "";
    let size = 0;

    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new Error("Body demasiado grande."));
        req.destroy();
        return;
      }
      data += chunk.toString("utf8");
    });

    req.on("end", () => {
      if (!data.trim()) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch (_) {
        reject(new Error("JSON invalido en body."));
      }
    });

    req.on("error", reject);
  });
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const raw = fs.readFileSync(filePath, "utf8");

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eqIndex = trimmed.indexOf("=");
    if (eqIndex <= 0) continue;

    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function normalizeProvider(rawProvider) {
  const value = String(rawProvider || "auto").trim().toLowerCase();
  if (value === "auto" || value === "ollama" || value === "openai") {
    return value;
  }
  return "auto";
}

class UserFacingError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}
