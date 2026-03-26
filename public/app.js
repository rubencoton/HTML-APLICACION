const STORAGE_KEY = "html-aplicacion-draft-v1";
const CHAT_STORAGE_KEY = "html-aplicacion-chat-v1";

const defaultEmailHtml = `<!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Oferta Especial</title>
  </head>
  <body style="margin:0;padding:0;background:#f7f6f2;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f7f6f2;padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="640" cellspacing="0" cellpadding="0" border="0" style="width:640px;max-width:640px;background:#ffffff;border-radius:16px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;">
            <tr>
              <td style="padding:28px 34px 14px 34px;background:#162436;color:#ffffff;">
                <p style="margin:0;font-size:13px;letter-spacing:0.08em;text-transform:uppercase;opacity:0.86;">HTML APLICACION</p>
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
                  <a href="https://example.com" style="display:inline-block;background:#007a5c;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:10px;font-size:15px;font-weight:700;">Quiero mi email ahora</a>
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:0 34px 28px 34px;">
                <img src="https://images.unsplash.com/photo-1519389950473-47ba0277781c?auto=format&fit=crop&w=1200&q=80" alt="Equipo creativo trabajando" width="572" style="display:block;width:100%;max-width:572px;border-radius:12px;" />
              </td>
            </tr>
            <tr>
              <td style="padding:18px 34px 30px 34px;border-top:1px solid #e8edf2;color:#5d6772;font-size:13px;line-height:1.6;">
                Recibes este email porque solicitaste informacion sobre nuestras soluciones web.
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
      text: "Listo para editar. Escribe una instruccion y aplico cambios en tu HTML.",
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
}

async function applyAiInstruction(instruction) {
  addMessage("user", instruction);
  setBusy(true);
  addMessage("assistant", "Procesando cambio...");

  try {
    const response = await fetch("/api/ai/revise", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        instruction,
        html: state.html,
        history: state.chatHistory.slice(-12),
      }),
    });

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "No se pudo aplicar la revision.");
    }

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

function setBusy(value) {
  state.busy = value;
  sendBtn.disabled = value;
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

  viewButtons.forEach((btn) => {
    btn.classList.toggle("active", btn.getAttribute("data-view") === view);
  });
}

function refreshOutputs() {
  previewFrame.srcdoc = state.html;
  textOutput.value = htmlToText(state.html);
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
