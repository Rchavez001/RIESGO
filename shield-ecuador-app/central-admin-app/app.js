const STORAGE_KEY = "ciber-dojo-central-admin-v2";

const baseState = {
  selectedDojoId: "dojo-phishing",
  selectedCampaignId: null,
  dojos: [
    {
      id: "dojo-phishing",
      name: "Mensajes falsos y correo seguro",
      theme: "Correos fraudulentos, enlaces sospechosos y suplantacion",
      iso: "Buenas practicas de seguridad",
      status: "activo",
    },
    {
      id: "dojo-passwords",
      name: "Contrasenas y verificacion en dos pasos",
      theme: "Claves y segundo candado de seguridad",
      iso: "Buenas practicas de seguridad",
      status: "activo",
    },
    {
      id: "dojo-backups",
      name: "Copias de seguridad y recuperacion",
      theme: "Respaldo, restauracion y archivos bloqueados por extorsion",
      iso: "Buenas practicas de seguridad",
      status: "borrador",
    },
  ],
  progression: [
    { belt: "Blanco", color: "#eeeeee", percent: 20, kata: "Kata 1", exam: "Examen fundamentos" },
    { belt: "Amarillo", color: "#f5c518", percent: 15, kata: "Kata 2", exam: "Examen reglas basicas" },
    { belt: "Naranja", color: "#f97316", percent: 10, kata: "Kata 3", exam: "Examen equipos y cuentas" },
    { belt: "Verde", color: "#22c55e", percent: 5, kata: "Kata 4", exam: "Examen acceso" },
    { belt: "Azul", color: "#3b82f6", percent: 5, kata: "Kata 5", exam: "Examen proteccion de informacion" },
    { belt: "Morado", color: "#a855f7", percent: 5, kata: "Kata 6", exam: "Examen cuidado de equipos" },
    { belt: "Rojo", color: "#e63946", percent: 5, kata: "Kata 7", exam: "Examen respuesta ante problemas" },
    { belt: "Negro", color: "#111827", percent: 35, kata: "Kata final", exam: "Revision integral" },
  ],
  aiProviders: [
    { name: "DeepSeek", timeoutMs: 1800, order: 1 },
    { name: "Kimi", timeoutMs: 2200, order: 2 },
    { name: "Claude", timeoutMs: 2600, order: 3 },
  ],
  newsAgent: {
    active: true,
    runTime: "07:30",
    urls: [
      "https://www.cisa.gov/news-events/cybersecurity-advisories",
      "https://www.bleepingcomputer.com/",
      "https://thehackernews.com/",
    ],
    lastRun: "Pendiente",
    lastAutoRunDay: "",
    prompt: "Buscar noticias recientes de ciberataques, extraer tactica, impacto, control preventivo y convertirlas en preguntas y katas practicas.",
  },
  generatedKatas: [
    {
      title: "Kata de revision de mensaje falso",
      source: "cisa.gov",
      scenario: "Un correo urgente solicita cambiar datos bancarios de un proveedor.",
      task: "Identifica senales de fraude, valida por canal alterno y redacta el reporte inicial.",
      difficulty: 2,
    },
  ],
  users: [
    { id: "u1", name: "Ana Paredes", dojo: "Mensajes falsos", progress: 36, questions: 18, topic: "Fraude bancario por mensaje", status: "activo" },
    { id: "u2", name: "Luis Mora", dojo: "Verificacion en dos pasos", progress: 21, questions: 12, topic: "Contrasenas", status: "activo" },
    { id: "u3", name: "Rosa Vera", dojo: "Copias de seguridad", progress: 9, questions: 5, topic: "Archivos bloqueados por extorsion", status: "suspendido" },
  ],
  topics: [
    { name: "Fraude bancario por mensaje", count: 42 },
    { name: "Verificacion en dos pasos y contrasenas", count: 29 },
    { name: "Archivos bloqueados y copias de seguridad", count: 16 },
    { name: "Uso seguro de WhatsApp", count: 11 },
  ],
  campaigns: [],
  campaignSettings: { max_image_kb: 500, max_image_width: 1920, max_image_height: 1920 },
  campaignAudit: [],
  occupations: [],
  selectedOccupationCode: null,
  questionsByDojo: {},
  newsAlerts: [],
};

let state = loadState();

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

function init() {
  ensureQuestionBanks();
  bindNavigation();
  bindActions();
  renderAll();
  void loadQuestionsFromSupabase();
  void loadNewsAlertsFromSupabase();
  void loadActor();
  void loadCampaignsFromSupabase();
  void loadCampaignSettingsFromSupabase();
  void loadCampaignAuditFromSupabase();
  void loadOccupationsFromSupabase();
  startNewsAgentScheduler();
}

function loadState() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return mergeState(baseState, stored || {});
  } catch {
    return structuredClone(baseState);
  }
}

function mergeState(base, saved) {
  const merged = structuredClone(base);
  Object.assign(merged, saved);
  merged.newsAgent = { ...base.newsAgent, ...(saved.newsAgent || {}) };
  merged.questionsByDojo = saved.questionsByDojo || {};
  merged.newsAlerts = saved.newsAlerts || [];
  merged.campaigns = [];
  merged.campaignAudit = [];
  merged.campaignSettings = base.campaignSettings;
  merged.selectedCampaignId = null;
  merged.occupations = [];
  merged.selectedOccupationCode = null;
  return merged;
}

function persist(message = "Cambios guardados.") {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  notify(message);
}

function bindNavigation() {
  $$(".nav-item").forEach((button) => {
    button.addEventListener("click", () => {
      $$(".nav-item").forEach((item) => item.classList.remove("active"));
      $$(".panel").forEach((panel) => panel.classList.remove("active"));
      button.classList.add("active");
      $(`#${button.dataset.panel}`).classList.add("active");
      if (button.dataset.panel === "questions" || button.dataset.panel === "newsAlerts") {
        renderQuestions();
        renderNewsAlerts();
      }
    });
  });
}

function bindActions() {
  $("#addDojo").addEventListener("click", addDojo);
  $("#generateQuestionPlan").addEventListener("click", generateQuestionPlan);
  $("#saveQuestions").addEventListener("click", saveQuestionsFromForm);
  $("#addAiProvider").addEventListener("click", addAiProvider);
  $("#testAiFlow").addEventListener("click", testAiFlow);
  $("#simulateOpenQuestion").addEventListener("click", simulateOpenQuestion);
  $("#bulkSuspend").addEventListener("click", suspendSelectedUsers);
  $("#addOccupation").addEventListener("click", addOccupation);
  $("#saveOccupation").addEventListener("click", saveOccupation);
  $("#deleteOccupation").addEventListener("click", deleteOccupation);
  $("#addCampaign").addEventListener("click", addCampaign);
  $("#saveCampaign").addEventListener("click", saveCampaign);
  $("#saveAdsSettings").addEventListener("click", saveCampaignSettings);
  $("#adImageFile").addEventListener("change", handleCampaignImageSelected);
  $("#saveNewsAgent").addEventListener("click", saveNewsAgentFromForm);
  $("#runNewsAgent").addEventListener("click", runNewsAgent);
  $("#forceNewsReview").addEventListener("click", runNewsAgent);
  $("#forgotPassword").addEventListener("click", openForgotPasswordModal);
  $("#refreshSenseiStats").addEventListener("click", loadSenseiStats);
  $$(".threat-nav button").forEach((button) => {
    button.addEventListener("click", () => {
      $$(".threat-nav button").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      state.threatView = button.dataset.threatView;
      void loadTpotView(state.threatView);
    });
  });
  $("#saveAll").addEventListener("click", () => persist("Borrador guardado localmente."));
  $("#publishAll").addEventListener("click", () => persist("Configuracion publicada para Ciber Dojo."));

  ["dojoName", "dojoTheme", "dojoIso", "dojoStatus"].forEach((id) => {
    $(`#${id}`).addEventListener("input", updateSelectedDojoFromForm);
  });

}

function renderAll() {
  renderMetrics();
  renderProgression();
  renderDojos();
  renderQuestions();
  renderAiProviders();
  renderTopics();
  renderUsers();
  renderCampaigns();
  renderNewsAgent();
  renderNewsAlerts();
  renderKatas();
  void loadTpotView(state.threatView || "dashboard");
  void loadSenseiStats();
}

function renderMetrics() {
  $("#metricDojos").textContent = state.dojos.filter((dojo) => dojo.status === "activo").length;
  $("#metricQuestions").textContent = String(Object.values(state.questionsByDojo).reduce((total, bank) => total + bank.length, 0));
  $("#metricUsers").textContent = String(state.users.filter((user) => user.status === "activo").length);
  $("#metricAds").textContent = String(state.campaigns.filter((campaign) => campaign.active).length);
}

function renderProgression() {
  $("#progressionPreview").innerHTML = state.progression.map((step) => `
    <div class="progress-row">
      <span class="belt-chip" style="background:${step.color}; color:${step.belt === "Negro" ? "#fff" : "#111827"}">${esc(step.belt)}</span>
      <div>
        <strong>${esc(step.kata)}</strong>
        <div class="muted">${esc(step.exam)}</div>
      </div>
      <strong>${step.percent}%</strong>
    </div>
  `).join("");

  $("#kataRules").innerHTML = state.progression.map((step) => `
    <div class="kata-rule">
      <span class="belt-chip" style="background:${step.color}; color:${step.belt === "Negro" ? "#fff" : "#111827"}">${esc(step.belt)}</span>
      <div>
        <strong>${esc(step.kata)}</strong>
        <span class="muted">${esc(step.exam)}</span>
      </div>
      <strong>${step.percent}%</strong>
    </div>
  `).join("");
}

function renderDojos() {
  $("#dojoList").innerHTML = state.dojos.map((dojo) => `
    <button class="dojo-item ${dojo.id === state.selectedDojoId ? "active" : ""}" data-id="${dojo.id}">
      <strong>${esc(dojo.name)}</strong>
      <span>${esc(dojo.iso)} - ${esc(dojo.status)}</span>
      <span>${esc(dojo.theme)}</span>
    </button>
  `).join("");

  $$(".dojo-item").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedDojoId = button.dataset.id;
      ensureQuestionBanks();
      renderDojos();
      renderQuestions();
    });
  });

  const dojo = getSelectedDojo();
  $("#dojoEditorTitle").textContent = dojo.name;
  $("#dojoName").value = dojo.name;
  $("#dojoTheme").value = dojo.theme;
  $("#dojoIso").value = dojo.iso;
  $("#dojoStatus").value = dojo.status;
}

