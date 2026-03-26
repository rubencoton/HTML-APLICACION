const STORAGE_KEY = "html-aplicacion-draft-v1";
const CHAT_STORAGE_KEY = "html-aplicacion-chat-v1";
const BROWSER_API_KEY_STORAGE = "ha-browser-openai-key";
const BROWSER_MODEL_STORAGE = "ha-browser-openai-model";
const PREVIEW_HELP_TEXT =
  "Vista previa interactiva: haz clic en texto, enlace o imagen para editar.";
const PREVIEW_STYLE_ID = "ha-preview-edit-style";

const defaultEmailHtml = `<!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Artes Buho | Campana Especial</title>
  </head>
  <body style="margin:0;padding:0;background:#fff7ec;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#fff7ec;padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="640" cellspacing="0" cellpadding="0" border="0" style="width:640px;max-width:640px;background:#ffffff;border-radius:16px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;">
            <tr>
              <td style="padding:28px 34px 14px 34px;background:#bf1e2e;color:#ffffff;">
                <p style="margin:0;font-size:13px;letter-spacing:0.08em;text-transform:uppercase;opacity:0.92;">ARTES BUHO | HTML APLICACION</p>
                <h1 style="margin:10px 0 0;font-size:30px;line-height:1.2;font-weight:700;">Lanza tu proxima campana en minutos</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:26px 34px 10px 34px;color:#1d2630;">
                <p style="margin:0 0 14px;font-size:17px;line-height:1.6;">
                  Edita este borrador con IA y conviertelo en un email perfecto para tu negocio. Cambia textos, tono, imagenes y CTA con una sola instruccion.
                </p>
                <p style="margin:0 0 20px;font-size:16px;line-height:1.6;">
                  Todo queda listo para exportar en HTML y texto plano, sin rodeos.
                </p>
                <p style="margin:0;">
                  <a href="https://example.com" style="display:inline-block;background:#f4b400;color:#1f1f1f;text-decoration:none;padding:12px 20px;border-radius:10px;font-size:15px;font-weight:700;">Quiero mi email ahora</a>
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:0 34px 28px 34px;">
                <img src="https://images.unsplash.com/photo-1519389950473-47ba0277781c?auto=format&fit=crop&w=1200&q=80" alt="Equipo creativo trabajando" width="572" style="display:block;width:100%;max-width:572px;border-radius:12px;" />
              </td>
            </tr>
            <tr>
              <td style="padding:18px 34px 30px 34px;border-top:1px solid #ffe1a0;color:#5d6772;font-size:13px;line-height:1.6;">
                Recibes este email porque solicitaste informacion de ARTES BUHO. Desarrollo: RUBEN COTON.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

const state = {
  busy: false,
  currentView: "code",
  html: "",
  chatHistory: [],
};

const htmlEditor = document.getElementById("htmlEditor");
const previewFrame = document.getElementById("previewFrame");
const textOutput = document.getElementById("textOutput");
const previewHint = document.getElementById("previewHint");
const chatLog = document.getElementById("chatLog");
const chatForm = document.getElementById("chatForm");
const chatInput = document.getElementById("chatInput");
const sendBtn = document.getElementById("sendBtn");
const messageTemplate = document.getElementById("messageTemplate");
const viewButtons = document.querySelectorAll(".view-btn");
const chips = document.querySelectorAll(".chip");
const newDraftBtn = document.getElementById("newDraftBtn");
const copyBtn = document.getElementById("copyBtn");
const exportHtmlBtn = document.getElementById("exportHtmlBtn");
const exportTxtBtn = document.getElementById("exportTxtBtn");
const setApiKeyBtn = document.getElementById("setApiKeyBtn");

init();

function init() {
  const savedHtml = localStorage.getItem(STORAGE_KEY);
  const savedChat = localStorage.getItem(CHAT_STORAGE_KEY);

  state.html = savedHtml || defaultEmailHtml;
  htmlEditor.value = state.html;
  refreshOutputs();

  if (savedChat) {
    try {
      const parsed = JSON.parse(savedChat);
      if (Array.isArray(parsed)) {
        state.chatHistory = parsed
          .filter((item) => item && typeof item.role === "string" && typeof item.text === "string")
          .slice(-20);
      }
    } catch (_) {}
  }

  if (state.chatHistory.length === 0) {
    state.chatHistory.push({
      role: "assistant",
      text: "Listo para ARTES BUHO. Escribe una instruccion y aplico cambios en tu HTML.",
    });
    persistChat();
  }

  renderChat();
  setView("code");
  wireEvents();
}

function wireEvents() {
  htmlEditor.addEventListener("input", () => {
    state.html = htmlEditor.value;
    refreshOutputs();
    persistHtml();
  });

  previewFrame.addEventListener("load", () => {
    enablePreviewEditing();
  });

  chatForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const instruction = chatInput.value.trim();
    if (!instruction || state.busy) return;
    chatInput.value = "";
    await applyAiInstruction(instruction);
  });

  chips.forEach((chip) => {
    chip.addEventListener("click", async () => {
      const instruction = chip.getAttribute("data-quick");
      if (!instruction || state.busy) return;
      await applyAiInstruction(instruction);
    });
  });

  viewButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const view = btn.getAttribute("data-view");
      if (!view) return;
      setView(view);
    });
  });

  newDraftBtn.addEventListener("click", () => {
    if (!confirm("Quieres reemplazar el HTML actual por un borrador nuevo?")) return;
    state.html = defaultEmailHtml;
    htmlEditor.value = state.html;
    refreshOutputs();
    persistHtml();
    addMessage("assistant", "Borrador reiniciado.");
  });

  copyBtn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(state.html);
      addMessage("assistant", "HTML copiado al portapapeles.");
    } catch (_) {
      addMessage("assistant", "No pude copiar automaticamente. Puedes copiar desde el editor.");
    }
  });

  exportHtmlBtn.addEventListener("click", () => {
    downloadFile("email.html", state.html, "text/html;charset=utf-8");
  });

  exportTxtBtn.addEventListener("click", () => {
    const txt = htmlToText(state.html);
    downloadFile("email.txt", txt, "text/plain;charset=utf-8");
  });

  setApiKeyBtn.addEventListener("click", () => {
    configureBrowserAiCredentials();
  });
}

async function applyAiInstruction(instruction) {
  addMessage("user", instruction);
  setBusy(true);
  addMessage("assistant", "Procesando cambio...");

  try {
    const payload = await requestAiRevision({
      instruction,
      html: state.html,
      history: state.chatHistory.slice(-12),
    });

    if (payload.updatedHtml) {
      state.html = payload.updatedHtml;
      htmlEditor.value = state.html;
      refreshOutputs();
      persistHtml();
    }

    replaceLastAssistantMessage(payload.assistantReply || "Cambios aplicados.");

    state.chatHistory.push({
      role: "assistant",
      text: `${payload.assistantReply || "Cambios aplicados."} [modelo: ${payload.model}]`,
    });
    trimChatHistory();
    persistChat();
  } catch (error) {
    replaceLastAssistantMessage(`Error: ${error.message}`);
    state.chatHistory.push({ role: "assistant", text: `Error: ${error.message}` });
    trimChatHistory();
    persistChat();
  } finally {
    setBusy(false);
  }
}

async function requestAiRevision({ instruction, html, history }) {
  let localError = null;

  try {
    return await requestAiRevisionViaLocalApi({ instruction, html, history });
  } catch (error) {
    localError = error;
  }

  const browserPayload = await tryBrowserDirectRevision({ instruction, html, history });
  if (browserPayload) {
    return browserPayload;
  }

  if (!isLocalHost()) {
    throw new Error(
      "La version publicada no tiene backend IA. Pulsa 'Configurar API IA' para usar tu clave en navegador."
    );
  }

  throw localError || new Error("No se pudo aplicar la revision.");
}

async function requestAiRevisionViaLocalApi({ instruction, html, history }) {
  const response = await fetch("/api/ai/revise", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      instruction,
      html,
      history,
    }),
  });

  const raw = await response.text();
  const payload = safeJsonParse(raw);

  if (!response.ok) {
    const detail =
      payload && typeof payload.error === "string"
        ? payload.error
        : `No se pudo aplicar la revision (${response.status}).`;
    throw new Error(detail);
  }

  if (!payload || typeof payload.updatedHtml !== "string") {
    throw new Error("Respuesta invalida del backend IA.");
  }

  return payload;
}

async function tryBrowserDirectRevision({ instruction, html, history }) {
  const apiKey = (localStorage.getItem(BROWSER_API_KEY_STORAGE) || "").trim();
  if (!apiKey) return null;

  const model = (localStorage.getItem(BROWSER_MODEL_STORAGE) || "gpt-4.1-mini").trim();
  const prompts = buildAiPrompts({ instruction, html, history });

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
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

  const raw = await response.text();
  const data = safeJsonParse(raw);

  if (!response.ok) {
    const errorMessage =
      data?.error?.message || data?.error || `OpenAI fallo (${response.status}).`;
    throw new Error(errorMessage);
  }

  const outputText = extractTextFromResponsesApi(data);
  const parsed = parseJsonObjectLoose(outputText);
  if (!parsed || typeof parsed.updated_html !== "string") {
    throw new Error("No pude interpretar la respuesta IA en modo navegador.");
  }

  const updatedHtml = parsed.updated_html.trim();
  const updatedText =
    typeof parsed.updated_text === "string" && parsed.updated_text.trim()
      ? parsed.updated_text.trim()
      : htmlToText(updatedHtml);

  return {
    assistantReply: parsed.assistant_reply || "Cambios aplicados.",
    updatedHtml,
    updatedText,
    model: `${model} (browser)`,
  };
}

function buildAiPrompts({ instruction, html, history }) {
  const cleanHistory = Array.isArray(history)
    ? history
        .filter((item) => item && typeof item.role === "string" && typeof item.text === "string")
        .slice(-8)
    : [];

  const historyText =
    cleanHistory.length === 0
      ? "Sin historial previo."
      : cleanHistory
          .map((item, idx) => `${idx + 1}. ${item.role.toUpperCase()}: ${item.text}`)
          .join("\n");

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

function configureBrowserAiCredentials() {
  const currentKey = localStorage.getItem(BROWSER_API_KEY_STORAGE) || "";
  const nextKey = window.prompt(
    "Pega tu OpenAI API key para usar IA en version publicada (opcional):",
    currentKey
  );

  if (nextKey === null) return;
  const cleanKey = nextKey.trim();

  if (!cleanKey) {
    localStorage.removeItem(BROWSER_API_KEY_STORAGE);
    localStorage.removeItem(BROWSER_MODEL_STORAGE);
    addMessage("assistant", "Clave API eliminada del navegador.");
    return;
  }

  const currentModel = localStorage.getItem(BROWSER_MODEL_STORAGE) || "gpt-4.1-mini";
  const nextModel = window.prompt("Modelo OpenAI para modo navegador:", currentModel);
  if (nextModel === null) return;

  localStorage.setItem(BROWSER_API_KEY_STORAGE, cleanKey);
  localStorage.setItem(BROWSER_MODEL_STORAGE, nextModel.trim() || "gpt-4.1-mini");
  addMessage("assistant", "API IA configurada para modo navegador.");
}

function extractTextFromResponsesApi(data) {
  if (typeof data?.output_text === "string" && data.output_text.trim()) {
    return data.output_text.trim();
  }

  const chunks = [];
  if (Array.isArray(data?.output)) {
    for (const item of data.output) {
      if (!Array.isArray(item?.content)) continue;
      for (const part of item.content) {
        if (typeof part?.text === "string") {
          chunks.push(part.text);
        }
      }
    }
  }

  return chunks.join("\n").trim();
}

function parseJsonObjectLoose(rawText) {
  if (!rawText) return null;

  const direct = safeJsonParse(rawText);
  if (direct) return direct;

  const fenced = rawText.match(/```json\s*([\s\S]*?)```/i);
  if (fenced && fenced[1]) {
    const parsedFence = safeJsonParse(fenced[1]);
    if (parsedFence) return parsedFence;
  }

  const firstBrace = rawText.indexOf("{");
  const lastBrace = rawText.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return safeJsonParse(rawText.slice(firstBrace, lastBrace + 1));
  }

  return null;
}

function safeJsonParse(raw) {
  if (typeof raw !== "string") return null;
  try {
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

function isLocalHost() {
  const host = window.location.hostname;
  return host === "localhost" || host === "127.0.0.1";
}

function setBusy(value) {
  state.busy = value;
  sendBtn.disabled = value;
  setApiKeyBtn.disabled = value;
  sendBtn.textContent = value ? "Aplicando cambios..." : "Aplicar cambio con IA";
}

function setView(view) {
  state.currentView = view;

  const isCode = view === "code";
  const isPreview = view === "preview";
  const isText = view === "text";

  htmlEditor.classList.toggle("hidden", !isCode);
  previewFrame.classList.toggle("hidden", !isPreview);
  textOutput.classList.toggle("hidden", !isText);
  previewHint.classList.toggle("hidden", !isPreview);

  viewButtons.forEach((btn) => {
    btn.classList.toggle("active", btn.getAttribute("data-view") === view);
  });

  if (isPreview) {
    resetPreviewScroll();
    setPreviewHint(PREVIEW_HELP_TEXT);
    enablePreviewEditing();
  }
}

function refreshOutputs() {
  previewFrame.srcdoc = state.html;
  textOutput.value = htmlToText(state.html);
}

function resetPreviewScroll() {
  const frameWin = previewFrame.contentWindow;
  if (!frameWin) return;
  try {
    frameWin.scrollTo(0, 0);
  } catch (_) {}
}

function enablePreviewEditing() {
  const frameDoc = previewFrame.contentDocument;
  if (!frameDoc || !frameDoc.body) return;

  injectPreviewStyles(frameDoc);
  if (frameDoc.body.dataset.haPreviewReady === "1") return;
  frameDoc.body.dataset.haPreviewReady = "1";

  frameDoc.addEventListener("click", onPreviewClick, true);
  frameDoc.addEventListener("mouseover", onPreviewHover, true);
}

function onPreviewHover(event) {
  if (state.currentView !== "preview") return;
  const frameDoc = previewFrame.contentDocument;
  if (!frameDoc) return;

  const resolved = resolveEditableTarget(event.target, frameDoc);
  clearPreviewHover(frameDoc);
  if (!resolved) return;

  if (!resolved.element.classList.contains("ha-preview-selected")) {
    resolved.element.classList.add("ha-preview-hover");
  }
}

function onPreviewClick(event) {
  if (state.currentView !== "preview") return;

  event.preventDefault();
  event.stopPropagation();

  if (state.busy) {
    setPreviewHint("La IA esta trabajando. Espera un momento para editar.");
    return;
  }

  const frameDoc = previewFrame.contentDocument;
  if (!frameDoc) return;

  const resolved = resolveEditableTarget(event.target, frameDoc);
  if (!resolved) {
    setPreviewHint("Ese bloque no se puede editar en clic directo. Prueba sobre texto, enlace o imagen.");
    return;
  }

  markPreviewSelection(frameDoc, resolved.element);
  const editResult = editPreviewElement(resolved);
  if (!editResult.changed) {
    setPreviewHint("Edicion cancelada.");
    return;
  }

  syncHtmlFromPreview(frameDoc);
  setPreviewHint(editResult.hint);
  addMessage("assistant", editResult.chatMessage);
}

function editPreviewElement(resolved) {
  if (resolved.type === "image") {
    return editImageElement(resolved.element);
  }
  if (resolved.type === "link") {
    return editLinkElement(resolved.element);
  }
  return editTextElement(resolved.element);
}

function editTextElement(element) {
  const currentText = normalizeText(element.textContent);
  const nextText = window.prompt("Nuevo texto para este bloque:", currentText);
  if (nextText === null) return { changed: false };

  if (nextText === currentText) {
    return { changed: false };
  }

  element.textContent = nextText;
  return {
    changed: true,
    hint: "Texto actualizado desde la vista previa.",
    chatMessage: "Texto actualizado desde la vista previa interactiva.",
  };
}

function editLinkElement(element) {
  const currentText = normalizeText(element.textContent);
  const currentHref = element.getAttribute("href") || "";

  const nextText = window.prompt("Nuevo texto del enlace:", currentText);
  if (nextText === null) return { changed: false };

  const nextHref = window.prompt("Nueva URL del enlace:", currentHref);
  if (nextHref === null) return { changed: false };

  if (nextText === currentText && nextHref.trim() === currentHref) {
    return { changed: false };
  }

  element.textContent = nextText;
  if (nextHref.trim()) {
    element.setAttribute("href", nextHref.trim());
  } else {
    element.removeAttribute("href");
  }

  return {
    changed: true,
    hint: "Enlace actualizado desde la vista previa.",
    chatMessage: "Enlace actualizado desde la vista previa interactiva.",
  };
}

function editImageElement(element) {
  const currentSrc = element.getAttribute("src") || "";
  const currentAlt = element.getAttribute("alt") || "";

  const nextSrc = window.prompt("Nueva URL de la imagen:", currentSrc);
  if (nextSrc === null) return { changed: false };

  const normalizedSrc = nextSrc.trim();
  if (!normalizedSrc) {
    setPreviewHint("La imagen necesita una URL valida.");
    return { changed: false };
  }

  const nextAlt = window.prompt("Nuevo texto ALT (opcional):", currentAlt);
  if (nextAlt === null) return { changed: false };

  if (normalizedSrc === currentSrc && nextAlt.trim() === currentAlt) {
    return { changed: false };
  }

  element.setAttribute("src", normalizedSrc);
  element.setAttribute("alt", nextAlt.trim());

  return {
    changed: true,
    hint: "Imagen actualizada desde la vista previa.",
    chatMessage: "Imagen actualizada desde la vista previa interactiva.",
  };
}

function resolveEditableTarget(target, frameDoc) {
  if (!target || !(target instanceof frameDoc.defaultView.Element)) return null;

  const image = target.closest("img");
  if (image) return { type: "image", element: image };

  const link = target.closest("a");
  if (link) return { type: "link", element: link };

  let node = target;
  while (node && node !== frameDoc.body) {
    if (isEditableTextElement(node, frameDoc)) {
      return { type: "text", element: node };
    }
    node = node.parentElement;
  }

  if (!["HTML", "BODY"].includes(target.tagName)) {
    const fallback = findEditableTextDescendant(target, frameDoc);
    if (fallback) {
      return { type: "text", element: fallback };
    }
  }

  return null;
}

function isEditableTextElement(element, frameDoc) {
  const blockedTags = new Set(["HTML", "BODY", "TABLE", "TBODY", "THEAD", "TFOOT", "TR"]);
  if (blockedTags.has(element.tagName)) return false;
  if (element.querySelector("img")) return false;

  const normalized = normalizeText(element.textContent);
  if (!normalized) return false;

  if (element.children.length === 0) return true;
  return hasDirectText(element, frameDoc);
}

function hasDirectText(element, frameDoc) {
  for (const node of element.childNodes) {
    if (node.nodeType === frameDoc.defaultView.Node.TEXT_NODE && normalizeText(node.textContent)) {
      return true;
    }
  }
  return false;
}

function findEditableTextDescendant(root, frameDoc) {
  if (!(root instanceof frameDoc.defaultView.Element)) return null;

  const walker = frameDoc.createTreeWalker(
    root,
    frameDoc.defaultView.NodeFilter.SHOW_ELEMENT
  );

  let current = walker.nextNode();
  while (current) {
    if (isEditableTextElement(current, frameDoc)) return current;
    current = walker.nextNode();
  }
  return null;
}

function markPreviewSelection(frameDoc, element) {
  frameDoc.querySelectorAll(".ha-preview-selected").forEach((el) => {
    el.classList.remove("ha-preview-selected");
  });
  clearPreviewHover(frameDoc);
  element.classList.add("ha-preview-selected");
}

function clearPreviewHover(frameDoc) {
  frameDoc.querySelectorAll(".ha-preview-hover").forEach((el) => {
    el.classList.remove("ha-preview-hover");
  });
}

function syncHtmlFromPreview(frameDoc) {
  const cleanedHtml = serializePreviewDocument(frameDoc);
  state.html = cleanedHtml;
  htmlEditor.value = state.html;
  textOutput.value = htmlToText(state.html);
  persistHtml();
}

function serializePreviewDocument(frameDoc) {
  const htmlClone = frameDoc.documentElement.cloneNode(true);
  const styleNode = htmlClone.querySelector(`#${PREVIEW_STYLE_ID}`);
  if (styleNode) styleNode.remove();

  htmlClone.querySelectorAll(".ha-preview-selected").forEach((el) => {
    el.classList.remove("ha-preview-selected");
  });

  htmlClone.querySelectorAll(".ha-preview-hover").forEach((el) => {
    el.classList.remove("ha-preview-hover");
  });

  const doctype = buildDoctype(frameDoc.doctype);
  return `${doctype}\n${htmlClone.outerHTML}`;
}