function ensureQuestionBanks() {
  state.dojos.forEach((dojo) => {
    if (!Array.isArray(state.questionsByDojo[dojo.id])) {
      state.questionsByDojo[dojo.id] = createDefaultQuestions(dojo);
    }
  });
}

function createDefaultQuestions(dojo) {
  const manual = Array.from({ length: 20 }, (_, index) => ({
    id: `${dojo.id}-manual-${index + 1}`,
    number: index + 1,
    source: "manual",
    status: "aprobada",
    difficulty: Math.ceil((index + 1) / 4),
    kata: `Kata ${Math.min(7, Math.ceil((index + 1) / 3))}`,
    text: `Pregunta manual ${index + 1} sobre ${dojo.theme}`,
    answer: "Respuesta correcta pendiente de ajustar.",
    explanation: "Explicacion pendiente de ajustar.",
  }));

  const ai = Array.from({ length: 30 }, (_, index) => ({
    id: `${dojo.id}-ai-${index + 21}`,
    number: index + 21,
    source: "ia",
    status: index % 3 === 0 ? "pendiente" : "auditada",
    difficulty: Math.min(5, Math.ceil((index + 1) / 6)),
    kata: `Kata ${Math.min(7, Math.ceil((index + 1) / 5))}`,
    text: `Pregunta IA ${index + 21} sobre ${dojo.theme}`,
    answer: "Respuesta generada pendiente de auditoria.",
    explanation: "Justificacion generada pendiente de auditoria.",
  }));

  return [...manual, ...ai];
}

function renderQuestions() {
  const bank = state.questionsByDojo[state.selectedDojoId] || [];
  const dojo = getSelectedDojo();
  $("#questionDojoName").textContent = dojo.name;
  $("#manualQuestions").innerHTML = bank.filter((question) => question.source === "manual").map(questionEditor).join("");
  $("#aiQuestions").innerHTML = bank.filter((question) => question.source === "ia").map(questionEditor).join("");
}

function questionEditor(question) {
  return `
    <div class="question-editor" data-question-id="${esc(question.id)}">
      <div class="question-editor-head">
        <strong>#${String(question.number).padStart(2, "0")}</strong>
        <span class="badge ${question.source === "manual" ? "manual" : question.status === "pendiente" ? "audit" : "ai"}">${esc(question.source === "manual" ? "manual" : question.status)}</span>
      </div>
      <label>
        Pregunta
        <textarea data-field="text" rows="3">${esc(question.text)}</textarea>
      </label>
      <div class="muted small">Explicación simple: ${esc(explainText(question.text))}</div>
      <div class="question-mini-grid">
        <label>
          Dificultad
          <input data-field="difficulty" type="number" min="1" max="5" value="${question.difficulty}" />
        </label>
        <label>
          Kata
          <input data-field="kata" value="${esc(question.kata)}" />
        </label>
        <label>
          Estado
          <select data-field="status">
            <option value="aprobada" ${question.status === "aprobada" ? "selected" : ""}>aprobada</option>
            <option value="auditada" ${question.status === "auditada" ? "selected" : ""}>auditada</option>
            <option value="pendiente" ${question.status === "pendiente" ? "selected" : ""}>pendiente</option>
          </select>
        </label>
      </div>
      <label>
        Respuesta correcta
        <textarea data-field="answer" rows="2">${esc(question.answer)}</textarea>
      </label>
      <div class="muted small">Explicación simple: ${esc(explainText(question.answer))}</div>
      <label>
        Explicacion
        <textarea data-field="explanation" rows="2">${esc(question.explanation)}</textarea>
      </label>
    </div>
  `;
}

async function saveQuestionsFromForm() {
  const bank = state.questionsByDojo[state.selectedDojoId] || [];
  $$(".question-editor").forEach((editor) => {
    const question = bank.find((item) => item.id === editor.dataset.questionId);
    if (!question) return;
    editor.querySelectorAll("[data-field]").forEach((field) => {
      const key = field.dataset.field;
      question[key] = key === "difficulty" ? Number(field.value) : field.value;
    });
  });
  persist("Preguntas modificadas y guardadas.");
  await saveQuestionsToSupabase(bank, getSelectedDojo());
  renderMetrics();
  renderQuestions();
}

async function generateQuestionPlan() {
  const dojo = getSelectedDojo();
  state.questionsByDojo[dojo.id] = createDefaultQuestions(dojo);
  renderQuestions();
  persist("Plan de 50 preguntas regenerado para el dojo seleccionado.");
  await saveQuestionsToSupabase(state.questionsByDojo[dojo.id], dojo);
}

function renderAiProviders() {
  $("#aiProviders").innerHTML = state.aiProviders
    .sort((a, b) => a.order - b.order)
    .map((provider, index) => `
      <div class="ai-provider">
        <label>
          IA ${index + 1}
          <input value="${esc(provider.name)}" data-ai-index="${index}" data-field="name" />
        </label>
        <label>
          Timeout ms
          <input type="number" value="${provider.timeoutMs}" data-ai-index="${index}" data-field="timeoutMs" />
        </label>
        <label>
          Orden
          <input type="number" value="${provider.order}" data-ai-index="${index}" data-field="order" />
        </label>
      </div>
    `).join("");

  $$("[data-ai-index]").forEach((input) => {
    input.addEventListener("input", () => {
      const provider = state.aiProviders[Number(input.dataset.aiIndex)];
      const field = input.dataset.field;
      provider[field] = field === "name" ? input.value : Number(input.value);
      persist("Cadena IA actualizada.");
    });
  });

  $("#generatorPrompt").value = "Genera 30 preguntas por dojo, intercaladas con 20 manuales. Aumenta dificultad gradualmente. Devuelve JSON con pregunta, opciones, respuesta, explicacion, dificultad, control ISO y sugerencia de kata.";
  $("#auditorPrompt").value = "Audita y reformula preguntas generadas. Valida que el tema sea ciberseguridad, que la respuesta sea correcta, que la explicacion sea clara y que la dificultad coincida con el cinturon.";
}

function renderNewsAgent() {
  $("#newsAgentActive").checked = Boolean(state.newsAgent.active);
  $("#newsAgentTime").value = state.newsAgent.runTime;
  $("#newsAgentUrls").value = state.newsAgent.urls.join("\n");
  $("#newsAgentPrompt").value = state.newsAgent.prompt;
  $("#newsAgentLastRun").textContent = state.newsAgent.lastRun;
}

function renderNewsAlerts() {
  $("#newsAlertsLastRun").textContent = state.newsAgent.lastRun;

  if (!state.newsAlerts.length) {
    $("#newsAlertList").innerHTML = `<p class="muted">Aún no se han generado alertas de noticias.</p>`;
    $("#newsQuestionList").innerHTML = `<p class="muted">Las preguntas generadas por IA aparecerán aquí con fecha y hora.</p>`;
    return;
  }

  $("#newsAlertList").innerHTML = state.newsAlerts.map((alert) => `
    <div class="alert-card">
      <div class="alert-header">
        <strong>${esc(alert.summary)}</strong>
        <span>${esc(alert.createdAt)}</span>
      </div>
      <div class="alert-status">Estado: ${esc(alert.persisted ? "Guardada" : "Pendiente local")}</div>
      <p class="muted">Dojo: ${esc(alert.dojo)}</p>
      <p class="muted">Sitios revisados: ${esc(alert.sources.join(', '))}</p>
      <ul class="alert-items">
        ${alert.questions.map((question) => `
          <li>
            <strong>${esc(question.severity)}</strong> · ${esc(explainText(question.text))}
            <div class="muted">Kata: ${esc(question.kata)} · Estado: ${esc(question.status)}</div>
          </li>
        `).join('')}
      </ul>
    </div>
  `).join('');

  const questions = state.newsAlerts.flatMap((alert) =>
    alert.questions.map((question) => ({
      ...question,
      createdAt: alert.createdAt,
      dojo: alert.dojo,
      sourceList: alert.sources,
    }))
  );

  $("#newsQuestionList").innerHTML = questions.map((question) => `
    <div class="question-row">
      <strong>${esc(explainText(question.text))}</strong>
      <div class="muted">${esc(question.createdAt)} · ${esc(question.dojo)} · Severidad: ${esc(question.severity)}</div>
      <p>${esc(question.kata)}</p>
    </div>
  `).join('');
}

function saveNewsAgentFromForm() {
  state.newsAgent.active = $("#newsAgentActive").checked;
  state.newsAgent.runTime = $("#newsAgentTime").value || "07:30";
  state.newsAgent.urls = $("#newsAgentUrls").value.split(/\r?\n/).map((url) => url.trim()).filter(Boolean);
  state.newsAgent.prompt = $("#newsAgentPrompt").value.trim();
  persist("Agente de noticias configurado.");
  renderNewsAgent();
}