function buildDoctype(doctype) {
  if (!doctype) return "<!doctype html>";
  if (doctype.publicId) {
    const systemPart = doctype.systemId ? ` "${doctype.systemId}"` : "";
    return `<!DOCTYPE ${doctype.name} PUBLIC "${doctype.publicId}"${systemPart}>`;
  }
  if (doctype.systemId) {
    return `<!DOCTYPE ${doctype.name} SYSTEM "${doctype.systemId}">`;
  }
  return `<!doctype ${doctype.name}>`;
}

function injectPreviewStyles(frameDoc) {
  if (frameDoc.getElementById(PREVIEW_STYLE_ID)) return;
  const style = frameDoc.createElement("style");
  style.id = PREVIEW_STYLE_ID;
  style.textContent = `
    .ha-preview-hover {
      outline: 1px dashed #f4b400 !important;
      outline-offset: 2px !important;
      cursor: pointer !important;
    }
    .ha-preview-selected {
      outline: 2px solid #bf1e2e !important;
      outline-offset: 2px !important;
      cursor: pointer !important;
    }
  `;
  if (frameDoc.head) {
    frameDoc.head.appendChild(style);
  } else {
    frameDoc.documentElement.prepend(style);
  }
}

function setPreviewHint(text) {
  if (!previewHint) return;
  previewHint.textContent = text;
}

function normalizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
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

function addMessage(role, text) {
  state.chatHistory.push({ role, text });
  trimChatHistory();
  persistChat();
  appendMessage(role, text);
}

function appendMessage(role, text) {
  const fragment = messageTemplate.content.cloneNode(true);
  const item = fragment.querySelector(".chat-item");
  const roleNode = fragment.querySelector(".role");
  const textNode = fragment.querySelector(".text");

  item.dataset.role = role;
  roleNode.textContent = role === "assistant" ? "Asistente" : "Tu";
  textNode.textContent = text;

  chatLog.appendChild(fragment);
  chatLog.scrollTop = chatLog.scrollHeight;
}

function renderChat() {
  chatLog.innerHTML = "";
  state.chatHistory.forEach((item) => appendMessage(item.role, item.text));
}

function replaceLastAssistantMessage(text) {
  const assistantItems = [...chatLog.querySelectorAll('.chat-item[data-role="assistant"]')];
  const last = assistantItems[assistantItems.length - 1];

  if (last) {
    const p = last.querySelector(".text");
    p.textContent = text;
    chatLog.scrollTop = chatLog.scrollHeight;
  } else {
    appendMessage("assistant", text);
  }

  for (let i = state.chatHistory.length - 1; i >= 0; i -= 1) {
    if (state.chatHistory[i].role === "assistant") {
      state.chatHistory[i].text = text;
      persistChat();
      return;
    }
  }
}

function trimChatHistory() {
  if (state.chatHistory.length > 30) {
    state.chatHistory = state.chatHistory.slice(-30);
  }
}

function persistHtml() {
  localStorage.setItem(STORAGE_KEY, state.html);
}

function persistChat() {
  localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(state.chatHistory));
}

function downloadFile(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