function runNewsAgent() {
  saveNewsAgentFromForm();
  const sources = state.newsAgent.urls.length ? state.newsAgent.urls : baseState.newsAgent.urls;
  const bank = state.questionsByDojo[state.selectedDojoId];
  const dojo = getSelectedDojo();
  const nextAi = bank.filter((question) => question.source === "ia").slice(0, 6);

  nextAi.forEach((question, index) => {
    const domain = sourceDomain(sources[index % sources.length]);
    question.text = `Segun una noticia revisada en ${domain}, un atacante explota ${topicForIndex(index)}. Que control reduce mejor el riesgo en ${dojo.name}?`;
    question.answer = answerForIndex(index);
    question.explanation = `La respuesta conecta el incidente con ${dojo.iso}, priorizando prevencion, deteccion y respuesta medible.`;
    question.status = "pendiente";
    question.kata = `Kata noticia ${index + 1}`;
  });

  state.generatedKatas.unshift(...sources.slice(0, 3).map((url, index) => ({
    title: `Kata de noticia ${index + 1}: ${topicForIndex(index)}`,
    source: sourceDomain(url),
    scenario: `El agente detecta una noticia de ciberataque en ${sourceDomain(url)} y la convierte en un escenario de entrenamiento.`,
    task: `Analizar indicadores, elegir controles, redactar comunicacion interna y definir una accion de mejora para ${dojo.name}.`,
    difficulty: Math.min(5, index + 2),
  })));

  const alertTime = new Date().toLocaleString("es-EC");
  const alertEntry = {
    id: `news-alert-${Date.now()}`,
    createdAt: alertTime,
    dojo: dojo.name,
    sources: sources.map((url) => sourceDomain(url)),
    urls: sources,
    summary: `La IA revisó ${sources.length} sitios y generó ${nextAi.length} preguntas para ${dojo.name}.`,
    persisted: false,
    questions: nextAi.map((question, index) => ({
      id: question.id,
      text: question.text,
      kata: question.kata,
      status: question.status,
      severity: ["Baja", "Media", "Alta"][index % 3],
    })),
  };

  state.newsAlerts.unshift(alertEntry);
  state.newsAlerts = state.newsAlerts.slice(0, 20);
  state.generatedKatas = state.generatedKatas.slice(0, 8);
  state.newsAgent.lastRun = alertTime;
  persist("Agente ejecutado: preguntas IA y katas generadas como borrador.");
  void saveNewsAlertToSupabase(alertEntry).then((saved) => {
    if (saved) {
      alertEntry.persisted = true;
      persist("Alerta IA guardada en Supabase.");
      renderNewsAlerts();
    }
  });
  void saveQuestionsToSupabase(bank, dojo);
  renderAll();
}

async function loadQuestionsFromSupabase() {
  try {
    const dojoIds = state.dojos.map((dojo) => dojo.id).join(",");
    const rows = await supabaseRest(`questions?select=id,dojo_id,order_num,source_type,audit_status,difficulty,kata_label,question_text,answer_text,explanation,options,active&dojo_id=in.(${dojoIds})&active=eq.true&order=order_num.asc`);
    if (!Array.isArray(rows) || rows.length === 0) return;

    state.dojos.forEach((dojo) => {
      const bank = rows
        .filter((row) => row.dojo_id === dojo.id)
        .map(questionFromSupabase);
      if (bank.length > 0) state.questionsByDojo[dojo.id] = bank;
    });

    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    renderAll();
    notify("Preguntas cargadas desde Supabase.");
  } catch (error) {
    console.warn("No se pudieron cargar preguntas desde Supabase:", error);
  }
}

async function loadNewsAlertsFromSupabase() {
  try {
    const rows = await supabaseRest(
      "alerts?select=id,title,description,threat_type,severity,source,source_url,published_at,active&active=eq.true&order=published_at.desc&limit=20"
    );
    if (!Array.isArray(rows)) return;

    const remoteAlerts = rows.map((row) => ({
      id: row.id,
      createdAt: new Date(row.published_at).toLocaleString("es-EC"),
      dojo: row.threat_type || "Revisión IA",
      sources: row.source ? [row.source] : [],
      urls: row.source_url ? row.source_url.split(",").map((url) => url.trim()) : [],
      summary: row.title || "Alerta generada por IA",
      persisted: true,
      questions: [
        {
          id: `${row.id}-summary`,
          text: row.description || "Descripción de la alerta no disponible.",
          kata: "Resumen de alerta",
          status: "publicado",
          severity: row.severity ? row.severity.charAt(0).toUpperCase() + row.severity.slice(1) : "Media",
        },
      ],
    }));

    const existingIds = new Set(state.newsAlerts.map((alert) => alert.id));
    state.newsAlerts = [...remoteAlerts, ...state.newsAlerts.filter((alert) => !existingIds.has(alert.id))].slice(0, 20);
    renderNewsAlerts();
  } catch (error) {
    console.warn("No se pudieron cargar alertas desde Supabase:", error);
  }
}

async function saveNewsAlertToSupabase(alertEntry) {
  try {
    await supabaseRest("alerts", {
      method: "POST",
      body: JSON.stringify([
        {
          title: alertEntry.summary,
          description: alertEntry.questions.map((q) => `- ${q.severity}: ${q.text}`).join("\n"),
          threat_type: "ciberataque",
          severity: alertEntry.questions.some((q) => q.severity === "Alta") ? "alta" : "media",
          source: alertEntry.sources[0] || "IA review",
          source_url: alertEntry.urls.join(", "),
          approved_by: null,
          active: true,
          published_at: new Date().toISOString(),
        },
      ]),
    });
    return true;
  } catch (error) {
    console.error("No se pudo guardar la alerta en Supabase:", error);
    alertEntry.persisted = false;
    persist("Alerta generada localmente, pero no se pudo guardar en Supabase.");
    renderNewsAlerts();
    return false;
  }
}

async function saveQuestionsToSupabase(bank, dojo) {
  try {
    const payload = bank.map((question) => questionToSupabase(question, dojo));
    await supabaseRest("questions?on_conflict=id", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(payload),
    });
    notify("Preguntas guardadas en Supabase para Cyber Dojo.");
  } catch (error) {
    console.error("No se pudieron guardar preguntas en Supabase:", error);
    notify("Guardado local listo. Supabase no acepto el banco; verifica la migracion 007.");
  }
}

async function supabaseRest(path, options = {}) {
  const response = await fetch(`/api/rest/v1/${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    throw new Error(`${response.status} ${await response.text()}`);
  }

  if (response.status === 204) return null;
  return response.json();
}

async function sendPasswordRecovery() {
  // kept for compatibility: call with explicit email
  console.warn('sendPasswordRecovery called without UI; use sendPasswordRecoveryFromModal(email)')
}

function openForgotPasswordModal() {
  const modal = $("#forgotPasswordModal")
  modal.classList.remove('hidden')
}

function closeForgotPasswordModal() {
  const modal = $("#forgotPasswordModal")
  modal.classList.add('hidden')
}

$("#forgotCancel").addEventListener('click', () => {
  closeForgotPasswordModal()
})

$("#forgotSend").addEventListener('click', async () => {
  const emailEl = $("#forgotEmail")
  const statusEl = $("#forgotStatus")
  const email = emailEl.value
  statusEl.textContent = ''
  if (!email) return statusEl.textContent = 'Ingrese un correo válido.'
  try {
    const resp = await fetch('/api/auth/v1/recover', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email }),
    })
    if (!resp.ok) {
      const txt = await resp.text()
      throw new Error(txt || resp.statusText)
    }
    statusEl.textContent = 'Se envió un correo con instrucciones para restablecer la contraseña.'
    setTimeout(() => closeForgotPasswordModal(), 1500)
  } catch (err) {
    console.error('Error enviando recuperación desde modal:', err)
    statusEl.textContent = 'Error al enviar. Verifica el correo e intenta nuevamente.'
  }
})

function questionFromSupabase(row) {
  return {
    id: row.id,
    number: row.order_num || 1,
    source: row.source_type === "manual" ? "manual" : "ia",
    status: row.audit_status === "approved" ? "aprobada" : row.audit_status === "pending" ? "pendiente" : row.audit_status || "pendiente",
    difficulty: row.difficulty || 1,
    kata: row.kata_label || "Kata 1",
    text: row.question_text,
    answer: row.answer_text || firstCorrectOptionText(row.options) || "Respuesta pendiente.",
    explanation: row.explanation || "Explicacion pendiente.",
  };
}

function questionToSupabase(question, dojo) {
  return {
    id: question.id,
    branch: dojo.id,
    dojo_id: dojo.id,
    order_num: question.number,
    iso_control: dojo.iso,
    question_text: question.text,
    question_type: "escenario",
    options: buildOptions(question),
    active: true,
    source_type: question.source === "manual" ? "manual" : "incident_investigation",
    audit_status: question.status === "pendiente" ? "pending" : "approved",
    difficulty: Number(question.difficulty) || 1,
    kata_label: question.kata,
    answer_text: question.answer,
    explanation: question.explanation,
    editable: true,
  };
}

function buildOptions(question) {
  const answer = question.answer || "Control correcto pendiente de configurar";
  return [
    { valor: "A", texto: answer, correcta: true },
    { valor: "B", texto: "Ignorar la alerta y continuar operando igual", correcta: false },
    { valor: "C", texto: "Compartir credenciales para resolver mas rapido", correcta: false },
    { valor: "D", texto: "Desactivar controles de seguridad temporalmente", correcta: false },
  ];
}

function firstCorrectOptionText(options) {
  if (!Array.isArray(options)) return "";
  const option = options.find((item) => item.correcta === true || item.is_correct === true) || options[0];
  return option?.texto || "";
}

function startNewsAgentScheduler() {
  window.setInterval(() => {
    if (!state.newsAgent.active) return;
    const now = new Date();
    const currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    const currentDay = now.toISOString().slice(0, 10);
    if (currentTime === state.newsAgent.runTime && state.newsAgent.lastAutoRunDay !== currentDay) {
      state.newsAgent.lastAutoRunDay = currentDay;
      runNewsAgent();
    }
  }, 30000);
}

function renderKatas() {
  $("#generatedKatas").innerHTML = state.generatedKatas.map((kata) => `
    <div class="kata-card">
      <div>
        <strong>${esc(kata.title)}</strong>
        <span class="muted">${esc(kata.source)} - Dificultad ${kata.difficulty}</span>
      </div>
      <p>${esc(kata.scenario)}</p>
      <p><strong>Accion:</strong> ${esc(kata.task)}</p>
    </div>
  `).join("");
}

async function loadSenseiStats() {
  try {
    const [consultations, daily] = await Promise.all([
      supabaseRest("sensei_consultations?select=id,question_text,is_cybersecurity,feedback_helpful,sentiment_label,created_at&order=created_at.desc&limit=20"),
      supabaseRest("sensei_consultation_stats?select=*&limit=14"),
    ]);

    const rows = Array.isArray(consultations) ? consultations : [];
    $("#senseiMetricTotal").textContent = String(rows.length);
    $("#senseiMetricOut").textContent = String(rows.filter((item) => !item.is_cybersecurity).length);
    $("#senseiMetricHelpful").textContent = String(rows.filter((item) => item.feedback_helpful === true).length);
    $("#senseiMetricPositive").textContent = String(rows.filter((item) => item.sentiment_label === "positivo").length);

    $("#senseiConsultationList").innerHTML = rows.length ? rows.map((item) => `
      <div class="question-row compact-row">
        <strong>${esc(new Date(item.created_at).toLocaleDateString("es-EC"))}</strong>
        <span>${esc(item.question_text)}</span>
        <span class="badge ${item.is_cybersecurity ? "ai" : "audit"}">${item.is_cybersecurity ? "ciber" : "fuera"}</span>
        <span class="badge ${item.sentiment_label === "positivo" ? "ai" : item.sentiment_label === "negativo" ? "audit" : "manual"}">${esc(item.sentiment_label || "sin feedback")}</span>
      </div>
    `).join("") : `<p class="muted">Aun no hay consultas registradas.</p>`;

    const dailyRows = Array.isArray(daily) ? daily : [];
    $("#senseiDailyStats").innerHTML = dailyRows.length ? dailyRows.map((item) => `
      <div class="topic-row">
        <strong>${esc(item.day)}</strong>
        <span>${item.total_consultations} consultas - ${item.helpful_yes} utiles - ${item.positive_feedback} positivas</span>
      </div>
    `).join("") : `<p class="muted">Sin estadistica diaria todavia.</p>`;
  } catch (error) {
    console.error("No se pudieron cargar estadisticas del Sensei:", error);
    $("#senseiConsultationList").innerHTML = `<p class="muted">No se pudieron cargar estadisticas. Verifica la migracion 008.</p>`;
  }
}

function renderTopics() {
  $("#topicStats").innerHTML = state.topics.map((topic) => `
    <div class="topic-row">
      <strong>${esc(topic.name)}</strong>
      <span>${topic.count} inquietudes</span>
    </div>
  `).join("");
}

function renderUsers() {
  $("#userRows").innerHTML = state.users.map((user) => `
    <tr>
      <td><input type="checkbox" data-user-id="${esc(user.id)}" /></td>
      <td>${esc(user.name)}</td>
      <td>${esc(user.dojo)}</td>
      <td>${user.progress}%</td>
      <td>${user.questions}</td>
      <td>${esc(user.topic)}</td>
      <td><span class="status ${esc(user.status)}">${esc(user.status)}</span></td>
    </tr>
  `).join("");
}

const SUPABASE_PROJECT_URL = "https://wbbcjiqzbzswxsmwjqlw.supabase.co";
const CAMPAIGN_STATUS_LABEL = { activa: "activa", suspendida: "suspendida", eliminada: "eliminada" };
const CAMPAIGN_STATUS_BADGE = { activa: "ai", suspendida: "audit", eliminada: "danger" };
let pendingCampaignImage = null;

async function loadActor() {
  try {
    const response = await fetch("/api/whoami");
    const data = await response.json();
    state.actor = data.actor || "central-admin";
  } catch (error) {
    state.actor = "central-admin";
  }
}

async function loadCampaignsFromSupabase() {
  try {
    const rows = await supabaseRest("central_admin_campaigns?select=*&order=created_at.desc");
    state.campaigns = Array.isArray(rows) ? rows : [];
    renderCampaigns();
  } catch (error) {
    console.warn("No se pudieron cargar las campanas:", error);
    notify("No se pudieron cargar las campanas de propaganda.");
  }
}

async function loadCampaignSettingsFromSupabase() {
  try {
    const rows = await supabaseRest("central_admin_campaign_settings?select=*&id=eq.1");
    if (Array.isArray(rows) && rows[0]) state.campaignSettings = rows[0];
    renderCampaignSettingsForm();
  } catch (error) {
    console.warn("No se pudieron cargar los limites de imagen:", error);
  }
}

async function loadCampaignAuditFromSupabase() {
  try {
    const rows = await supabaseRest(
      "central_admin_campaign_audit?select=id,actor,action,details,created_at,campaign:central_admin_campaigns(name)&order=created_at.desc&limit=50"
    );
    state.campaignAudit = Array.isArray(rows) ? rows : [];
    renderCampaignAudit();
  } catch (error) {
    console.warn("No se pudo cargar la auditoria de campanas:", error);
  }
}

function renderCampaignSettingsForm() {
  const settings = state.campaignSettings;
  $("#adsMaxKb").value = settings.max_image_kb;
  $("#adsMaxWidth").value = settings.max_image_width;
  $("#adsMaxHeight").value = settings.max_image_height;
}

async function saveCampaignSettings() {
  const maxKb = Number($("#adsMaxKb").value);
  const maxWidth = Number($("#adsMaxWidth").value);
  const maxHeight = Number($("#adsMaxHeight").value);
  const statusEl = $("#adsSettingsStatus");

  if (!maxKb || !maxWidth || !maxHeight || maxKb <= 0 || maxWidth <= 0 || maxHeight <= 0) {
    statusEl.textContent = "Ingresa valores mayores a 0.";
    return;
  }

  try {
    const rows = await supabaseRest("central_admin_campaign_settings?id=eq.1", {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        max_image_kb: maxKb,
        max_image_width: maxWidth,
        max_image_height: maxHeight,
        updated_by: state.actor || "central-admin",
      }),
    });
    if (Array.isArray(rows) && rows[0]) state.campaignSettings = rows[0];
    statusEl.textContent = "Limites guardados.";
    notify("Limites de imagen actualizados.");
  } catch (error) {
    console.warn("No se pudieron guardar los limites:", error);
    statusEl.textContent = "No se pudo guardar. Intenta de nuevo.";
  }
}

function handleCampaignImageSelected(event) {
  const file = event.target.files && event.target.files[0];
  const statusEl = $("#adImageStatus");
  const previewWrap = $("#adImagePreviewWrap");
  const previewImg = $("#adImagePreview");
  statusEl.textContent = "";

  if (!file) {
    pendingCampaignImage = null;
    return;
  }

  const settings = state.campaignSettings;
  const maxBytes = settings.max_image_kb * 1024;

  if (file.size > maxBytes) {
    statusEl.textContent = `La imagen pesa ${(file.size / 1024).toFixed(0)}KB. El maximo permitido es ${settings.max_image_kb}KB.`;
    event.target.value = "";
    pendingCampaignImage = null;
    return;
  }

  const objectUrl = URL.createObjectURL(file);
  const probe = new Image();
  probe.onload = () => {
    if (probe.naturalWidth > settings.max_image_width || probe.naturalHeight > settings.max_image_height) {
      statusEl.textContent = `La imagen mide ${probe.naturalWidth}x${probe.naturalHeight}px. El maximo permitido es ${settings.max_image_width}x${settings.max_image_height}px.`;
      event.target.value = "";
      pendingCampaignImage = null;
      URL.revokeObjectURL(objectUrl);
      return;
    }

    pendingCampaignImage = { file, previewUrl: objectUrl };
    previewImg.src = objectUrl;
    previewWrap.classList.remove("hidden");
    statusEl.textContent = `Lista para subir: ${(file.size / 1024).toFixed(0)}KB, ${probe.naturalWidth}x${probe.naturalHeight}px.`;
  };
  probe.onerror = () => {
    statusEl.textContent = "No se pudo leer la imagen. Intenta con otro archivo.";
    pendingCampaignImage = null;
  };
  probe.src = objectUrl;
}

async function uploadCampaignImage(file) {
  const safeExt = (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "") || "png";
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${safeExt}`;

  const response = await fetch(`/api/storage/v1/object/campaign-ads/${filename}`, {
    method: "POST",
    headers: { "Content-Type": file.type || "application/octet-stream" },
    body: file,
  });

  if (!response.ok) {
    throw new Error(`${response.status} ${await response.text()}`);
  }

  return `${SUPABASE_PROJECT_URL}/storage/v1/object/public/campaign-ads/${filename}`;
}

function renderCampaigns() {
  const list = $("#campaignList");
  if (state.campaigns.length === 0) {
    list.innerHTML = `<p class="muted">Todavia no hay campanas. Usa "Agregar campana" para crear la primera.</p>`;
  } else {
    list.innerHTML = state.campaigns.map((campaign) => `
      <button class="campaign-row ${campaign.id === state.selectedCampaignId ? "active" : ""}" data-id="${esc(campaign.id)}">
        <div>
          <strong>${esc(campaign.name)}</strong>
          <div class="muted">${esc(campaign.moment)} - ${campaign.duration_seconds}s - ${esc(campaign.validity_type)}</div>
        </div>
        <span class="badge ${CAMPAIGN_STATUS_BADGE[campaign.status] || "audit"}">${CAMPAIGN_STATUS_LABEL[campaign.status] || campaign.status}</span>
      </button>
    `).join("");
  }

  $$(".campaign-row").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedCampaignId = button.dataset.id;
      pendingCampaignImage = null;
      renderCampaigns();
    });
  });

  const campaign = getSelectedCampaign();
  const previewWrap = $("#adImagePreviewWrap");
  const previewImg = $("#adImagePreview");
  $("#adImageFile").value = "";
  $("#adImageStatus").textContent = "";

  if (campaign) {
    $("#adName").value = campaign.name;
    $("#adMoment").value = campaign.moment;
    $("#adDuration").value = campaign.duration_seconds;
    $("#adValidity").value = campaign.validity_type;
    $("#adStatus").value = campaign.status;
    $("#adLink").value = campaign.link_url || "";
    $("#adMessage").value = campaign.message;
    if (campaign.image_url) {
      previewImg.src = campaign.image_url;
      previewWrap.classList.remove("hidden");
    } else {
      previewWrap.classList.add("hidden");
    }
  } else {
    $("#adName").value = "";
    $("#adMoment").value = "inicio";
    $("#adDuration").value = 10;
    $("#adValidity").value = "indefinido";
    $("#adStatus").value = "activa";
    $("#adLink").value = "";
    $("#adMessage").value = "";
    previewWrap.classList.add("hidden");
  }
}

function renderCampaignAudit() {
  const container = $("#campaignAuditLog");
  if (state.campaignAudit.length === 0) {
    container.innerHTML = `<p class="muted">Todavia no hay cambios registrados.</p>`;
    return;
  }

  const actionLabel = { creada: "creo", actualizada: "actualizo", estado_cambiado: "cambio el estado de" };

  container.innerHTML = state.campaignAudit.map((entry) => {
    const campaignName = entry.campaign && entry.campaign.name ? entry.campaign.name : "(campana eliminada)";
    const when = new Date(entry.created_at).toLocaleString("es-EC");
    const detail = entry.action === "estado_cambiado" && entry.details
      ? ` de "${esc(entry.details.from || "")}" a "${esc(entry.details.to || "")}"`
      : "";
    return `
      <div class="progress-row">
        <strong>${esc(entry.actor)}</strong> ${actionLabel[entry.action] || entry.action} <strong>${esc(campaignName)}</strong>${detail}
        <div class="muted">${when}</div>
      </div>
    `;
  }).join("");
}

function addDojo() {
  const id = `dojo-${Date.now()}`;
  state.dojos.push({
    id,
    name: "Nuevo dojo tematico",
    theme: "Tema pendiente de configurar",
    iso: "ISO 27001 A.x",
    status: "borrador",
  });
  state.selectedDojoId = id;
  ensureQuestionBanks();
  persist("Dojo agregado. Configura tema, ISO y estado.");
  renderAll();
}

function addAiProvider() {
  state.aiProviders.push({
    name: "Nueva IA",
    timeoutMs: 2000,
    order: state.aiProviders.length + 1,
  });
  persist("Proveedor IA agregado.");
  renderAiProviders();
}

function addCampaign() {
  state.selectedCampaignId = null;
  pendingCampaignImage = null;
  renderCampaigns();
}

function updateSelectedDojoFromForm() {
  const dojo = getSelectedDojo();
  dojo.name = $("#dojoName").value;
  dojo.theme = $("#dojoTheme").value;
  dojo.iso = $("#dojoIso").value;
  dojo.status = $("#dojoStatus").value;
  renderMetrics();
  renderDojos();
}

async function saveCampaign() {
  const name = $("#adName").value.trim();
  const message = $("#adMessage").value.trim();

  if (!name || !message) {
    notify("Completa al menos el nombre y el mensaje de la campana.");
    return;
  }

  const existing = getSelectedCampaign();
  const payload = {
    name,
    moment: $("#adMoment").value,
    duration_seconds: Number($("#adDuration").value) || 10,
    validity_type: $("#adValidity").value,
    status: $("#adStatus").value,
    link_url: $("#adLink").value.trim() || null,
    message,
  };

  try {
    if (pendingCampaignImage) {
      payload.image_url = await uploadCampaignImage(pendingCampaignImage.file);
    }

    if (existing) {
      const previousStatus = existing.status;
      const rows = await supabaseRest(`central_admin_campaigns?id=eq.${existing.id}`, {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify(payload),
      });
      const updated = Array.isArray(rows) && rows[0] ? rows[0] : { ...existing, ...payload };
      state.campaigns = state.campaigns.map((campaign) => (campaign.id === updated.id ? updated : campaign));

      if (previousStatus !== updated.status) {
        await logCampaignAudit(updated.id, "estado_cambiado", { from: previousStatus, to: updated.status });
      }
      await logCampaignAudit(updated.id, "actualizada", payload);
      notify("Campana actualizada.");
    } else {
      const rows = await supabaseRest("central_admin_campaigns", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify(payload),
      });
      const created = Array.isArray(rows) && rows[0] ? rows[0] : null;
      if (created) {
        state.campaigns.unshift(created);
        state.selectedCampaignId = created.id;
        await logCampaignAudit(created.id, "creada", payload);
      }
      notify("Campana creada.");
    }

    pendingCampaignImage = null;
    renderCampaigns();
    renderMetrics();
    void loadCampaignAuditFromSupabase();
  } catch (error) {
    console.warn("No se pudo guardar la campana:", error);
    notify("No se pudo guardar la campana. Intenta de nuevo.");
  }
}

async function logCampaignAudit(campaignId, action, details) {
  try {
    const response = await fetch("/api/rest/v1/central_admin_campaign_audit", {
      method: "POST",
      headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({
        campaign_id: campaignId,
        actor: state.actor || "central-admin",
        action,
        details: details || {},
      }),
    });
    if (!response.ok) throw new Error(`${response.status} ${await response.text()}`);
  } catch (error) {
    console.warn("No se pudo registrar la auditoria:", error);
  }
}

function testAiFlow() {
  const ordered = [...state.aiProviders].sort((a, b) => a.order - b.order);
  notify(`Algoritmo probado: ${ordered.map((ia) => `${ia.name} (${ia.timeoutMs}ms)`).join(" -> ")} -> auditor.`);
}

function simulateOpenQuestion() {
  state.topics.unshift({ name: "Consulta abierta validada: seguridad en WhatsApp", count: 1 });
  persist("La IA valido que el tema es ciberseguridad y lo envio al flujo de respuesta + auditoria.");
  renderTopics();
}

function suspendSelectedUsers() {
  const selectedIds = $$("[data-user-id]:checked").map((input) => input.dataset.userId);
  state.users.forEach((user) => {
    if (selectedIds.includes(user.id)) user.status = "suspendido";
  });
  persist(`${selectedIds.length} usuario(s) dados de baja.`);
  renderUsers();
  renderMetrics();
}

function getSelectedDojo() {
  return state.dojos.find((dojo) => dojo.id === state.selectedDojoId) || state.dojos[0];
}

function getSelectedCampaign() {
  return state.campaigns.find((campaign) => campaign.id === state.selectedCampaignId) || null;
}

async function loadOccupationsFromSupabase() {
  try {
    const rows = await supabaseRest("business_sectors?select=code,label,industry,active,display_order&order=display_order.asc");
    state.occupations = Array.isArray(rows) ? rows : [];
    renderOccupations();
  } catch (error) {
    console.warn("No se pudieron cargar las ocupaciones:", error);
    notify("No se pudieron cargar las ocupaciones.");
  }
}

function getSelectedOccupation() {
  return state.occupations.find((item) => item.code === state.selectedOccupationCode) || null;
}

function slugifyOccupationCode(label) {
  const normalized = label
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return normalized.slice(0, 40) || `ocupacion_${Date.now()}`;
}

function renderOccupations() {
  const list = $("#occupationList");
  if (state.occupations.length === 0) {
    list.innerHTML = `<p class="muted">Todavia no hay ocupaciones cargadas.</p>`;
  } else {
    list.innerHTML = state.occupations.map((item) => `
      <button class="campaign-row ${item.code === state.selectedOccupationCode ? "active" : ""}" data-code="${esc(item.code)}">
        <div>
          <strong>${esc(item.label)}</strong>
          <div class="muted">${esc(item.industry || "Sin sector")}</div>
        </div>
        <span class="badge ${item.active ? "ai" : "audit"}">${item.active ? "activa" : "inactiva"}</span>
      </button>
    `).join("");

    $$("#occupationList .campaign-row").forEach((button) => {
      button.addEventListener("click", () => {
        state.selectedOccupationCode = button.dataset.code;
        renderOccupations();
      });
    });
  }

  const occupation = getSelectedOccupation();
  const statusEl = $("#occupationStatus");
  if (statusEl) statusEl.textContent = "";

  if (occupation) {
    $("#occLabel").value = occupation.label;
    $("#occIndustry").value = occupation.industry || "";
    $("#occOrder").value = occupation.display_order;
    $("#occStatus").value = occupation.active ? "activa" : "inactiva";
  } else {
    $("#occLabel").value = "";
    $("#occIndustry").value = "";
    $("#occOrder").value = state.occupations.length > 0
      ? Math.max(...state.occupations.map((item) => item.display_order || 0)) + 10
      : 10;
    $("#occStatus").value = "activa";
  }
}

function addOccupation() {
  state.selectedOccupationCode = null;
  renderOccupations();
}

async function saveOccupation() {
  const label = $("#occLabel").value.trim();
  const industry = $("#occIndustry").value.trim();
  const displayOrder = Number($("#occOrder").value) || 100;
  const active = $("#occStatus").value === "activa";
  const statusEl = $("#occupationStatus");

  if (!label) {
    statusEl.textContent = "Ingresa el nombre de la ocupacion.";
    return;
  }

  const existing = getSelectedOccupation();
  const payload = { label, industry: industry || null, display_order: displayOrder, active };

  try {
    if (existing) {
      const rows = await supabaseRest(`business_sectors?code=eq.${existing.code}`, {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify(payload),
      });
      const updated = Array.isArray(rows) && rows[0] ? rows[0] : { ...existing, ...payload };
      state.occupations = state.occupations.map((item) => (item.code === updated.code ? updated : item));
      notify("Ocupacion actualizada.");
    } else {
      const code = slugifyOccupationCode(label);
      const rows = await supabaseRest("business_sectors", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({ code, ...payload }),
      });
      const created = Array.isArray(rows) && rows[0] ? rows[0] : null;
      if (created) {
        state.occupations.push(created);
        state.selectedOccupationCode = created.code;
      }
      notify("Ocupacion agregada.");
    }

    renderOccupations();
  } catch (error) {
    console.warn("No se pudo guardar la ocupacion:", error);
    statusEl.textContent = "No se pudo guardar. Revisa que el nombre no este repetido.";
  }
}

async function deleteOccupation() {
  const occupation = getSelectedOccupation();
  if (!occupation) return;
  if (!window.confirm(`Eliminar "${occupation.label}" de la lista de ocupaciones?`)) return;

  try {
    await supabaseRest(`business_sectors?code=eq.${occupation.code}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
    state.occupations = state.occupations.filter((item) => item.code !== occupation.code);
    state.selectedOccupationCode = null;
    renderOccupations();
    notify("Ocupacion eliminada.");
  } catch (error) {
    console.warn("No se pudo eliminar la ocupacion:", error);
    notify("No se pudo eliminar la ocupacion.");
  }
}

function sourceDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url.replace(/^https?:\/\//, "").split("/")[0] || "fuente";
  }
}

function tpotFilters() {
  return Object.fromEntries(Object.entries({
    from: $("#threatFrom")?.value || "",
    to: $("#threatTo")?.value || "",
    source_ip: $("#threatSourceIp")?.value || "",
    port: $("#threatPort")?.value || "",
    severity: $("#threatSeverity")?.value || "",
    honeypot: $("#threatSensor")?.value || "",
    event_type: $("#threatEventType")?.value || "",
    ioc: $("#threatIoc")?.value || "",
    limit: "50",
  }).filter(([, value]) => value));
}

async function loadTpotView(view = "dashboard") {
  const content = $("#tpotContent");
  const status = $("#tpotStatus");
  if (!content || !status) return;
  state.threatView = view;
  status.textContent = "Consultando integracion T-Pot...";
  $("#threatDrilldown")?.classList.add("hidden");
  content.innerHTML = `<div class="empty-state">Cargando ${esc(view)}...</div>`;

  try {
    if (view === "dashboard") {
      const [summary, health, iocs, audit] = await Promise.all([
        tpotApi("summary"),
        tpotApi("health", {}, false),
        tpotApi("iocs"),
        tpotApi("audit-log", {}, false),
      ]);
      return renderThreatDashboard(summary, health, iocs, audit);
    }
    if (view === "alerts") return renderThreatAlerts(await tpotApi("logs"));
    if (view === "ai") return renderThreatAi(await tpotApi("audit-log", {}, false));
    if (view === "reports") {
      const [report, audit] = await Promise.all([tpotApi("reports"), tpotApi("audit-log", {}, false)]);
      return renderThreatReports(report, audit);
    }
    if (view === "config") {
      const [settings, health] = await Promise.all([tpotApi("settings", {}, false), tpotApi("health", {}, false)]);
      return renderThreatConfig(settings, health);
    }
  } catch (error) {
    status.textContent = "No se pudo consultar T-Pot.";
    content.innerHTML = `<div class="empty-state danger">Endpoint T-Pot no disponible o configuracion incompleta.</div>`;
  }
}

async function tpotApi(path, options = {}, includeFilters = true) {
  const params = includeFilters ? new URLSearchParams(tpotFilters()) : new URLSearchParams();
  const suffix = params.toString() ? `?${params}` : "";
  const response = await fetch(`/api/admin/tpot/${path}${suffix}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
  });
  if (!response.ok) throw new Error("tpot api failed");
  return response.json();
}

function renderThreatDashboard(summary, health, iocs, auditData) {
  const severity = summary.events_by_severity || {};
  const honeypots = Object.entries(summary.events_by_honeypot || {}).map(([value, count]) => ({ value, count }));
  const pendingAi = (auditData.audit || []).filter((item) => String(item.action || "").includes("ai") && item.status !== "approved").length;
  const published = (auditData.audit || []).filter((item) => item.status === "approved").length;
  $("#tpotStatus").textContent = `Dashboard defensivo: ${summary.total_events} eventos normalizados. Los datos sensibles se muestran enmascarados.`;
  $("#tpotContent").innerHTML = `
    <div class="threat-kpi-grid">
      ${threatKpi("Alertas criticas hoy", severity.critical || 0, "critical", "severity", "critical", "Alertas criticas")}
      ${threatKpi("Alertas altas", severity.high || 0, "high", "severity", "high", "Alertas altas")}
      ${threatKpi("Sensores activos", honeypots.length || (health.connected ? 1 : 0), "info", "sensor", "", "Sensores activos")}
      ${threatKpi("IPs sospechosas", summary.top_source_ips?.length || 0, "medium", "source_ip", "", "IPs sospechosas")}
      ${threatKpi("IOCs detectados", iocs.total || 0, "medium", "ioc", "", "Indicadores de compromiso")}
      ${threatKpi("Analisis IA pendientes", pendingAi, "high", "ai", "", "Cola de analisis IA")}
      ${threatKpi("Incidentes publicados", published, "low", "published", "", "Analisis publicados")}
      ${threatKpi("Ultima sincronizacion T-Pot", health.last_event_at ? health.last_event_at.slice(0, 16) : "n/d", "info", "last_sync", "", "Ultima sincronizacion")}
    </div>
    <div class="threat-grid">
      ${threatChart("Alertas por severidad", Object.entries(severity).map(([value, count]) => ({ value, count })), "severity")}
      ${threatChart("Eventos por tipo de ataque", countBy(summary.events_recent || [], "event_type"), "type")}
      ${threatChart("Top 10 IPs origen", summary.top_source_ips || [], "source_ip")}
      ${threatChart("Tendencia diaria de ataques", trendByDay(summary.events_recent || []), "trend")}
      ${threatChart("Sensores con mayor actividad", honeypots, "sensor")}
      ${threatChart("IOCs por categoria", countBy(iocs.iocs || [], "indicator_type"), "ioc")}
    </div>
    <article class="threat-card">
      <div class="card-heading">
        <div>
          <h3>Ultimas alertas relevantes</h3>
          <p class="muted">Vista ejecutiva. Los logs crudos quedan en el detalle tecnico.</p>
        </div>
        <button class="btn secondary" onclick="switchThreatView('alerts')">Ver alertas</button>
      </div>
      ${renderThreatEventTable(summary.events_recent || [], true)}
    </article>
  `;
}

function renderThreatAlerts(data) {
  $("#tpotStatus").textContent = `Alertas filtrables: ${data.events.length} de ${data.total}. Usa filtros simples para llegar al detalle tecnico.`;
  $("#tpotContent").innerHTML = `
    <div class="card-heading">
      <div>
        <h3>Alertas</h3>
        <p class="muted">Evento: actividad capturada por un sensor. Severidad: prioridad para revisarla.</p>
      </div>
      <button class="btn secondary" onclick="clearThreatFilters()">Limpiar filtros</button>
    </div>
    ${renderThreatFilters()}
    ${renderThreatEventTable(data.events || [], true)}
  `;
}

function renderThreatReports(report, auditData) {
  const approved = (auditData.audit || []).filter((item) => item.status === "approved");
  $("#tpotStatus").textContent = `Reporte generado: ${new Date(report.generated_at).toLocaleString("es-EC")}`;
  $("#tpotContent").innerHTML = `
    <div class="threat-grid three">
      <article class="threat-card"><h3>Reporte ejecutivo</h3><p>${esc(report.executive_report.risk_summary)}</p><ul>${report.executive_report.key_findings.map((item) => `<li>${esc(item)}</li>`).join("")}</ul></article>
      <article class="threat-card"><h3>Reporte tecnico</h3><p>IOCs: ${report.technical_report.iocs.length}. MITRE: ${report.technical_report.mitre_mapping.length}.</p><p class="muted">Usar para analistas y auditoria.</p></article>
      <article class="threat-card"><h3>Reporte educativo CiberDojo</h3><ul>${report.educational_report.suggested_questions.map((item) => `<li>${esc(item)}</li>`).join("")}</ul></article>
    </div>
    <article class="threat-card">
      <h3>Historial aprobado</h3>
      ${approved.length ? approved.map((item) => `<div class="audit-row"><strong>${esc(item.action)}</strong><span>${esc(item.status)}</span><small>${esc(item.created_at)}</small></div>`).join("") : "<p class='muted'>Aun no hay analisis aprobados para publicar.</p>"}
    </article>
  `;
}

function renderThreatAi(data) {
  const rows = data.jobs?.length ? data.jobs : (data.audit || []).filter((item) => String(item.action || "").includes("ai"));
  $("#tpotContent").innerHTML = `
    <div class="ai-page-heading">
      <div>
        <h3>Analisis IA de Amenazas</h3>
        <p>Genera analisis de eventos de seguridad y valida los resultados antes de publicarlos.</p>
        <p class="muted">Todo analisis generado por IA pasa por auditoria antes de mostrarse como resultado final.</p>
      </div>
    </div>
    ${renderThreatFilters(true)}
    <div class="ai-form-actions">
      <button class="btn secondary" onclick="clearThreatFilters()">Limpiar filtros</button>
      <button class="btn primary" onclick="createTpotAiAnalysis()">Generar analisis IA</button>
    </div>
    ${renderAiStepper(rows[0]?.status || "draft")}
    <article class="threat-card">
      <div class="card-heading">
        <div>
          <h3>Historial de analisis IA</h3>
          <p class="muted">Los resultados finales se bloquean hasta que la auditoria los apruebe.</p>
        </div>
      </div>
      ${renderAiHistoryTable(rows)}
    </article>
    <article class="threat-card">
      <h3>Cola de auditoria</h3>
      ${rows.length ? rows.map((item) => `<div class="audit-row"><strong>${esc(item.action)}</strong><span>${aiStatusBadge(mapAiStatus(item.status))}</span><small>${esc(item.created_at)}</small></div>`).join("") : "<p class='muted'>Sin analisis pendientes. Selecciona un periodo y presiona Generar analisis IA.</p>"}
    </article>
  `;
  $("#tpotStatus").textContent = "Analisis IA centralizado: generar, auditar, aprobar y publicar desde un solo flujo.";
}

function renderThreatConfig(settings, health) {
  $("#tpotStatus").textContent = "Configuracion avanzada separada de la operacion diaria. Los secretos se gestionan por variables de entorno.";
  $("#tpotContent").innerHTML = `
    <div class="threat-config-grid">
      <article class="config-block">
        <h3>Agente multimodal</h3>
        <label>Proveedor IA <input value="${esc(settings.ai_provider || "local")}" readonly /></label>
        <label>Modelo <input value="${esc(settings.ai_model || "local-tpot-threat-agent")}" readonly /></label>
        <label>Nombre del agente <input value="TpotThreatAnalysisAgent" readonly /></label>
        <label>Prompt del sistema <textarea readonly>No concluir sin evidencia. Citar eventos relevantes. Separar hechos, inferencias y recomendaciones.</textarea></label>
        <div class="check-grid">
          <label><input type="checkbox" checked disabled /> Logs T-Pot</label>
          <label><input type="checkbox" checked disabled /> IOCs</label>
          <label><input type="checkbox" checked disabled /> Evidencia manual</label>
        </div>
        <div class="toolbar-actions"><button class="btn secondary" disabled>Probar agente</button><button class="btn secondary" disabled>Restaurar recomendados</button></div>
      </article>
      <article class="config-block">
        <h3>IA auditora</h3>
        <label>Proveedor IA auditora <input value="${esc(settings.ai_provider || "local")}" readonly /></label>
        <label>Modelo auditor <input value="${esc(settings.ai_audit_model || "local-tpot-auditor")}" readonly /></label>
        <label>Umbral minimo de confianza <input value="0.80" readonly /></label>
        <div class="check-grid">
          <label><input type="checkbox" checked disabled /> Auditoria automatica</label>
          <label><input type="checkbox" checked disabled /> Rechazar sin evidencias</label>
          <label><input type="checkbox" checked disabled /> Rechazar recomendaciones inseguras</label>
          <label><input type="checkbox" checked disabled /> Revision humana si severidad critica</label>
        </div>
        <div class="toolbar-actions"><button class="btn secondary" disabled>Probar auditor</button><button class="btn secondary" disabled>Ejecutar prueba</button></div>
      </article>
      <article class="config-block">
        <h3>Flujo de aprobacion</h3>
        ${approvalRule("Generar analisis", "admin, analyst")}
        ${approvalRule("Auditar", "admin, auditor")}
        ${approvalRule("Publicar", "admin")}
        ${approvalRule("Publicacion", settings.ai_output_requires_approval ? "manual obligatoria" : "automatica si auditoria aprueba")}
        <p class="muted">No se puede publicar un analisis pendiente, rechazado o con revision humana abierta.</p>
      </article>
      <article class="config-block">
        <div class="card-heading">
          <div>
            <h3>Integraciones</h3>
            <p class="muted">T-Pot debe correr aislado. Esta app solo consulta APIs controladas.</p>
          </div>
          <button class="btn secondary" onclick="testThreatConnection()">Probar conexion</button>
        </div>
        ${tpotKpi("Elastic configurado", settings.elastic_url_configured ? "Si" : "No")}
        ${tpotKpi("T-Pot API", settings.base_url_configured ? "Si" : "No")}
        ${tpotKpi("TLS verify", settings.verify_tls ? "Si" : "No")}
        ${tpotKpi("Estado sensor", health.connected ? "Conectado" : "Demo/pendiente")}
        <pre class="safe-json">${esc(JSON.stringify({ indexes: health.indexes || [], last_event_at: health.last_event_at, mode: health.mode }, null, 2))}</pre>
      </article>
    </div>
  `;
}

async function createTpotAiAnalysis() {
  $("#tpotStatus").textContent = "Generando analisis IA y enviando a auditoria...";
  const body = {
    filters: tpotFilters(),
    options: {
      analysis_type: $("#tpotAnalysisType")?.value || "executive_summary",
      include_mitre: $("#tpotIncludeMitre")?.checked !== false,
      include_iocs: $("#tpotIncludeIocs")?.checked !== false,
    },
  };
  const response = await tpotApi("ai-analysis", { method: "POST", body: JSON.stringify(body) }, false);
  $("#tpotStatus").textContent = `Analisis IA creado: ${response.job_id}. Estado: ${mapAiStatus(response.status)}. Resultado final bloqueado hasta auditoria.`;
  setTimeout(() => checkTpotAiJob(response.job_id), 900);
}

async function checkTpotAiJob(jobId) {
  const job = await tpotApi(`ai-analysis/${jobId}`, {}, false);
  const status = mapAiStatus(job.status);
  const visible = ["approved", "published"].includes(status);
  $("#tpotContent").innerHTML = `
    <article class="threat-card">
      <h3>Detalle del analisis ${esc(jobId)}</h3>
      ${renderAiStepper(status)}
      <p>${visible ? "Resultado aprobado para visualizacion." : "El resultado final esta oculto hasta que la auditoria lo apruebe."}</p>
      <pre class="safe-json">${esc(JSON.stringify({ ...job, raw_ai_output: visible ? job.raw_ai_output : "[bloqueado hasta auditoria]" }, null, 2))}</pre>
    </article>
  `;
  $("#tpotStatus").textContent = `Analisis ${jobId}: ${status}. Auditoria obligatoria antes de publicar.`;
}

function tpotKpi(label, value) {
  return `<article class="metric tpot-kpi"><span>${esc(label)}</span><strong>${esc(String(value))}</strong></article>`;
}

function tpotList(title, items = []) {
  return `<article class="tpot-card"><h3>${esc(title)}</h3>${items.map((item) => `<div class="tpot-list-row"><span>${esc(String(item.value))}</span><strong>${item.count}</strong></div>`).join("") || "<p class='muted'>Sin datos.</p>"}</article>`;
}

function renderThreatFilters(includeIoc = false) {
  return `
    <div class="threat-filter-bar">
      <label>Desde <input id="threatFrom" type="datetime-local" /></label>
      <label>Hasta <input id="threatTo" type="datetime-local" /></label>
      <label>Sensor <input id="threatSensor" placeholder="cowrie, suricata" /></label>
      <label>Severidad
        <select id="threatSeverity">
          <option value="">Todas</option>
          <option value="critical">Critica</option>
          <option value="high">Alta</option>
          <option value="medium">Media</option>
          <option value="low">Baja</option>
          <option value="info">Informativa</option>
        </select>
      </label>
      <label>IP origen <input id="threatSourceIp" placeholder="198.51.100.x" /></label>
      <label>Puerto <input id="threatPort" type="number" min="1" max="65535" /></label>
      <label>Tipo de evento <input id="threatEventType" placeholder="brute_force" /></label>
      ${includeIoc ? `<label>IOC <input id="threatIoc" placeholder="ip, hash, url" /></label>` : ""}
    </div>
  `;
}

function renderThreatEventTable(events, withAction = false) {
  return `<table class="data-table threat-table"><thead><tr><th>Fecha/hora</th><th>Severidad</th><th>Tipo de amenaza</th><th>IP origen</th><th>Sensor</th><th>Estado</th>${withAction ? "<th>Accion</th>" : ""}</tr></thead>
  <tbody>${events.map((event) => `<tr><td>${esc(event.timestamp)}</td><td>${severityBadge(event.severity)}</td><td>${esc(event.event_type)}</td><td><code>${esc(event.source_ip)}</code></td><td>${esc(event.honeypot)}</td><td>Nuevo</td>${withAction ? `<td><button class="btn secondary small" onclick='openThreatEventDetail(${JSON.stringify(event).replaceAll("'", "&#39;")})'>Ver detalle</button></td>` : ""}</tr>`).join("") || `<tr><td colspan="${withAction ? 7 : 6}">No hay alertas para los filtros seleccionados. Prueba ampliar el rango de fechas.</td></tr>`}</tbody></table>`;
}

function threatKpi(label, value, severity, filterType, filterValue, title) {
  return `<button class="threat-kpi ${esc(severity)}" onclick="openThreatDrilldown('${esc(filterType)}','${esc(filterValue)}','${esc(title)}')"><span>${esc(label)}</span><strong>${esc(String(value))}</strong><small>Ver detalle</small></button>`;
}

function severityBadge(severity = "info") {
  const labels = { critical: "Critica", high: "Alta", medium: "Media", low: "Baja", info: "Info" };
  return `<span class="severity-badge ${esc(severity)}">${esc(labels[severity] || severity)}</span>`;
}

function threatChart(title, items = [], type) {
  const normalized = items.slice(0, 10).map((item) => ({ value: item.value || item[0] || "n/d", count: Number(item.count || item[1] || 0) }));
  const max = Math.max(1, ...normalized.map((item) => item.count));
  return `<article class="threat-card"><h3>${esc(title)}</h3>${normalized.map((item) => `
    <button class="bar-row" onclick="openThreatDrilldown('${esc(type)}','${esc(String(item.value))}','${esc(title)}: ${esc(String(item.value))}')">
      <span>${esc(String(item.value))}</span>
      <div class="bar-track"><i style="width:${Math.max(8, Math.round((item.count / max) * 100))}%"></i></div>
      <strong>${item.count}</strong>
    </button>`).join("") || "<p class='muted'>Sin datos.</p>"}</article>`;
}

function countBy(items, key) {
  const counts = items.reduce((acc, item) => {
    const value = item[key] || "n/d";
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});
  return Object.entries(counts).map(([value, count]) => ({ value, count }));
}

function trendByDay(events) {
  return countBy(events.map((event) => ({ day: (event.timestamp || "").slice(0, 10) || "n/d" })), "day");
}

function renderAiStepper(status) {
  const normalized = mapAiStatus(status);
  const steps = [
    ["draft", "Seleccion de eventos"],
    ["analyzing", "Analisis IA"],
    ["pending_audit", "Auditoria"],
    ["published", "Publicacion"],
  ];
  const order = ["draft", "queued", "analyzing", "pending_audit", "needs_human_review", "audit_failed", "approved", "published", "archived"];
  const current = order.indexOf(normalized);
  return `<div class="ai-stepper">${steps.map(([step, label], index) => {
    const stepIndex = order.indexOf(step);
    const stateClass = normalized === "audit_failed" && step === "pending_audit" ? "rejected" : normalized === "needs_human_review" && step === "pending_audit" ? "review" : current >= stepIndex ? "done" : index === 1 && normalized === "queued" ? "progress" : "pending";
    return `<div class="ai-step ${stateClass}"><span>${index + 1}</span><strong>${label}</strong><small>${stepStatusLabel(stateClass)}</small></div>`;
  }).join("")}</div>`;
}

function renderAiHistoryTable(rows) {
  return `<table class="data-table"><thead><tr><th>ID</th><th>Fecha de creacion</th><th>Rango analizado</th><th>Sensor</th><th>Severidad</th><th>Eventos</th><th>Estado</th><th>Confianza IA</th><th>Auditoria</th><th>Accion</th></tr></thead>
  <tbody>${rows.map((item, index) => {
    const status = mapAiStatus(item.status);
    const jobId = item.id || item.metadata?.job_id || "";
    const eventCount = item.input_summary_json?.event_count || item.records_count || 0;
    return `<tr><td>${esc(jobId ? jobId.slice(0, 8) : `AI-${index + 1}`)}</td><td>${esc(item.created_at || "")}</td><td>${esc(filterRange(item.filters_json))}</td><td>${esc(filterValue(item.filters_json, "honeypot") || "Todos")}</td><td>${severityBadge(filterValue(item.filters_json, "severity") || "info")}</td><td>${esc(String(eventCount))}</td><td>${aiStatusBadge(status)}</td><td>${status === "approved" ? "0.86" : "Pendiente"}</td><td>${auditStatusText(status)}</td><td>${aiActionButtons(status, jobId)}</td></tr>`;
  }).join("") || "<tr><td colspan='10'>Todavia no hay analisis generados. Selecciona un periodo y presiona Generar analisis IA.</td></tr>"}</tbody></table>`;
}

function mapAiStatus(status = "draft") {
  return {
    accepted: "queued",
    pending: "queued",
    running: "analyzing",
    audited: "pending_audit",
    approved: "approved",
    rejected: "audit_failed",
    failed: "audit_failed",
  }[status] || status;
}

function aiStatusBadge(status) {
  const labels = {
    draft: "Borrador",
    queued: "En cola",
    analyzing: "Analizando",
    pending_audit: "Pendiente de auditoria",
    audit_failed: "Auditoria rechazada",
    needs_human_review: "Requiere revision humana",
    approved: "Aprobado",
    published: "Publicado",
    archived: "Archivado",
  };
  return `<span class="ai-status ${esc(status)}">${esc(labels[status] || status)}</span>`;
}

function auditStatusText(status) {
  if (status === "approved" || status === "published") return "Aprobada";
  if (status === "audit_failed") return "Rechazada";
  if (status === "needs_human_review") return "Revision humana";
  return "Pendiente";
}

function aiActionButtons(status, jobId) {
  if (status === "pending_audit") return `<button class="btn secondary small" onclick="auditThreatJob('${esc(jobId)}')">Auditar</button>`;
  if (status === "needs_human_review") return `<button class="btn secondary small" onclick="approveThreatJob('${esc(jobId)}')">Aprobar</button> <button class="btn secondary small" onclick="rejectThreatJob('${esc(jobId)}')">Rechazar</button>`;
  if (status === "approved") return `<button class="btn secondary small" onclick="publishThreatJob('${esc(jobId)}')">Publicar</button>`;
  if (status === "published") return `<button class="btn secondary small" disabled>Publicado</button>`;
  return `<button class="btn secondary small" disabled>Ver detalle</button>`;
}

function stepStatusLabel(stateClass) {
  return { done: "Completado", progress: "En progreso", review: "Requiere revision", rejected: "Rechazado", pending: "Pendiente" }[stateClass] || "Pendiente";
}

function filterValue(filtersJson, key) {
  try {
    const filters = typeof filtersJson === "string" ? JSON.parse(filtersJson) : filtersJson || {};
    return filters[key] || "";
  } catch {
    return "";
  }
}

function filterRange(filtersJson) {
  const from = filterValue(filtersJson, "from") || "inicio";
  const to = filterValue(filtersJson, "to") || "ahora";
  return `${from} - ${to}`;
}

function approvalRule(label, value) {
  return `<div class="approval-rule"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`;
}

function clearThreatFilters() {
  ["threatFrom", "threatTo", "threatSensor", "threatSeverity", "threatSourceIp", "threatPort", "threatEventType", "threatIoc"].forEach((id) => {
    const field = $(`#${id}`);
    if (field) field.value = "";
  });
  void loadTpotView(state.threatView || "dashboard");
}

function switchThreatView(view) {
  const button = $(`.threat-nav button[data-threat-view="${view}"]`);
  if (button) button.click();
}

async function openThreatDrilldown(filterType, filterValue, title) {
  const panel = $("#threatDrilldown");
  if (!panel) return;
  panel.classList.remove("hidden");
  panel.innerHTML = `<div class="empty-state">Cargando detalle: ${esc(title)}...</div>`;
  const params = {};
  if (filterType === "severity" && filterValue) params.severity = filterValue;
  if (filterType === "source_ip" && filterValue) params.source_ip = filterValue;
  const query = new URLSearchParams({ ...params, limit: "25" });
  const response = await fetch(`/api/admin/tpot/logs?${query}`);
  const data = response.ok ? await response.json() : { events: [] };
  panel.innerHTML = `
    <article class="drilldown-panel">
      <div class="card-heading">
        <div><h3>${esc(title)}</h3><p class="muted">Drill-down desde el dashboard hasta eventos normalizados.</p></div>
        <button class="btn secondary" onclick="document.querySelector('#threatDrilldown').classList.add('hidden')">Cerrar</button>
      </div>
      ${renderThreatEventTable(data.events || [], true)}
    </article>
  `;
}

function openThreatEventDetail(event) {
  const panel = $("#threatDrilldown");
  if (!panel) return;
  panel.classList.remove("hidden");
  panel.innerHTML = `
    <article class="drilldown-panel">
      <div class="card-heading">
        <div><h3>Detalle tecnico del evento</h3><p class="muted">Resumen, IOCs, timeline, evidencia, analisis IA y auditoria.</p></div>
        <button class="btn secondary" onclick="document.querySelector('#threatDrilldown').classList.add('hidden')">Cerrar</button>
      </div>
      <div class="event-detail-grid">
        ${detailItem("ID del evento", event.event_id || "n/d")}
        ${detailItem("Fecha/hora", event.timestamp)}
        ${detailItem("Sensor", event.honeypot)}
        ${detailItem("IP origen", event.source_ip)}
        ${detailItem("IP destino", event.destination_ip || "n/d")}
        ${detailItem("Puerto", event.destination_port || "n/d")}
        ${detailItem("Protocolo", event.protocol || "n/d")}
        ${detailItem("Tipo de ataque", event.event_type)}
        ${detailItem("Severidad", event.severity)}
        ${detailItem("Pais", event.source_country || "n/d")}
      </div>
      <div class="evidence-tabs">
        <article><h4>Resumen</h4><p>Actividad detectada por ${esc(event.honeypot)} desde ${esc(event.source_ip)}.</p></article>
        <article><h4>Logs</h4><pre class="safe-json">${esc(JSON.stringify(event.normalizedLog || event, null, 2))}</pre></article>
        <article><h4>IOCs</h4><p>${esc(event.source_ip)} / puerto ${esc(String(event.destination_port || "n/d"))}</p></article>
        <article><h4>Analisis IA</h4><p class="muted">Disponible solo cuando exista un analisis auditado y aprobado.</p></article>
        <article><h4>Auditoria</h4><p class="muted">Sin aprobacion final registrada para este evento.</p></article>
      </div>
    </article>
  `;
}

function detailItem(label, value) {
  return `<div><span>${esc(label)}</span><strong>${esc(String(value ?? ""))}</strong></div>`;
}

async function testThreatConnection() {
  $("#tpotStatus").textContent = "Probando conexion con sensor T-Pot/Elastic...";
  const health = await tpotApi("health", {}, false);
  $("#tpotStatus").textContent = `${health.status}. Latencia: ${health.latency_ms}ms. Modo: ${health.mode}.`;
}

async function auditThreatJob(jobId) {
  if (!jobId) return;
  await tpotApi(`ai-analysis/${jobId}/audit`, { method: "POST" }, false);
  void loadTpotView("ai");
}

async function approveThreatJob(jobId) {
  if (!jobId) return;
  await tpotApi(`ai-analysis/${jobId}/approve`, { method: "POST" }, false);
  void loadTpotView("ai");
}

async function rejectThreatJob(jobId) {
  if (!jobId) return;
  await tpotApi(`ai-analysis/${jobId}/reject`, { method: "POST", body: JSON.stringify({ reason: "Rechazado desde revision manual" }) }, false);
  void loadTpotView("ai");
}

function publishThreatJob() {
  $("#tpotStatus").textContent = "Publicacion registrada en UI. La persistencia final debe quedar conectada al backend de aprobacion.";
}

function topicForIndex(index) {
  return ["mensaje falso dirigido", "archivos bloqueados por extorsion", "robo de claves", "falla critica de seguridad", "fuga de datos", "abuso de verificacion en dos pasos"][index % 6];
}

function answerForIndex(index) {
  return [
    "Validar quien envia el mensaje, revisar si mete urgencia y confirmar por otro canal antes de actuar.",
    "Mantener copias de seguridad separadas y probadas, junto con pasos claros para contener el problema.",
    "Activar verificacion en dos pasos, que es cuando ademas de tu clave recibes un codigo o permiso en el celular, y usar un gestor de contraseñas: es una aplicacion segura que guarda tus claves y las completa por ti, para que no tengas que recordar ni escribir todas las contraseñas manualmente.",
    "Instalar actualizaciones segun la gravedad y si el equipo esta expuesto a internet.",
    "Ordenar los datos importantes, dar acceso solo a quien lo necesita y revisar entradas.",
    "Usar confirmaciones por otro canal y alertas cuando haya demasiados pedidos de aprobacion.",
  ][index % 6];
}

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function explainText(value) {
  if (!value) return "";
  let s = String(value);
  const replacements = [
    ["\\bMFA\\b", "autenticación multifactor (MFA). Es cuando además de la contraseña se pide otro código o permiso, por ejemplo en el celular"],
    ["\\b2FA\\b", "verificación en dos pasos (2FA). Es cuando además de la contraseña recibes un código en el celular"],
    ["\\bISO\\b", "ISO (norma internacional de buenas prácticas de seguridad)"],
    ["\\bCVE\\b", "CVE (identificador público de una vulnerabilidad)"],
    ["\\bkata\\b", "kata (ejercicio práctico de entrenamiento)"],
    ["\\bdojo\\b", "dojo (espacio o conjunto de ejercicios para practicar habilidades)"],
  ];

  replacements.forEach(([pattern, replacement]) => {
    try {
      s = s.replace(new RegExp(pattern, "gi"), replacement);
    } catch (e) {
      // ignore regexp errors for odd inputs
    }
  });

  return s;
}

function notify(message) {
  const existing = $(".toast");
  if (existing) existing.remove();

  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3200);
}

init();
