const STORAGE_KEY = "ciber-dojo-central-admin-v2";

// Rendered as an API-key input's value (not just a placeholder) whenever a
// key is already saved, so the box itself shows "hay una clave guardada" at
// a glance — type="password" turns it into dots on screen either way, and
// typing over it is how you replace it. Shared by both places that manage
// AI provider keys (the real news-agent provider chain and the local/draft
// "Configuracion de IA" panel), so the masked look is consistent.
const MASKED_KEY_PLACEHOLDER = "••••••••••••";

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
    { belt: "Verde", color: "#22c55e", percent: 10, kata: "Kata 4", exam: "Examen acceso" },
    { belt: "Azul", color: "#3b82f6", percent: 10, kata: "Kata 5", exam: "Examen proteccion de informacion" },
    { belt: "Marrón", color: "#8b5a2b", percent: 10, kata: "Kata 6", exam: "Examen casos ciberdelito Ecuador" },
    { belt: "Negro", color: "#111827", percent: 25, kata: "Kata final", exam: "Revision integral" },
  ],
  aiProviders: [
    { name: "DeepSeek", timeoutMs: 1800, order: 1 },
    { name: "Kimi", timeoutMs: 2200, order: 2 },
    { name: "Claude", timeoutMs: 2600, order: 3 },
  ],
  newsAgent: {
    id: null,
    active: true,
    runTime: "07:30",
    lastRun: "Pendiente",
    prompt: "",
  },
  newsSources: [],
  newsRuns: [],
  newsGenerated: [],
  newsAgentBusy: false,
  manualContentBusy: false,
  championship: null,
  championshipRegistrations: [],
  championshipMatches: [],
  newsProviders: [],
  newsChain: [],
  newsProviderEditingKey: undefined,
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
  tierWeights: [],
  availableSectors: [],
  lastEntryRows: [],
  lastImpressionRows: [],
  lastCampaignRows: [],
  reportDrillPath: [],
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
  bindMobileMenu();
  bindDelegatedActions();
  bindActions();
  renderAll();
  void loadOverviewMetrics();
  void loadQuestionsFromSupabase();
  void loadNewsAlertsFromSupabase();
  void loadActor();
  void loadCampaignsFromSupabase();
  void loadCampaignSettingsFromSupabase();
  void loadCampaignAuditFromSupabase();
  void loadTierWeightsFromSupabase();
  void loadOccupationsFromSupabase();
  void loadAvailableSectorsFromSupabase();
  void runReport();
  void loadNewsAgentConfigFromSupabase();
  void loadNewsSourcesFromSupabase();
  void loadNewsRunsFromSupabase();
  void loadNewsGeneratedFromSupabase();
  void loadNewsProvidersFromSupabase();
  void loadNewsChainFromSupabase();
  void loadChampionshipConfig();
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
  merged.availableSectors = [];
  return merged;
}

function persist(message = "Cambios guardados.") {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  notify(message);
}

// Actions reachable from data-act="..." attributes (data-a1..a3 carry the arguments as plain text).
const DELEGATED_ACTIONS = {
  switchThreatView: (view) => switchThreatView(view),
  clearThreatFilters: () => clearThreatFilters(),
  createTpotAiAnalysis: () => createTpotAiAnalysis(),
  testThreatConnection: () => testThreatConnection(),
  openThreatDrilldown: (type, value, title) => openThreatDrilldown(type, value, title),
  openThreatEventDetail: (json) => { try { openThreatEventDetail(JSON.parse(json)); } catch { notify("No se pudo abrir el detalle del evento."); } },
  auditThreatJob: (id) => auditThreatJob(id),
  approveThreatJob: (id) => approveThreatJob(id),
  rejectThreatJob: (id) => rejectThreatJob(id),
  publishThreatJob: (id) => publishThreatJob(id),
  closeThreatDrilldown: () => $("#threatDrilldown").classList.add("hidden"),
  closeSecFindingModal: () => closeSecFindingModal(),
};

function bindDelegatedActions() {
  document.addEventListener("click", (event) => {
    const el = event.target instanceof Element ? event.target.closest("[data-act]") : null;
    const action = el && Object.prototype.hasOwnProperty.call(DELEGATED_ACTIONS, el.dataset.act) ? DELEGATED_ACTIONS[el.dataset.act] : null;
    if (action) action(el.dataset.a1, el.dataset.a2, el.dataset.a3);
  });
}

// Below 1180 px the navigation rail is an off-canvas menu instead of ~800 px of buttons stacked above the content.
const mobileNavQuery = window.matchMedia("(max-width: 1180px)");

function syncMobileMenu() {
  const rail = $("#rail");
  const open = rail.classList.contains("open");
  rail.inert = mobileNavQuery.matches && !open;
  $("#menuToggle").setAttribute("aria-expanded", String(open));
  $("#menuBackdrop").hidden = !(mobileNavQuery.matches && open);
  document.body.classList.toggle("menu-open", mobileNavQuery.matches && open);
}

function openMobileMenu() {
  $("#rail").classList.add("open");
  syncMobileMenu();
  $("#rail .nav-item.active, #rail .nav-item")?.focus();
}

function closeMobileMenu(returnFocus = true) {
  const rail = $("#rail");
  if (!rail.classList.contains("open")) return;
  rail.classList.remove("open");
  syncMobileMenu();
  if (returnFocus) $("#menuToggle").focus();
}

function bindMobileMenu() {
  $("#menuToggle").addEventListener("click", () => ($("#rail").classList.contains("open") ? closeMobileMenu() : openMobileMenu()));
  $("#menuBackdrop").addEventListener("click", () => closeMobileMenu());
  document.addEventListener("keydown", (event) => { if (event.key === "Escape") closeMobileMenu(); });
  mobileNavQuery.addEventListener("change", () => { $("#rail").classList.remove("open"); syncMobileMenu(); });
  syncMobileMenu();
}

function bindNavigation() {
  $$(".nav-item").forEach((button) => {
    button.addEventListener("click", () => {
      $$(".nav-item").forEach((item) => { item.classList.remove("active"); item.removeAttribute("aria-current"); });
      $$(".panel").forEach((panel) => panel.classList.remove("active"));
      button.classList.add("active");
      button.setAttribute("aria-current", "page");
      $(`#${button.dataset.panel}`).classList.add("active");
      closeMobileMenu(false);
      // A section swap replaces the visible content: start at its top and tell keyboard/screen-reader users.
      window.scrollTo(0, 0);
      const heading = $(`#${button.dataset.panel}`).querySelector("h2");
      if (heading) { heading.setAttribute("tabindex", "-1"); heading.focus({ preventScroll: true }); }
      if (button.dataset.panel === "questions" || button.dataset.panel === "newsAlerts") {
        renderQuestions();
        renderNewsAlerts();
      }
      if (button.dataset.panel === "reports") {
        ["topChart"].forEach((id) => {
          const chart = ensureChart(id);
          if (chart) chart.resize();
        });
      }
      if (button.dataset.panel === "securityCenter") {
        void loadSecurityCenter();
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
  $("#adTargetAll").addEventListener("change", (e) => setTargetAllUI(e.target.checked));
  $("#adDonationType").addEventListener("change", (e) => setDonationTypeUI(e.target.value));
  $("#adValueTier").addEventListener("change", updatePriorityHint);
  $("#saveTierWeights").addEventListener("click", saveTierWeights);
  $("#runReport").addEventListener("click", runReport);
  $("#saveNewsAgent").addEventListener("click", saveNewsAgentFromForm);
  $("#testNewsAgent").addEventListener("click", testNewsAgent);
  $("#runNewsAgent").addEventListener("click", runNewsAgent);
  $("#forceNewsReview").addEventListener("click", runNewsAgent);
  $("#addNewsSource").addEventListener("click", addNewsSource);
  $("#refreshNewsRuns").addEventListener("click", loadNewsRunsFromSupabase);
  $("#newsProviderAddNew").addEventListener("click", () => openNewsProviderForm(null));
  $("#npCancel").addEventListener("click", closeNewsProviderForm);
  $("#npSave").addEventListener("click", saveNewsProviderForm);
  $("#newsChainAddBtn").addEventListener("click", addNewsChainAssignment);
  $("#manualContentTest").addEventListener("click", testManualContent);
  $("#manualContentGenerate").addEventListener("click", generateManualContent);
  $("#champSaveConfig").addEventListener("click", saveChampionshipConfig);
  $("#champResendKeySave").addEventListener("click", saveChampionshipResendKey);
  $("#champDrawRound1").addEventListener("click", runChampionshipDraw);
  $("#champRefreshRegistrations").addEventListener("click", loadChampionshipRegistrations);
  $("#champRefreshMatches").addEventListener("click", loadChampionshipMatches);
  $("#logoutBtn").addEventListener("click", logout);
  $("#refreshSenseiStats").addEventListener("click", loadSenseiStats);
  $("#secCheckAlertsNow").addEventListener("click", runSecurityAlertCheck);
  $("#secRefreshFeed").addEventListener("click", () => { state.secFeedOffset = 0; void loadSecurityFeed(); });
  $("#secFeedPrev").addEventListener("click", () => { state.secFeedOffset = Math.max(0, (state.secFeedOffset || 0) - SEC_FEED_PAGE_SIZE); void loadSecurityFeed(); });
  $("#secFeedNext").addEventListener("click", () => { state.secFeedOffset = (state.secFeedOffset || 0) + SEC_FEED_PAGE_SIZE; void loadSecurityFeed(); });
  $("#secExportCsv").addEventListener("click", exportSecurityEventsCsv);
  $("#secExportPdf").addEventListener("click", exportSecurityEventsPdf);
  $("#secAlertSave").addEventListener("click", saveSecurityAlertConfig);
  $("#secAlertNew").addEventListener("click", clearSecurityAlertForm);
  $("#secAlertDelete").addEventListener("click", deleteSecurityAlertConfig);
  $("#secRunDiagnosis").addEventListener("click", runSecurityDiagnosis);
  $("#secRunEasm").addEventListener("click", runSecurityEasmScan);
  $("#secKataSaveDraft").addEventListener("click", saveSecurityKataDraft);
  $("#secKataSubmitReview").addEventListener("click", submitSecurityKataForReview);
  $("#secKataReject").addEventListener("click", rejectSecurityKataDraft);
  $("#secKataPublish").addEventListener("click", publishSecurityKataDraft);
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
  void loadTpotView(state.threatView || "dashboard");
  void loadSenseiStats();
}

// The Resumen used to count the *local draft* (three invented users, sample dojos, sample banks) as if they were
// live figures. It now reads exact counts from the database and says so when it cannot.
const overview = { dojos: null, items: null, users: null, error: false, loading: true, dojoRows: [] };

async function countRows(table, filter = "") {
  const res = await fetch(`/api/rest/v1/${table}?select=id${filter}&limit=1`, { headers: { Prefer: "count=exact" } });
  if (!res.ok) throw new Error(`${res.status}`);
  const range = res.headers.get("content-range") || "";
  const total = Number(range.split("/")[1]);
  if (!Number.isFinite(total)) throw new Error("sin recuento");
  return total;
}

async function loadOverviewMetrics() {
  overview.loading = true;
  overview.error = false;
  renderMetrics();
  try {
    const [dojoRows, questions, cases, users] = await Promise.all([
      supabaseRest("learning_dojos?select=id,rank,title,belt,exam_code&order=rank.asc"),
      countRows("learning_items", "&kind=eq.question"),
      countRows("learning_items", "&kind=eq.case"),
      countRows("users"),
    ]);
    overview.dojoRows = Array.isArray(dojoRows) ? dojoRows : [];
    overview.dojos = overview.dojoRows.length;
    overview.items = { questions, cases };
    overview.users = users;
  } catch {
    overview.error = true;
  } finally {
    overview.loading = false;
    renderMetrics();
    renderProgression();
  }
}

function renderMetrics() {
  const show = (value) => (overview.loading ? "…" : value === null || overview.error ? "—" : Number(value).toLocaleString("es-EC"));
  $("#metricDojos").textContent = show(overview.dojos);
  $("#metricQuestions").textContent = show(overview.items ? overview.items.questions + overview.items.cases : null);
  $("#metricUsers").textContent = show(overview.users);
  $("#metricAds").textContent = String(state.campaigns.filter((campaign) => campaign.active).length);
  $("#metricGrid").setAttribute("aria-busy", String(overview.loading));
  $("#metricNote").textContent = overview.loading
    ? "Cargando datos reales…"
    : overview.error
      ? "No se pudieron leer los datos reales. Las cifras con “—” no están disponibles; recarga la página o revisa la conexión."
      : `Datos de la base de datos en vivo: ${overview.items.questions.toLocaleString("es-EC")} preguntas de práctica y ${overview.items.cases.toLocaleString("es-EC")} casos de kata.`;
}

function renderProgression() {
  // Resumen: the real ladder (one row per published dojo). The old rows showed invented "percent" weights that
  // nothing in the product uses; the real rule is: answer the 30 practice questions, then pass the 5-case kata with 4/5.
  const beltColors = { blanco: "#eeeeee", amarillo: "#f5c518", naranja: "#f97316", verde: "#22c55e", azul: "#3b82f6", marron: "#8b5a2b", negro: "#111827" };
  const rows = overview.dojoRows;
  $("#progressionPreview").innerHTML = rows.length
    ? `<p class="muted">Cada cinturón se gana respondiendo las 30 preguntas de práctica del dojo y aprobando su kata de 5 casos con al menos 4 aciertos (80 %).</p>` + rows.map((dojo) => `
    <div class="progress-row">
      <span class="belt-chip" style="background:${beltColors[dojo.belt] || "#94a3b8"}; color:${dojo.belt === "negro" ? "#fff" : "#111827"}">${esc(dojo.belt)}</span>
      <div>
        <strong>${esc(dojo.title)}</strong>
        <div class="muted">Kata: ${esc(dojo.exam_code)}</div>
      </div>
    </div>`).join("")
    : `<p class="muted">${overview.loading ? "Cargando dojos…" : "No se pudo leer la lista de dojos."}</p>`;

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
  const now = new Date().toISOString();

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
    createdAt: now,
    // Manual questions start out already "aprobada" — stamp the approval
    // date at creation instead of leaving it blank until someone re-saves.
    approvedAt: now,
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
    createdAt: now,
    approvedAt: null,
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
      <label>
        Respuesta correcta
        <textarea data-field="answer" rows="2">${esc(question.answer)}</textarea>
      </label>
      <div class="muted small">Explicación simple: ${esc(explainText(question.answer))}</div>
      <label>
        Explicacion
        <textarea data-field="explanation" rows="2">${esc(question.explanation)}</textarea>
      </label>
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
      <div class="question-dates muted small">
        Generada: ${question.createdAt ? new Date(question.createdAt).toLocaleString("es-EC") : "Sin fecha"}
        ${question.approvedAt ? ` · Aprobada: ${new Date(question.approvedAt).toLocaleString("es-EC")}` : ""}
      </div>
    </div>
  `;
}

async function saveQuestionsFromForm() {
  const bank = state.questionsByDojo[state.selectedDojoId] || [];
  $$(".question-editor").forEach((editor) => {
    const question = bank.find((item) => item.id === editor.dataset.questionId);
    if (!question) return;
    const wasApproved = question.status === "aprobada";
    editor.querySelectorAll("[data-field]").forEach((field) => {
      const key = field.dataset.field;
      question[key] = key === "difficulty" ? Number(field.value) : field.value;
    });
    if (!question.createdAt) question.createdAt = new Date().toISOString();
    if (question.status === "aprobada" && !wasApproved) {
      question.approvedAt = new Date().toISOString();
    }
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
        <label class="ai-provider-name">
          IA ${index + 1}
          <input value="${esc(provider.name)}" data-ai-index="${index}" data-field="name" placeholder="Nombre de la IA" />
        </label>
        <div class="ai-provider-meta">
          <label class="ai-provider-meta-field">
            Timeout ms
            <input type="number" value="${provider.timeoutMs}" data-ai-index="${index}" data-field="timeoutMs" />
          </label>
          <label class="ai-provider-meta-field">
            Orden
            <input type="number" value="${provider.order}" data-ai-index="${index}" data-field="order" />
          </label>
          <label class="ai-provider-meta-field ai-provider-key-field">
            API Key
            <span class="ai-provider-key-row">
              <input
                type="password"
                class="ai-provider-key-input"
                value="${provider.hasKey ? MASKED_KEY_PLACEHOLDER : ""}"
                placeholder="Sin clave"
                title="Clave de API (oculta). Escribe una nueva para reemplazarla."
                autocomplete="off"
                data-ai-index="${index}"
                data-field="apiKey"
              />
              <button type="button" class="btn secondary small ai-provider-key-save" data-ai-index="${index}">Guardar</button>
            </span>
          </label>
        </div>
      </div>
    `).join("");

  $$("input[data-ai-index]").forEach((input) => {
    if (input.dataset.field === "apiKey") return;
    input.addEventListener("input", () => {
      const provider = state.aiProviders[Number(input.dataset.aiIndex)];
      const field = input.dataset.field;
      provider[field] = field === "name" ? input.value : Number(input.value);
      persist("Cadena IA actualizada.");
    });
  });

  // The key never lives in local state / localStorage in plain text — it
  // goes straight to the same Vault-backed save-provider-key function the
  // real news-agent provider chain uses, keyed by a slug of the IA's name.
  // These three default rows (DeepSeek/Kimi/Claude) slug to the exact
  // provider_key values the real ai_providers table already uses, so
  // saving here updates the same underlying credential, not a separate one.
  $$(".ai-provider-key-input").forEach((input) => {
    input.addEventListener("focus", () => {
      if (input.value === MASKED_KEY_PLACEHOLDER) input.value = "";
    });
    input.addEventListener("blur", () => {
      const provider = state.aiProviders[Number(input.dataset.aiIndex)];
      if (!input.value && provider.hasKey) input.value = MASKED_KEY_PLACEHOLDER;
    });
  });
  $$(".ai-provider-key-save").forEach((button) => {
    button.addEventListener("click", () => {
      const index = Number(button.dataset.aiIndex);
      const input = $$(".ai-provider-key-input").find((el) => Number(el.dataset.aiIndex) === index);
      void saveAiProviderKeyInline(index, input);
    });
  });

  $("#generatorPrompt").value = "Genera 30 preguntas por dojo, intercaladas con 20 manuales. Aumenta dificultad gradualmente. Devuelve JSON con pregunta, opciones, respuesta, explicacion, dificultad, control ISO y sugerencia de kata.";
  $("#auditorPrompt").value = "Audita y reformula preguntas generadas. Valida que el tema sea ciberseguridad, que la respuesta sea correcta, que la explicacion sea clara y que la dificultad coincida con el cinturon.";
}

function slugifyProviderName(name) {
  const slug = name
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "ia";
}

async function saveAiProviderKeyInline(index, inputEl) {
  const provider = state.aiProviders[index];
  const value = inputEl.value;
  if (value === MASKED_KEY_PLACEHOLDER) {
    notify("Escribe una clave nueva para reemplazarla (no cambio).");
    return;
  }
  if (!value.trim()) {
    notify("Escribe la clave antes de guardar.");
    return;
  }

  const providerKey = slugifyProviderName(provider.name);
  // Only send provider_type/model_name defaults when this slug isn't one of
  // the real, already-configured providers — otherwise this would silently
  // overwrite a correctly configured provider (e.g. Claude's real
  // provider_type is "messages", not the generic default below).
  const knownProvider = state.newsProviders.find((p) => p.provider_key === providerKey);
  const payload = { provider_key: providerKey, api_key: value.trim() };
  if (!knownProvider) {
    payload.label = provider.name;
    payload.provider_type = "chat_completion";
    payload.model_name = provider.name;
  }

  inputEl.disabled = true;
  try {
    await supabaseFunctionInvoke("save-provider-key", payload);
    provider.hasKey = true;
    persist("Clave guardada de forma cifrada.");
    inputEl.value = MASKED_KEY_PLACEHOLDER;
    void loadNewsProvidersFromSupabase();
  } catch (error) {
    console.warn("No se pudo guardar la clave:", error);
    notify(`No se pudo guardar la clave: ${error.message}`);
  } finally {
    inputEl.disabled = false;
  }
}

function renderNewsAgent() {
  $("#newsAgentActive").checked = Boolean(state.newsAgent.active);
  $("#newsAgentTime").value = state.newsAgent.runTime;
  $("#newsAgentPrompt").value = state.newsAgent.prompt;
  $("#newsAgentLastRun").textContent = state.newsAgent.lastRun;
}

async function loadNewsAgentConfigFromSupabase() {
  try {
    const rows = await supabaseRest("agent_configs?select=*&agent_code=eq.ciber-dojo-news-agent");
    const config = Array.isArray(rows) && rows[0] ? rows[0] : null;
    if (config) {
      state.newsAgent.id = config.id;
      state.newsAgent.active = Boolean(config.enabled);
      state.newsAgent.runTime = (config.trigger_time || "07:30:00").slice(0, 5);
      state.newsAgent.prompt = config.prompt_template || "";
      state.newsAgent.lastRun = config.last_run_at ? new Date(config.last_run_at).toLocaleString("es-EC") : "Pendiente";
      void loadNewsChainFromSupabase();
    }
    renderNewsAgent();
  } catch (error) {
    console.warn("No se pudo cargar la configuracion del agente de noticias:", error);
  }
}

async function saveNewsAgentFromForm() {
  const statusEl = $("#newsAgentSaveStatus");
  state.newsAgent.active = $("#newsAgentActive").checked;
  state.newsAgent.runTime = $("#newsAgentTime").value || "07:30";
  state.newsAgent.prompt = $("#newsAgentPrompt").value.trim();

  if (!state.newsAgent.id) {
    statusEl.textContent = "No se encontro la configuracion del agente en Supabase.";
    return;
  }

  try {
    await supabaseRest(`agent_configs?id=eq.${state.newsAgent.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        enabled: state.newsAgent.active,
        trigger_time: `${state.newsAgent.runTime}:00`,
        prompt_template: state.newsAgent.prompt,
      }),
    });
    statusEl.textContent = "Configuracion guardada.";
    notify("Agente de noticias configurado.");
  } catch (error) {
    console.warn("No se pudo guardar la configuracion del agente de noticias:", error);
    statusEl.textContent = "No se pudo guardar. Intenta de nuevo.";
  }
}

async function loadNewsSourcesFromSupabase() {
  try {
    const rows = await supabaseRest("cyber_news_sources?select=*&order=priority.asc");
    state.newsSources = Array.isArray(rows) ? rows : [];
    renderNewsSources();
  } catch (error) {
    console.warn("No se pudieron cargar las fuentes de noticias:", error);
  }
}

function renderNewsSources() {
  const list = $("#newsSourceList");
  if (state.newsSources.length === 0) {
    list.innerHTML = `<p class="muted">No hay fuentes configuradas todavia.</p>`;
    return;
  }

  list.innerHTML = state.newsSources.map((source) => `
    <div class="news-source-row" data-id="${esc(source.id)}">
      <label class="check-row">
        <input type="checkbox" class="news-source-toggle" ${source.enabled ? "checked" : ""} />
      </label>
      <div class="news-source-info">
        <strong>${esc(source.name)}</strong>
        <span class="muted">${esc(source.url)}</span>
      </div>
      <button type="button" class="btn danger small news-source-delete">Eliminar</button>
    </div>
  `).join("");

  [...list.querySelectorAll(".news-source-toggle")].forEach((checkbox) => {
    checkbox.addEventListener("change", (event) => {
      const id = event.target.closest(".news-source-row").dataset.id;
      void toggleNewsSource(id, event.target.checked);
    });
  });
  [...list.querySelectorAll(".news-source-delete")].forEach((button) => {
    button.addEventListener("click", (event) => {
      const id = event.target.closest(".news-source-row").dataset.id;
      void deleteNewsSource(id);
    });
  });
}

async function addNewsSource() {
  const name = $("#newsSourceName").value.trim();
  const url = $("#newsSourceUrl").value.trim();
  if (!name || !url) {
    notify("Completa nombre y URL de la fuente.");
    return;
  }

  try {
    await supabaseRest("cyber_news_sources", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ name, url, priority: (state.newsSources.length + 1) * 10 }),
    });
    $("#newsSourceName").value = "";
    $("#newsSourceUrl").value = "";
    await loadNewsSourcesFromSupabase();
    notify("Fuente agregada.");
  } catch (error) {
    console.warn("No se pudo agregar la fuente:", error);
    notify("No se pudo agregar la fuente. Verifica que la URL no este repetida.");
  }
}

async function toggleNewsSource(id, enabled) {
  try {
    await supabaseRest(`cyber_news_sources?id=eq.${id}`, {
      method: "PATCH",
      body: JSON.stringify({ enabled }),
    });
    const source = state.newsSources.find((item) => item.id === id);
    if (source) source.enabled = enabled;
  } catch (error) {
    console.warn("No se pudo actualizar la fuente:", error);
    notify("No se pudo actualizar la fuente.");
    await loadNewsSourcesFromSupabase();
  }
}

async function deleteNewsSource(id) {
  if (!window.confirm("¿Eliminar esta fuente?")) return;
  try {
    await supabaseRest(`cyber_news_sources?id=eq.${id}`, { method: "DELETE" });
    await loadNewsSourcesFromSupabase();
  } catch (error) {
    console.warn("No se pudo eliminar la fuente:", error);
    notify("No se pudo eliminar la fuente.");
  }
}

async function loadNewsProvidersFromSupabase() {
  try {
    const rows = await supabaseRest("ai_providers?select=*&order=label.asc");
    state.newsProviders = Array.isArray(rows) ? rows : [];
    renderNewsProviderList();
    renderNewsChain();

    // Keep the local/draft "Configuracion de IA" panel's key indicators
    // honest: if a row's name slugs to a real provider_key that already has
    // a Vault key, show it as masked there too instead of blank.
    const byKey = new Map(state.newsProviders.map((p) => [p.provider_key, p]));
    let changed = false;
    state.aiProviders.forEach((provider) => {
      const real = byKey.get(slugifyProviderName(provider.name));
      const hasKey = Boolean(real && real.api_key_secret_id);
      if (provider.hasKey !== hasKey) {
        provider.hasKey = hasKey;
        changed = true;
      }
    });
    if (changed && $("#aiProviders")) renderAiProviders();
  } catch (error) {
    console.warn("No se pudieron cargar los proveedores de IA:", error);
  }
}

async function loadNewsChainFromSupabase() {
  if (!state.newsAgent.id) return;
  try {
    const rows = await supabaseRest(
      `agent_provider_assignments?select=*&agent_config_id=eq.${state.newsAgent.id}&order=priority.asc`
    );
    state.newsChain = Array.isArray(rows) ? rows : [];
    renderNewsChain();
  } catch (error) {
    console.warn("No se pudo cargar la cadena de proveedores:", error);
  }
}

function renderNewsProviderList() {
  const container = $("#newsProviderList");
  if (state.newsProviders.length === 0) {
    container.innerHTML = `<p class="muted">No hay proveedores de IA configurados todavia.</p>`;
    return;
  }

  container.innerHTML = state.newsProviders.map((provider) => `
    <div class="news-provider-row" data-key="${esc(provider.provider_key)}">
      <div class="news-provider-head">
        <label class="check-row">
          <input type="checkbox" class="news-provider-toggle" ${provider.active ? "checked" : ""} />
        </label>
        <div class="news-provider-info">
          <strong>${esc(provider.label)} <span class="muted">(${esc(provider.provider_key)})</span></strong>
          <span class="muted">${esc(provider.provider_type)} · ${esc(provider.model_name)} · timeout ${esc(String(provider.default_timeout_seconds ?? 30))}s</span>
        </div>
        <div class="news-provider-head-actions">
          <button type="button" class="btn secondary small news-provider-edit">Editar</button>
          <button type="button" class="btn danger small news-provider-delete">Eliminar</button>
        </div>
      </div>
      <label class="news-provider-key-field">
        Clave de API
        <span class="news-provider-key-row">
          <input
            type="password"
            class="news-provider-key-input"
            value="${provider.api_key_secret_id ? MASKED_KEY_PLACEHOLDER : ""}"
            placeholder="Sin clave guardada"
            title="Clave de API (oculta). Escribe una nueva para reemplazarla."
            autocomplete="off"
          />
          <button type="button" class="btn secondary small news-provider-key-save">Guardar clave</button>
        </span>
      </label>
    </div>
  `).join("");

  [...container.querySelectorAll(".news-provider-toggle")].forEach((checkbox) => {
    checkbox.addEventListener("change", (event) => {
      const key = event.target.closest(".news-provider-row").dataset.key;
      void toggleNewsProviderActive(key, event.target.checked);
    });
  });
  [...container.querySelectorAll(".news-provider-key-input")].forEach((input) => {
    // Clicking into the masked placeholder to type a real key shouldn't
    // start with the dots already selected-and-ready-to-overwrite being
    // ambiguous with "the key starts with these dots" — clear it on focus
    // so whatever the admin types is unambiguously the new value, and
    // restore the mask on blur if they leave it untouched.
    input.addEventListener("focus", () => {
      if (input.value === MASKED_KEY_PLACEHOLDER) input.value = "";
    });
    input.addEventListener("blur", () => {
      const key = input.closest(".news-provider-row").dataset.key;
      const provider = state.newsProviders.find((p) => p.provider_key === key);
      if (!input.value && provider && provider.api_key_secret_id) input.value = MASKED_KEY_PLACEHOLDER;
    });
  });
  [...container.querySelectorAll(".news-provider-key-save")].forEach((button) => {
    button.addEventListener("click", (event) => {
      const row = event.target.closest(".news-provider-row");
      const key = row.dataset.key;
      const input = row.querySelector(".news-provider-key-input");
      void saveNewsProviderKeyInline(key, input);
    });
  });
  [...container.querySelectorAll(".news-provider-edit")].forEach((button) => {
    button.addEventListener("click", (event) => {
      const key = event.target.closest(".news-provider-row").dataset.key;
      openNewsProviderForm(key);
    });
  });
  [...container.querySelectorAll(".news-provider-delete")].forEach((button) => {
    button.addEventListener("click", (event) => {
      const key = event.target.closest(".news-provider-row").dataset.key;
      void deleteNewsProvider(key);
    });
  });
}

async function saveNewsProviderKeyInline(providerKey, inputEl) {
  const value = inputEl.value;
  if (value === MASKED_KEY_PLACEHOLDER) {
    notify("Escribe una clave nueva para reemplazarla (no cambio).");
    return;
  }
  if (!value.trim()) {
    notify("Escribe la clave antes de guardar.");
    return;
  }

  inputEl.disabled = true;
  try {
    await supabaseFunctionInvoke("save-provider-key", { provider_key: providerKey, api_key: value.trim() });
    await loadNewsProvidersFromSupabase();
    notify("Clave guardada de forma cifrada.");
  } catch (error) {
    console.warn("No se pudo guardar la clave:", error);
    notify(`No se pudo guardar la clave: ${error.message}`);
    inputEl.disabled = false;
  }
}

async function toggleNewsProviderActive(providerKey, active) {
  try {
    await supabaseRest(`ai_providers?provider_key=eq.${encodeURIComponent(providerKey)}`, {
      method: "PATCH",
      body: JSON.stringify({ active }),
    });
    const provider = state.newsProviders.find((p) => p.provider_key === providerKey);
    if (provider) provider.active = active;
  } catch (error) {
    console.warn("No se pudo actualizar el proveedor:", error);
    notify("No se pudo actualizar el proveedor.");
    await loadNewsProvidersFromSupabase();
  }
}

async function deleteNewsProvider(providerKey) {
  if (!window.confirm(`¿Eliminar el proveedor "${providerKey}"? Tambien se quitara de cualquier cadena donde este asignado.`)) return;
  try {
    await supabaseRest(`ai_providers?provider_key=eq.${encodeURIComponent(providerKey)}`, { method: "DELETE" });
    await loadNewsProvidersFromSupabase();
    await loadNewsChainFromSupabase();
    notify("Proveedor eliminado.");
  } catch (error) {
    console.warn("No se pudo eliminar el proveedor:", error);
    notify("No se pudo eliminar el proveedor.");
  }
}

function openNewsProviderForm(providerKey) {
  state.newsProviderEditingKey = providerKey;
  const form = $("#newsProviderForm");
  const provider = providerKey ? state.newsProviders.find((p) => p.provider_key === providerKey) : null;

  $("#npKey").value = provider ? provider.provider_key : "";
  $("#npKey").disabled = Boolean(provider);
  $("#npLabel").value = provider ? provider.label : "";
  $("#npType").value = provider ? provider.provider_type : "chat_completion";
  $("#npModel").value = provider ? provider.model_name : "";
  $("#npBaseUrl").value = provider && provider.base_url ? provider.base_url : "";
  $("#npTimeout").value = provider ? provider.default_timeout_seconds ?? 30 : 30;
  $("#npActive").checked = provider ? Boolean(provider.active) : true;
  $("#npApiKey").value = "";
  $("#npApiKey").placeholder = provider && provider.api_key_secret_id ? "Dejar vacio para no cambiar la clave actual" : "sk-...";
  $("#newsProviderFormStatus").textContent = "";
  form.classList.remove("hidden");
  form.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function closeNewsProviderForm() {
  state.newsProviderEditingKey = undefined;
  $("#newsProviderForm").classList.add("hidden");
}

async function saveNewsProviderForm() {
  const statusEl = $("#newsProviderFormStatus");
  const providerKey = $("#npKey").value.trim();
  const label = $("#npLabel").value.trim();
  const modelName = $("#npModel").value.trim();
  const apiKey = $("#npApiKey").value.trim();
  const isNew = state.newsProviderEditingKey === null;

  if (!providerKey || !label || !modelName) {
    statusEl.textContent = "Completa identificador, nombre y modelo.";
    return;
  }
  if (isNew && !apiKey) {
    statusEl.textContent = "Un proveedor nuevo necesita una clave de API.";
    return;
  }

  statusEl.textContent = "Guardando...";
  try {
    const payload = {
      provider_key: providerKey,
      label,
      provider_type: $("#npType").value,
      model_name: modelName,
      base_url: $("#npBaseUrl").value.trim() || undefined,
      default_timeout_seconds: Number($("#npTimeout").value) || 30,
      active: $("#npActive").checked,
    };
    if (apiKey) payload.api_key = apiKey;

    await supabaseFunctionInvoke("save-provider-key", payload);
    closeNewsProviderForm();
    await loadNewsProvidersFromSupabase();
    notify("Proveedor guardado.");
  } catch (error) {
    console.warn("No se pudo guardar el proveedor:", error);
    statusEl.textContent = `No se pudo guardar: ${error.message}`;
  }
}

function renderNewsChain() {
  const container = $("#newsProviderChain");
  const providerByKey = new Map(state.newsProviders.map((p) => [p.provider_key, p]));

  if (!state.newsAgent.id) {
    container.innerHTML = `<p class="muted">Guarda la configuracion del agente primero.</p>`;
  } else if (state.newsChain.length === 0) {
    container.innerHTML = `<p class="muted">No hay proveedores asignados a la ejecucion automatica todavia.</p>`;
  } else {
    container.innerHTML = state.newsChain.map((assignment) => {
      const provider = providerByKey.get(assignment.provider_key);
      return `
      <div class="news-chain-row" data-id="${esc(assignment.id)}">
        <input type="number" class="news-chain-priority" min="1" value="${esc(String(assignment.priority))}" title="Prioridad (menor = primero)" />
        <div class="news-chain-info">
          <strong>${esc(provider ? provider.label : assignment.provider_key)}</strong>
          <span class="muted">${provider ? (provider.api_key_secret_id ? "Clave guardada" : "Sin clave guardada (fallara)") : "Proveedor no encontrado"}</span>
        </div>
        <div class="news-provider-actions">
          <label class="check-row">
            <input type="checkbox" class="news-chain-toggle" ${assignment.active ? "checked" : ""} />
            Activo
          </label>
          <button type="button" class="btn danger small news-chain-remove">Quitar</button>
        </div>
      </div>
    `;
    }).join("");
  }

  const select = $("#newsChainAddSelect");
  const assignedKeys = new Set(state.newsChain.map((a) => a.provider_key));
  const available = state.newsProviders.filter((p) => !assignedKeys.has(p.provider_key));
  select.innerHTML = available.length > 0
    ? available.map((p) => `<option value="${esc(p.provider_key)}">${esc(p.label)}</option>`).join("")
    : `<option value="">No hay proveedores disponibles</option>`;

  [...container.querySelectorAll(".news-chain-priority")].forEach((input) => {
    input.addEventListener("change", (event) => {
      const id = event.target.closest(".news-chain-row").dataset.id;
      const priority = Number(event.target.value) || 1;
      void updateNewsChainAssignment(id, { priority });
    });
  });
  [...container.querySelectorAll(".news-chain-toggle")].forEach((checkbox) => {
    checkbox.addEventListener("change", (event) => {
      const id = event.target.closest(".news-chain-row").dataset.id;
      void updateNewsChainAssignment(id, { active: event.target.checked });
    });
  });
  [...container.querySelectorAll(".news-chain-remove")].forEach((button) => {
    button.addEventListener("click", (event) => {
      const id = event.target.closest(".news-chain-row").dataset.id;
      void removeNewsChainAssignment(id);
    });
  });
}

async function updateNewsChainAssignment(id, patch) {
  try {
    await supabaseRest(`agent_provider_assignments?id=eq.${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
    await loadNewsChainFromSupabase();
  } catch (error) {
    console.warn("No se pudo actualizar la cadena:", error);
    notify("No se pudo actualizar la cadena de proveedores.");
    await loadNewsChainFromSupabase();
  }
}

async function removeNewsChainAssignment(id) {
  if (!window.confirm("¿Quitar este proveedor de la cadena automatica?")) return;
  try {
    await supabaseRest(`agent_provider_assignments?id=eq.${id}`, { method: "DELETE" });
    await loadNewsChainFromSupabase();
  } catch (error) {
    console.warn("No se pudo quitar el proveedor de la cadena:", error);
    notify("No se pudo quitar el proveedor de la cadena.");
  }
}

async function addNewsChainAssignment() {
  const providerKey = $("#newsChainAddSelect").value;
  if (!providerKey) {
    notify("No hay proveedores disponibles para agregar.");
    return;
  }
  if (!state.newsAgent.id) {
    notify("Guarda la configuracion del agente antes de armar la cadena.");
    return;
  }
  const nextPriority = state.newsChain.length > 0 ? Math.max(...state.newsChain.map((a) => a.priority)) + 1 : 1;
  try {
    await supabaseRest("agent_provider_assignments", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        agent_config_id: state.newsAgent.id,
        provider_key: providerKey,
        priority: nextPriority,
        active: true,
      }),
    });
    await loadNewsChainFromSupabase();
    notify("Proveedor agregado a la cadena.");
  } catch (error) {
    console.warn("No se pudo agregar a la cadena:", error);
    notify("No se pudo agregar el proveedor a la cadena.");
  }
}

async function loadNewsRunsFromSupabase() {
  try {
    const rows = await supabaseRest(
      "agent_runs?select=*,agent_configs!inner(agent_code)&agent_configs.agent_code=eq.ciber-dojo-news-agent&order=started_at.desc&limit=20"
    );
    state.newsRuns = Array.isArray(rows) ? rows : [];
    renderNewsRunLog();
  } catch (error) {
    console.warn("No se pudo cargar el historial del agente de noticias:", error);
  }
}

const NEWS_RUN_STATUS_LABEL = { running: "En curso", completed: "Completado", failed: "Error", partial: "Parcial (revisar)" };
const NEWS_RUN_STATUS_BADGE = { running: "audit", completed: "ai", failed: "danger", partial: "audit" };
const NEWS_RUN_TRIGGER_LABEL = { pg_cron: "automatico (pg_cron)", quiz_generator: "manual (quiz-generator)", "central-admin": "manual (panel admin)" };

function renderNewsRunLog() {
  const container = $("#newsRunLog");
  if (state.newsRuns.length === 0) {
    container.innerHTML = `<p class="muted">Todavia no se ha ejecutado el agente.</p>`;
    return;
  }

  container.innerHTML = state.newsRuns.map((run, index) => {
    const attempts = run.output_payload && Array.isArray(run.output_payload.attempts) ? run.output_payload.attempts : null;
    const rowId = `newsRunAttempts-${index}`;
    return `
    <div class="progress-row">
      <div class="news-run-head">
        <span class="badge ${NEWS_RUN_STATUS_BADGE[run.status] || "audit"}">${NEWS_RUN_STATUS_LABEL[run.status] || run.status}</span>
        <strong>${esc(new Date(run.started_at).toLocaleString("es-EC"))}</strong>
        <span class="muted">disparado por ${esc(NEWS_RUN_TRIGGER_LABEL[run.triggered_by] || run.triggered_by || "desconocido")}</span>
      </div>
      ${run.summary ? `<p>${esc(run.summary)}</p>` : ""}
      ${run.error_message ? `<p class="news-run-error">${esc(run.error_message)}</p>` : ""}
      ${attempts && attempts.length > 0 ? `
        <button type="button" class="news-run-toggle" data-target="${rowId}">Ver intentos por proveedor (${attempts.length})</button>
        <div id="${rowId}" class="news-run-attempts hidden">
          ${attempts.map((a) => `
            <div class="news-run-attempt-row">
              <span class="badge ${a.status === "success" ? "ai" : a.status === "timeout" ? "audit" : "danger"}">${esc(a.provider_key)}</span>
              <span class="muted">${esc(a.status)} · ${esc(String(a.latency_ms))}ms</span>
              ${a.error ? `<span class="news-run-error">${esc(a.error)}</span>` : ""}
            </div>
          `).join("")}
        </div>
      ` : ""}
    </div>
  `;
  }).join("");

  [...container.querySelectorAll(".news-run-toggle")].forEach((button) => {
    button.addEventListener("click", () => {
      const target = $(`#${button.dataset.target}`);
      target.classList.toggle("hidden");
    });
  });
}

async function loadNewsGeneratedFromSupabase() {
  try {
    const rows = await supabaseRest(
      "questions?select=id,dojo_id,question_text,answer_text,explanation,kata_label,difficulty,audit_status,active,source_url,source_title,extracted_at&source_type=eq.news_generated&order=extracted_at.desc&limit=50"
    );
    state.newsGenerated = Array.isArray(rows) ? rows : [];
    renderNewsGeneratedReport();
  } catch (error) {
    console.warn("No se pudo cargar el reporte de contenido generado:", error);
  }
}

function renderNewsGeneratedReport() {
  const container = $("#newsGeneratedReport");
  if (state.newsGenerated.length === 0) {
    container.innerHTML = `<p class="muted">Todavia no hay preguntas ni katas generadas por el agente.</p>`;
    return;
  }

  container.innerHTML = state.newsGenerated.map((item) => `
    <div class="news-generated-row" data-id="${esc(item.id)}">
      <div class="news-generated-head">
        <span class="badge ${item.audit_status === "approved" ? "ai" : item.audit_status === "rejected" ? "danger" : "audit"}">${item.audit_status === "approved" ? "Aprobada" : item.audit_status === "rejected" ? "Rechazada" : "Pendiente"}</span>
        <span class="muted">${item.extracted_at ? new Date(item.extracted_at).toLocaleString("es-EC") : "Sin fecha"}</span>
      </div>
      <strong>${esc(item.question_text)}</strong>
      <p class="muted">Respuesta: ${esc(item.answer_text || "")}</p>
      <p class="muted">Kata: ${esc(item.kata_label || "-")} · Dojo: ${esc(item.dojo_id || "-")} · Dificultad: ${esc(String(item.difficulty || 1))}</p>
      ${item.source_url ? `<p class="muted">Fuente: <a href="${esc(item.source_url)}" target="_blank" rel="noopener noreferrer">${esc(item.source_title || item.source_url)}</a></p>` : ""}
      ${item.audit_status === "pending" ? `
        <div class="modal-actions">
          <button type="button" class="btn secondary small news-generated-approve">Aprobar y activar</button>
          <button type="button" class="btn danger small news-generated-reject">Rechazar</button>
        </div>
      ` : ""}
    </div>
  `).join("");

  [...container.querySelectorAll(".news-generated-approve")].forEach((button) => {
    button.addEventListener("click", (event) => {
      const id = event.target.closest(".news-generated-row").dataset.id;
      void reviewNewsGenerated(id, "approved");
    });
  });
  [...container.querySelectorAll(".news-generated-reject")].forEach((button) => {
    button.addEventListener("click", (event) => {
      const id = event.target.closest(".news-generated-row").dataset.id;
      void reviewNewsGenerated(id, "rejected");
    });
  });
}

async function reviewNewsGenerated(id, decision) {
  try {
    await supabaseRest(`questions?id=eq.${id}`, {
      method: "PATCH",
      body: JSON.stringify({ audit_status: decision, active: decision === "approved", reviewed_at: new Date().toISOString() }),
    });
    await loadNewsGeneratedFromSupabase();
    notify(decision === "approved" ? "Pregunta aprobada y activada." : "Pregunta rechazada.");
  } catch (error) {
    console.warn("No se pudo actualizar la revision:", error);
    notify("No se pudo guardar la revision.");
  }
}

async function supabaseFunctionInvoke(name, body) {
  const response = await fetch(`/api/functions/v1/${name}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `${response.status}`);
  return data;
}

async function testNewsAgent() {
  await executeNewsAgent(true);
}

async function runNewsAgent() {
  if (!window.confirm("Esto generara preguntas y katas reales pendientes de revision. ¿Continuar?")) return;
  await executeNewsAgent(false);
}

// js.puter.com/v2 is a mutable third-party script. It used to run on every page load, in the same origin as the
// service-role proxy; now it is fetched only when the news agent is actually run.
let puterLoading = null;
function ensurePuter() {
  if (typeof puter !== "undefined" && puter.ai && puter.ai.chat) return Promise.resolve(true);
  if (!puterLoading) {
    puterLoading = new Promise((resolve) => {
      const script = document.createElement("script");
      script.src = "https://js.puter.com/v2/";
      script.onload = () => resolve(typeof puter !== "undefined" && Boolean(puter.ai && puter.ai.chat));
      script.onerror = () => { puterLoading = null; resolve(false); };
      document.head.appendChild(script);
    });
  }
  return puterLoading;
}

async function executeNewsAgent(dryRun) {
  if (state.newsAgentBusy) return;
  if (!(await ensurePuter())) {
    notify("Puter.js no está disponible. Verifica tu conexión e inténtalo de nuevo.");
    return;
  }

  state.newsAgentBusy = true;
  const runButton = dryRun ? $("#testNewsAgent") : $("#runNewsAgent");
  const originalLabel = runButton.textContent;
  runButton.disabled = true;
  runButton.textContent = "Buscando noticias...";

  try {
    const prepared = await supabaseFunctionInvoke("run-news-agent", {
      action: "prepare",
      dry_run: dryRun,
      triggered_by: state.actor || "central-admin",
    });

    runButton.textContent = "Generando con IA...";
    let aiContent = "";
    let aiError = null;
    try {
      const response = await puter.ai.chat(
        `${prepared.prompt_template}\n\nDatos de entrada (JSON): ${JSON.stringify(prepared.ai_payload)}\n\nResponde unicamente con JSON valido (sin texto adicional, sin bloques de codigo) siguiendo instructions.response_format.`,
        { model: "gpt-5.6-luna" }
      );
      aiContent = typeof response === "string" ? response : (response?.message?.content ?? response?.text ?? JSON.stringify(response));
    } catch (error) {
      aiError = (error && error.message) || String(error);
    }

    runButton.textContent = "Guardando resultado...";
    const completed = await supabaseFunctionInvoke("run-news-agent", {
      action: "complete",
      run_id: prepared.run_id,
      dry_run: dryRun,
      ai_content: aiContent,
      ai_error: aiError,
      provider_key: "puter-gpt-5.6-luna",
      fetched_sources: prepared.fetched_sources,
    });

    if (completed.error) {
      notify(`El agente fallo: ${completed.error}`);
    } else {
      notify(completed.summary || "Agente ejecutado.");
    }

    await Promise.all([loadNewsAgentConfigFromSupabase(), loadNewsRunsFromSupabase(), loadNewsGeneratedFromSupabase()]);
  } catch (error) {
    console.error("Error ejecutando el agente de noticias:", error);
    notify(`No se pudo ejecutar el agente: ${error.message || error}`);
    await loadNewsRunsFromSupabase();
  } finally {
    state.newsAgentBusy = false;
    runButton.disabled = false;
    runButton.textContent = originalLabel;
  }
}

async function uploadManualContentFile(file) {
  const safeExt = (file.name.split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
  const filePath = `manual/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${safeExt}`;

  const response = await fetch(`/api/storage/v1/object/news-agent-uploads/${filePath}`, {
    method: "POST",
    headers: { "Content-Type": file.type || "application/octet-stream" },
    body: file,
  });

  if (!response.ok) {
    throw new Error(`${response.status} ${await response.text()}`);
  }

  return filePath;
}

async function testManualContent() {
  await runManualContent(true);
}

async function generateManualContent() {
  if (!window.confirm("Esto generara preguntas y katas reales pendientes de revision a partir de este contenido. ¿Continuar?")) return;
  await runManualContent(false);
}

async function runManualContent(dryRun) {
  if (state.manualContentBusy) return;

  const sourceName = $("#manualContentSourceName").value.trim();
  const url = $("#manualContentUrl").value.trim();
  const text = $("#manualContentText").value.trim();
  const file = $("#manualContentFile").files[0] || null;
  const statusEl = $("#manualContentStatus");
  const resultEl = $("#manualContentResult");
  resultEl.innerHTML = "";

  if (!text && !file && !url) {
    statusEl.textContent = "Pega texto, pega una URL, o sube un archivo antes de continuar.";
    return;
  }

  state.manualContentBusy = true;
  const testButton = $("#manualContentTest");
  const generateButton = $("#manualContentGenerate");
  testButton.disabled = true;
  generateButton.disabled = true;

  try {
    const sources = [];

    if (file) {
      statusEl.textContent = "Subiendo archivo...";
      const filePath = await uploadManualContentFile(file);
      sources.push({ file_path: filePath, name: sourceName || file.name, url: url || undefined });
    }
    if (text) {
      sources.push({ content: text, name: sourceName || undefined, url: url || sourceName || undefined });
    }
    if (!file && !text && url) {
      sources.push({ url, name: sourceName || undefined });
    }

    statusEl.textContent = dryRun ? "Generando (prueba, no se guarda)..." : "Generando y guardando...";
    const result = await supabaseFunctionInvoke("quiz-generator", { sources, dry_run: dryRun });

    if (result.error) {
      statusEl.textContent = "";
      resultEl.innerHTML = `<p class="news-run-error">${esc(result.error)}</p>`;
    } else if (result.validation_status === "invalid") {
      statusEl.textContent = "";
      resultEl.innerHTML = `
        <p class="news-run-error">${esc(result.summary)}</p>
        <ul>${result.validation_errors.map((e) => `<li class="muted">${esc(e)}</li>`).join("")}</ul>
      `;
    } else {
      statusEl.textContent = "";
      resultEl.innerHTML = `<p>${esc(result.summary)}</p>`;
      if (!dryRun) {
        $("#manualContentText").value = "";
        $("#manualContentFile").value = "";
        $("#manualContentUrl").value = "";
        $("#manualContentSourceName").value = "";
        await Promise.all([loadNewsRunsFromSupabase(), loadNewsGeneratedFromSupabase()]);
      }
    }
  } catch (error) {
    console.error("Error generando contenido manual:", error);
    statusEl.textContent = "";
    resultEl.innerHTML = `<p class="news-run-error">${esc(error.message || String(error))}</p>`;
  } finally {
    state.manualContentBusy = false;
    testButton.disabled = false;
    generateButton.disabled = false;
  }
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

const DOJO_STATUS_TO_SUPABASE = { activo: "active", borrador: "draft", pausado: "paused" };

// questions.dojo_id has a FK to cyber_dojos(id) (migration 007), but this
// panel's dojo list only ever lived in localStorage (addDojo/edits never
// synced) — so saving a question bank for a dojo Supabase had never heard of
// failed the FK constraint with no clue why. Upserting the dojo first closes
// that gap without requiring a separate "sync dojos" step.
async function ensureDojoSyncedToSupabase(dojo) {
  await supabaseRest("cyber_dojos?on_conflict=id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify([{
      id: dojo.id,
      name: dojo.name,
      theme: dojo.theme,
      iso_control: dojo.iso || null,
      status: DOJO_STATUS_TO_SUPABASE[dojo.status] || "draft",
    }]),
  });
}

async function saveQuestionsToSupabase(bank, dojo) {
  try {
    await ensureDojoSyncedToSupabase(dojo);
    const payload = bank.map((question) => questionToSupabase(question, dojo));
    await supabaseRest("questions?on_conflict=id", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(payload),
    });
    notify("Preguntas guardadas en Supabase para Cyber Dojo.");
  } catch (error) {
    console.error("No se pudieron guardar preguntas en Supabase:", error);
    // A toast auto-dismisses in 3.2s — too fast to read a variable-length
    // Postgres/PostgREST error. This path is rare (only on save failure),
    // so the extra interruption of a blocking alert is worth it here to
    // make the real cause visible instead of a generic dead-end message.
    window.alert(`Guardado local listo. Supabase no acepto el banco:\n\n${error.message}`);
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

async function loadTierWeightsFromSupabase() {
  try {
    const rows = await supabaseRest("central_admin_campaign_tier_weights?select=*&order=value_tier.asc");
    if (Array.isArray(rows) && rows.length > 0) state.tierWeights = rows;
    renderTierWeightsForm();
    populateValueTierSelect();
    // Only refresh the tier field itself, not the whole form: a full
    // renderCampaigns() here could overwrite fields the admin is already
    // editing if this load resolves after the initial page load.
    const campaign = getSelectedCampaign();
    if (campaign) $("#adValueTier").value = campaign.value_tier || 1;
    updatePriorityHint();
  } catch (error) {
    console.warn("No se pudieron cargar las prioridades de propaganda:", error);
  }
}

function renderTierWeightsForm() {
  const grid = $("#tierWeightsGrid");
  grid.innerHTML = state.tierWeights.map((tier) => `
    <div class="tier-weights-row" data-tier="${tier.value_tier}">
      <div class="tier-badge">
        <strong>${tier.value_tier}</strong>
        <span>Valor</span>
      </div>
      <label>
        Minimo (USD)
        <input type="number" min="0" class="tier-min" value="${tier.min_usd}" />
      </label>
      <label>
        Maximo (USD)
        <input type="number" min="0" class="tier-max" value="${tier.max_usd ?? ""}" placeholder="Sin tope" />
      </label>
      <label>
        Prioridad (veces mas frecuente)
        <input type="number" min="0.1" step="0.1" class="tier-weight" value="${tier.weight}" />
      </label>
    </div>
  `).join("");
}

function populateValueTierSelect() {
  const select = $("#adValueTier");
  const previous = select.value;
  select.innerHTML = state.tierWeights.map((tier) => {
    const range = tier.max_usd == null
      ? `${tier.min_usd} USD en adelante`
      : `${tier.min_usd} a ${tier.max_usd} USD`;
    return `<option value="${tier.value_tier}">${tier.value_tier} - ${range}</option>`;
  }).join("");
  if (previous) select.value = previous;
  updatePriorityHint();
}

function updatePriorityHint() {
  const hintEl = $("#adPriorityHint");
  const tier = state.tierWeights.find((t) => String(t.value_tier) === $("#adValueTier").value);
  if (!tier) {
    hintEl.textContent = "";
    return;
  }
  const lowest = state.tierWeights.reduce((min, t) => (t.weight < min.weight ? t : min), tier);
  const multiple = (tier.weight / lowest.weight);
  hintEl.textContent = multiple > 1
    ? `Esta propaganda se exhibira aproximadamente ${multiple % 1 === 0 ? multiple : multiple.toFixed(1)} veces mas seguido que una de valor ${lowest.value_tier}. Si otra propaganda del mismo sector tiene el mismo valor, se alternaran entre si.`
    : `Prioridad base: esta propaganda solo se exhibira despues de que las de mayor valor hayan tenido su turno.`;
}

async function saveTierWeights() {
  const statusEl = $("#tierWeightsStatus");
  const rows = $$(".tier-weights-row").map((row) => ({
    value_tier: Number(row.dataset.tier),
    min_usd: Number(row.querySelector(".tier-min").value),
    max_usd: row.querySelector(".tier-max").value === "" ? null : Number(row.querySelector(".tier-max").value),
    weight: Number(row.querySelector(".tier-weight").value),
  }));

  if (rows.some((r) => !(r.weight > 0) || r.min_usd < 0 || (r.max_usd !== null && r.max_usd < r.min_usd))) {
    statusEl.textContent = "Revisa los valores: minimo/maximo/prioridad deben ser validos.";
    return;
  }

  try {
    await Promise.all(rows.map((row) => supabaseRest(`central_admin_campaign_tier_weights?value_tier=eq.${row.value_tier}`, {
      method: "PATCH",
      body: JSON.stringify({
        min_usd: row.min_usd,
        max_usd: row.max_usd,
        weight: row.weight,
        updated_by: state.actor || "central-admin",
      }),
    })));
    state.tierWeights = state.tierWeights.map((tier) => ({ ...tier, ...rows.find((r) => r.value_tier === tier.value_tier) }));
    populateValueTierSelect();
    statusEl.textContent = "Prioridades guardadas.";
    notify("Prioridades de propaganda actualizadas.");
  } catch (error) {
    console.warn("No se pudieron guardar las prioridades:", error);
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
    list.innerHTML = state.campaigns.map((campaign) => {
      const donationLabel = campaign.donation_type === "continua"
        ? `Continua (${campaign.donation_period_months || "?"}m)`
        : "Unica";
      return `
      <button class="campaign-row ${campaign.id === state.selectedCampaignId ? "active" : ""}" data-id="${esc(campaign.id)}">
        <div>
          <strong>${esc(campaign.name)}</strong>
          <div class="muted">${esc(campaign.moment)} - ${campaign.duration_seconds}s - ${esc(campaign.validity_type)}</div>
          <div class="muted">Valor ${campaign.value_tier ?? 1} - ${donationLabel}</div>
        </div>
        <span class="badge ${CAMPAIGN_STATUS_BADGE[campaign.status] || "audit"}">${CAMPAIGN_STATUS_LABEL[campaign.status] || campaign.status}</span>
      </button>
    `;
    }).join("");
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
    renderSectorCheckboxes(campaign.target_sectors);
    setTargetAllUI(campaign.target_all !== false);
    setDonationTypeUI(campaign.donation_type || "unica");
    if (campaign.donation_period_months) $("#adDonationPeriod").value = campaign.donation_period_months;
    $("#adValueTier").value = campaign.value_tier || 1;
    updatePriorityHint();
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
    renderSectorCheckboxes([]);
    setTargetAllUI(true);
    setDonationTypeUI("unica");
    $("#adValueTier").value = 1;
    updatePriorityHint();
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

  const donationType = $("#adDonationType").value;
  const donationPeriod = Number($("#adDonationPeriod").value) || null;
  if (donationType === "continua" && !donationPeriod) {
    notify("Indica el periodo en meses para una donacion continua.");
    return;
  }

  const existing = getSelectedCampaign();
  const targetAll = $("#adTargetAll").checked;
  const payload = {
    name,
    moment: $("#adMoment").value,
    duration_seconds: Number($("#adDuration").value) || 10,
    validity_type: $("#adValidity").value,
    status: $("#adStatus").value,
    link_url: $("#adLink").value.trim() || null,
    message,
    target_all: targetAll,
    target_sectors: targetAll ? [] : getTargetSectorsFromForm(),
    donation_type: donationType,
    donation_period_months: donationType === "continua" ? donationPeriod : null,
    value_tier: Number($("#adValueTier").value) || 1,
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

function logout() {
  if (!window.confirm("¿Salir de la consola de administracion?")) return;
  try {
    const xhr = new XMLHttpRequest();
    // Sending deliberately wrong credentials to the same Basic Auth realm makes the browser
    // discard the previously cached valid credentials for this origin.
    xhr.open("GET", window.location.origin + "/", true, "logout", "logout-" + Date.now());
    xhr.onloadend = () => { window.location.href = "/logged-out"; };
    xhr.onerror = () => { window.location.href = "/logged-out"; };
    xhr.send();
  } catch (e) {
    window.location.href = "/logged-out";
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

async function loadAvailableSectorsFromSupabase() {
  try {
    const rows = await supabaseRest("business_sectors?select=industry&active=eq.true&industry=not.is.null&order=industry.asc");
    const unique = Array.from(new Set((rows || []).map((row) => row.industry).filter(Boolean)));
    state.availableSectors = unique;
    renderSectorCheckboxes();
  } catch (error) {
    console.warn("No se pudieron cargar los sectores:", error);
  }
}

function renderSectorCheckboxes(selectedSectors) {
  const container = $("#adSectorList");
  if (!container) return;
  const selected = new Set(selectedSectors || []);

  container.innerHTML = state.availableSectors.map((sector) => `
    <label class="sector-check">
      <input type="checkbox" value="${esc(sector)}" ${selected.has(sector) ? "checked" : ""} />
      ${esc(sector)}
    </label>
  `).join("");
}

function getTargetSectorsFromForm() {
  return $$("#adSectorList input[type='checkbox']:checked").map((input) => input.value);
}

function setTargetAllUI(targetAll) {
  $("#adTargetAll").checked = targetAll;
  $("#adSectorList").classList.toggle("disabled", targetAll);
}

function setDonationTypeUI(donationType) {
  $("#adDonationType").value = donationType;
  const periodField = $("#adDonationPeriodField");
  const periodInput = $("#adDonationPeriod");
  const isContinua = donationType === "continua";
  periodField.classList.toggle("hidden", !isContinua);
  if (!isContinua) periodInput.value = "";
}

const REPORT_PERIOD_DAYS = { quincenal: 15, mensual: 30, trimestral: 90 };
const ALL_SECTORS_LABEL = "Sin sector (todos)";
const REPORT_LEVELS = {
  summary: "Resumen",
  sectors: "Sectores",
  campaigns: "Campanas",
  campaignSectors: "Campana por sector",
  detail: "Detalle diario",
};

function reportPeriodRange() {
  const periodKey = $("#reportPeriod") ? $("#reportPeriod").value : "trimestral";
  const days = REPORT_PERIOD_DAYS[periodKey] || REPORT_PERIOD_DAYS.trimestral;
  const end = new Date();
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
  return { start, end };
}

function ensureChart(elId) {
  if (typeof echarts === "undefined") return null;
  const dom = document.getElementById(elId);
  if (!dom) return null;
  return echarts.getInstanceByDom(dom) || echarts.init(dom);
}

function renderReportKpis(entries = [], impressions = [], campaigns = []) {
  const withSector = entries.filter((row) => row.sector).length;
  const activeSectors = new Set(entries.filter((row) => row.sector).map((row) => row.sector)).size;
  const campaignCounts = campaignImpressionRows(campaigns, impressions);
  const topCampaign = campaignCounts[0];
  const kpis = [
    { label: "Ingresos totales", value: entries.length, accent: "cyan" },
    { label: "Ingresos con sector", value: withSector, accent: "green" },
    { label: "Sectores activos", value: activeSectors, accent: "violet" },
    { label: "Impresiones", value: impressions.length, accent: "pink" },
    { label: "Campana lider", value: topCampaign ? topCampaign.name : "-", detail: topCampaign ? `${topCampaign.count} vistas` : "Sin datos", accent: "amber" },
  ];
  const container = $("#reportKpis");
  if (!container) return;
  container.innerHTML = kpis.map((item) => `
    <article class="bi-kpi ${esc(item.accent)}">
      <span>${esc(item.label)}</span>
      <strong>${esc(String(item.value))}</strong>
      <em>${esc(item.detail || "Periodo seleccionado")}</em>
    </article>
  `).join("");
}

async function runReport() {
  const { start, end } = reportPeriodRange();
  const startIso = start.toISOString();
  const endIso = end.toISOString();
  const rangeEl = $("#reportRange");
  if (rangeEl) rangeEl.textContent = `Del ${start.toLocaleDateString("es-EC")} al ${end.toLocaleDateString("es-EC")}`;
  setReportPath([{ level: "summary", label: REPORT_LEVELS.summary }]);

  try {
    const [entries, impressions, campaigns] = await Promise.all([
      supabaseRest(`app_entry_log?select=sector,entered_at&entered_at=gte.${encodeURIComponent(startIso)}&entered_at=lte.${encodeURIComponent(endIso)}&limit=5000`),
      supabaseRest(`campaign_impressions?select=campaign_id,sector,shown_at&shown_at=gte.${encodeURIComponent(startIso)}&shown_at=lte.${encodeURIComponent(endIso)}&limit=5000`),
      supabaseRest("central_admin_campaigns?select=id,name,created_at&order=created_at.asc"),
    ]);

    const entryRows = Array.isArray(entries) ? entries : [];
    const impressionRows = Array.isArray(impressions) ? impressions : [];
    const campaignRows = Array.isArray(campaigns) ? campaigns : [];
    state.lastEntryRows = entryRows;
    state.lastImpressionRows = impressionRows;
    state.lastCampaignRows = campaignRows;

    renderReportKpis(entryRows, impressionRows, campaignRows);
    renderTopChart();
  } catch (error) {
    console.warn("No se pudo generar el reporte:", error);
    notify("No se pudo generar el reporte.");
  }
}

function sectorEntryCounts(entries) {
  const counts = new Map();
  entries.forEach((row) => {
    const sector = row.sector || ALL_SECTORS_LABEL;
    counts.set(sector, (counts.get(sector) || 0) + 1);
  });
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
}

function campaignImpressionRows(campaigns, impressions) {
  const counts = new Map();
  impressions.forEach((row) => counts.set(row.campaign_id, (counts.get(row.campaign_id) || 0) + 1));
  return (campaigns || [])
    .map((c) => ({ ...c, count: counts.get(c.id) || 0 }))
    .sort((a, b) => b.count - a.count);
}

function filterImpressionsBySector(impressions, sectorLabel) {
  const isAll = sectorLabel === ALL_SECTORS_LABEL;
  return (impressions || []).filter((row) => isAll ? !row.sector : row.sector === sectorLabel);
}

function groupImpressionsByDay(impressions) {
  const counts = new Map();
  impressions.forEach((row) => {
    const dateKey = row.shown_at ? new Date(row.shown_at).toISOString().slice(0, 10) : "Sin fecha";
    counts.set(dateKey, (counts.get(dateKey) || 0) + 1);
  });
  return Array.from(counts.entries())
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function formatReportDate(dateKey) {
  if (!dateKey || dateKey === "Sin fecha") return "Sin fecha";
  return new Date(`${dateKey}T00:00:00`).toLocaleDateString("es-EC");
}

function setReportPath(path = []) {
  state.reportDrillPath = path;
  const el = $("#reportBreadcrumb");
  if (!el) return;
  el.innerHTML = path.map((item, index) => `
    <button class="bi-crumb ${index === path.length - 1 ? "active" : ""}" data-index="${index}">
      <span>${index + 1}</span>${esc(item.label)}
    </button>
  `).join("");
  $$("#reportBreadcrumb .bi-crumb").forEach((button) => {
    button.addEventListener("click", () => {
      const item = path[Number(button.dataset.index)];
      if (item && typeof item.action === "function") item.action();
    });
  });

  const backBtn = $("#biBackBtn");
  if (backBtn) {
    if (path.length > 1) {
      backBtn.classList.remove("hidden");
      backBtn.onclick = () => {
        const previous = path[path.length - 2];
        if (previous && typeof previous.action === "function") previous.action();
      };
    } else {
      backBtn.classList.add("hidden");
      backBtn.onclick = null;
    }
  }
}

function reportRowsToTable(headers, rows) {
  const head = $("#reportDetailHead");
  const body = $("#reportDetailRows");
  if (!head || !body) return;
  head.innerHTML = `<tr>${headers.map((header) => `<th>${esc(header)}</th>`).join("")}</tr>`;
  body.innerHTML = rows.length === 0
    ? `<tr><td colspan="${headers.length}" class="muted">Sin datos para este nivel del reporte.</td></tr>`
    : rows.map((row) => `
      <tr class="clickable-row">
        ${row.cells.map((cell) => `<td>${esc(cell)}</td>`).join("")}
      </tr>
    `).join("");
  $$("#reportDetailRows .clickable-row").forEach((tr, index) => {
    const row = rows[index];
    if (row && typeof row.action === "function") tr.addEventListener("click", row.action);
  });
}

function biBar3DOption(rows, valueLabel, options = {}) {
  const values = rows.map((row) => row.value);
  const max = Math.max(...values, 1);
  const palette = ["#FF2800", "#1F51FF", "#39FF14", "#FF2800", "#1F51FF", "#39FF14", "#FF2800", "#1F51FF"];
  return {
    backgroundColor: "transparent",
    tooltip: {
      borderWidth: 0,
      backgroundColor: "rgba(5, 12, 24, 0.95)",
      textStyle: { color: "#F4F7FB", fontSize: 13 },
      formatter: (p) => `${p.name}<br/>${valueLabel}: <strong>${p.value[2]}</strong><br/><span style="color:#A8B7C7">Click para profundizar</span>`,
    },
    xAxis3D: {
      type: "category",
      data: rows.map((row) => row.name),
      axisLabel: { color: "#D8E2EF", interval: 0, fontSize: 12, margin: 12 },
      axisLine: { lineStyle: { color: "rgba(143, 166, 188, .55)" } },
    },
    yAxis3D: { type: "category", data: [valueLabel || ""], show: false },
    zAxis3D: {
      type: "value",
      axisLabel: { color: "#A8B7C7" },
      name: valueLabel,
      nameTextStyle: { color: "#F4F7FB", fontWeight: 700 },
    },
    grid3D: {
      boxWidth: options.boxWidth || 132,
      boxDepth: options.boxDepth || 48,
      boxHeight: 76,
      viewControl: {
        alpha: 23,
        beta: 32,
        distance: options.distance || 205,
        autoRotate: true,
        autoRotateSpeed: 2.5,
      },
      light: {
        main: { intensity: 1.35, shadow: true, shadowQuality: "high" },
        ambient: { intensity: 0.72 },
      },
      postEffect: {
        enable: true,
        bloom: { enable: true, bloomIntensity: 0.11 },
        screenSpaceAmbientOcclusion: { enable: true, intensity: 0.9, radius: 3 },
      },
      axisLine: { lineStyle: { color: "rgba(168, 183, 199, .34)" } },
      splitLine: { lineStyle: { color: "rgba(255,255,255,.07)" } },
      axisPointer: { show: true, lineStyle: { color: "#D9A441" } },
    },
    series: [{
      type: "bar3D",
      data: rows.map((row, i) => ({
        name: row.name,
        value: [i, 0, row.value],
        meta: row.meta,
        itemStyle: {
          color: palette[i % palette.length],
          opacity: 1,
          borderWidth: 1,
          borderColor: "rgba(255,255,255,.52)",
        },
      })),
      shading: "realistic",
      bevelSize: 0.28,
      bevelSmoothness: 3,
      barSize: options.barSize || Math.max(13, Math.min(30, 390 / Math.max(rows.length, 1))),
      label: {
        show: true,
        formatter: (p) => p.value[2] > 0 ? String(p.value[2]) : "",
        color: "#FFFFFF",
        fontWeight: 900,
        distance: 2,
      },
      emphasis: {
        label: { show: true, color: "#FFFFFF", fontSize: 16 },
        itemStyle: { color: "#F7D774" },
      },
      animationDurationUpdate: 650,
      animationEasingUpdate: "cubicOut",
    }],
    visualMap: {
      show: false,
      min: 0,
      max,
      inRange: { color: palette },
    },
  };
}

function renderBiChart({ level, title, subtitle, rows, valueLabel, headers, tableRows, path }) {
  $("#biChartLevel").textContent = `NIVEL ${level}`;
  $("#biChartTitle").textContent = title;
  $("#biChartSubtitle").textContent = subtitle;
  setReportPath(path);
  reportRowsToTable(headers, tableRows);

  const chart = ensureChart("topChart");
  if (!chart) return;
  if (rows.length === 0) {
    chart.clear();
    return;
  }
  chart.setOption(biBar3DOption(rows, valueLabel, { barSize: level === 1 ? 34 : undefined }), true);
  chart.off("click");
  chart.on("click", (params) => {
    const row = rows.find((item) => item.name === params.name);
    if (row && typeof row.action === "function") row.action();
  });
}

function renderTopChart() {
  renderReportSummary();
}

function renderReportSummary() {
  const entries = state.lastEntryRows || [];
  const impressions = state.lastImpressionRows || [];
  const rows = [
    {
      name: "Ingresos por sector",
      value: entries.filter((row) => row.sector).length,
      action: renderSectorLevel,
    },
    {
      name: "Ingresos sin sector",
      value: entries.filter((row) => !row.sector).length,
      action: () => renderCampaignLevel(ALL_SECTORS_LABEL),
    },
    {
      name: "Propaganda",
      value: impressions.length,
      action: renderGlobalCampaignLevel,
    },
  ];
  renderBiChart({
    level: 1,
    title: "Vista general del reporte",
    subtitle: "Click en una figura para profundizar dentro del mismo grafico.",
    rows,
    valueLabel: "Total",
    headers: ["Indicador", "Total", "Siguiente nivel"],
    tableRows: rows.map((row) => ({
      cells: [row.name, row.value, row.name === "Propaganda" ? "Campanas" : "Sectores / campanas"],
      action: row.action,
    })),
    path: [{ label: REPORT_LEVELS.summary, action: renderReportSummary }],
  });
}

function renderSectorLevel() {
  const rows = sectorEntryCounts(state.lastEntryRows || [])
    .filter(([sector]) => sector !== ALL_SECTORS_LABEL)
    .map(([sector, count]) => ({
      name: sector,
      value: count,
      action: () => renderCampaignLevel(sector),
    }));
  renderBiChart({
    level: 2,
    title: "Ingresos por sector",
    subtitle: "Click en un sector para ver las campanas mostradas a ese grupo.",
    rows,
    valueLabel: "Ingresos",
    headers: ["Sector", "Ingresos", "Siguiente nivel"],
    tableRows: rows.map((row) => ({ cells: [row.name, row.value, "Campanas mostradas"], action: row.action })),
    path: [
      { label: REPORT_LEVELS.summary, action: renderReportSummary },
      { label: REPORT_LEVELS.sectors, action: renderSectorLevel },
    ],
  });
}

function renderCampaignLevel(sectorLabel) {
  const impressions = filterImpressionsBySector(state.lastImpressionRows || [], sectorLabel);
  const campaigns = state.lastCampaignRows || [];
  const counts = new Map();
  impressions.forEach((row) => counts.set(row.campaign_id, (counts.get(row.campaign_id) || 0) + 1));
  const rows = campaigns
    .map((campaign) => ({
      name: campaign.name,
      value: counts.get(campaign.id) || 0,
      campaign,
      action: () => renderCampaignDayLevel(campaign.id, campaign.name, sectorLabel),
    }))
    .filter((row) => row.value > 0)
    .sort((a, b) => b.value - a.value);
  renderBiChart({
    level: 3,
    title: `Campanas mostradas: ${sectorLabel}`,
    subtitle: "Click en una campana para ver el detalle diario dentro del mismo grafico.",
    rows,
    valueLabel: "Impresiones",
    headers: ["Campana", "Creada", "Impresiones"],
    tableRows: rows.map((row) => ({
      cells: [row.name, row.campaign.created_at ? new Date(row.campaign.created_at).toLocaleDateString("es-EC") : "-", row.value],
      action: row.action,
    })),
    path: [
      { label: REPORT_LEVELS.summary, action: renderReportSummary },
      { label: sectorLabel === ALL_SECTORS_LABEL ? "Sin sector" : REPORT_LEVELS.sectors, action: sectorLabel === ALL_SECTORS_LABEL ? renderReportSummary : renderSectorLevel },
      { label: sectorLabel, action: () => renderCampaignLevel(sectorLabel) },
    ],
  });
}

function renderGlobalCampaignLevel() {
  const rows = campaignImpressionRows(state.lastCampaignRows || [], state.lastImpressionRows || [])
    .filter((campaign) => campaign.count > 0)
    .map((campaign) => ({
      name: campaign.name,
      value: campaign.count,
      campaign,
      action: () => renderCampaignSectorLevel(campaign.id, campaign.name),
    }));
  renderBiChart({
    level: 2,
    title: "Propaganda por campana",
    subtitle: "Click en una campana para ver los sectores impactados.",
    rows,
    valueLabel: "Impresiones",
    headers: ["Campana", "Creada", "Impresiones"],
    tableRows: rows.map((row) => ({
      cells: [row.name, row.campaign.created_at ? new Date(row.campaign.created_at).toLocaleDateString("es-EC") : "-", row.value],
      action: row.action,
    })),
    path: [
      { label: REPORT_LEVELS.summary, action: renderReportSummary },
      { label: "Propaganda", action: renderGlobalCampaignLevel },
    ],
  });
}

function renderCampaignSectorLevel(campaignId, campaignName) {
  const impressions = (state.lastImpressionRows || []).filter((row) => row.campaign_id === campaignId);
  const counts = new Map();
  impressions.forEach((row) => {
    const sector = row.sector || ALL_SECTORS_LABEL;
    counts.set(sector, (counts.get(sector) || 0) + 1);
  });
  const rows = Array.from(counts.entries())
    .map(([sector, count]) => ({
      name: sector,
      value: count,
      action: () => renderCampaignDayLevel(campaignId, campaignName, sector),
    }))
    .sort((a, b) => b.value - a.value);
  renderBiChart({
    level: 3,
    title: `Sectores impactados: ${campaignName}`,
    subtitle: "Click en un sector para ver el comportamiento diario de esta campana.",
    rows,
    valueLabel: "Impresiones",
    headers: ["Sector", "Campana", "Impresiones"],
    tableRows: rows.map((row) => ({ cells: [row.name, campaignName, row.value], action: row.action })),
    path: [
      { label: REPORT_LEVELS.summary, action: renderReportSummary },
      { label: "Propaganda", action: renderGlobalCampaignLevel },
      { label: campaignName, action: () => renderCampaignSectorLevel(campaignId, campaignName) },
    ],
  });
}

function renderCampaignDayLevel(campaignId, campaignName, sectorLabel) {
  const impressions = filterImpressionsBySector(state.lastImpressionRows || [], sectorLabel)
    .filter((row) => row.campaign_id === campaignId);
  const rows = groupImpressionsByDay(impressions).map((row) => ({
    name: formatReportDate(row.date),
    value: row.count,
  }));
  renderBiChart({
    level: 4,
    title: `${campaignName} - ${sectorLabel}`,
    subtitle: "Detalle diario de impresiones. Este es el ultimo nivel disponible con los datos actuales.",
    rows,
    valueLabel: "Impresiones por dia",
    headers: ["Fecha", "Sector", "Impresiones"],
    tableRows: rows.map((row) => ({ cells: [row.name, sectorLabel, row.value] })),
    path: [
      { label: REPORT_LEVELS.summary, action: renderReportSummary },
      { label: "Propaganda", action: renderGlobalCampaignLevel },
      { label: sectorLabel, action: () => renderCampaignLevel(sectorLabel) },
      { label: campaignName, action: () => renderCampaignDayLevel(campaignId, campaignName, sectorLabel) },
    ],
  });
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
        <button class="btn secondary" data-act="switchThreatView" data-a1="alerts">Ver alertas</button>
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
      <button class="btn secondary" data-act="clearThreatFilters">Limpiar filtros</button>
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
      <button class="btn secondary" data-act="clearThreatFilters">Limpiar filtros</button>
      <button class="btn primary" data-act="createTpotAiAnalysis">Generar analisis IA</button>
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
          <button class="btn secondary" data-act="testThreatConnection">Probar conexion</button>
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
  <tbody>${events.map((event) => `<tr><td>${esc(event.timestamp)}</td><td>${severityBadge(event.severity)}</td><td>${esc(event.event_type)}</td><td><code>${esc(event.source_ip)}</code></td><td>${esc(event.honeypot)}</td><td>Nuevo</td>${withAction ? `<td><button class="btn secondary small" data-act="openThreatEventDetail" data-a1="${esc(JSON.stringify(event))}">Ver detalle</button></td>` : ""}</tr>`).join("") || `<tr><td colspan="${withAction ? 7 : 6}">No hay alertas para los filtros seleccionados. Prueba ampliar el rango de fechas.</td></tr>`}</tbody></table>`;
}

function threatKpi(label, value, severity, filterType, filterValue, title) {
  return `<button class="threat-kpi ${esc(severity)}" data-act="openThreatDrilldown" data-a1="${esc(filterType)}" data-a2="${esc(filterValue)}" data-a3="${esc(title)}"><span>${esc(label)}</span><strong>${esc(String(value))}</strong><small>Ver detalle</small></button>`;
}

function severityBadge(severity = "info") {
  const labels = { critical: "Critica", high: "Alta", medium: "Media", low: "Baja", info: "Info" };
  return `<span class="severity-badge ${esc(severity)}">${esc(labels[severity] || severity)}</span>`;
}

function threatChart(title, items = [], type) {
  const normalized = items.slice(0, 10).map((item) => ({ value: item.value || item[0] || "n/d", count: Number(item.count || item[1] || 0) }));
  const max = Math.max(1, ...normalized.map((item) => item.count));
  return `<article class="threat-card"><h3>${esc(title)}</h3>${normalized.map((item) => `
    <button class="bar-row" data-act="openThreatDrilldown" data-a1="${esc(type)}" data-a2="${esc(String(item.value))}" data-a3="${esc(title)}: ${esc(String(item.value))}">
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
  if (status === "pending_audit") return `<button class="btn secondary small" data-act="auditThreatJob" data-a1="${esc(jobId)}">Auditar</button>`;
  if (status === "needs_human_review") return `<button class="btn secondary small" data-act="approveThreatJob" data-a1="${esc(jobId)}">Aprobar</button> <button class="btn secondary small" data-act="rejectThreatJob" data-a1="${esc(jobId)}">Rechazar</button>`;
  if (status === "approved") return `<button class="btn secondary small" data-act="publishThreatJob" data-a1="${esc(jobId)}">Publicar</button>`;
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
        <button class="btn secondary" data-act="closeThreatDrilldown">Cerrar</button>
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
        <button class="btn secondary" data-act="closeThreatDrilldown">Cerrar</button>
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

// --- Campeonato -------------------------------------------------------

function isoToDatetimeLocal(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function loadChampionshipConfig() {
  try {
    const rows = await supabaseRest("championships?select=*&order=created_at.desc&limit=1");
    state.championship = Array.isArray(rows) && rows[0] ? rows[0] : null;
    renderChampionshipConfig();
    if (state.championship) {
      await Promise.all([loadChampionshipRegistrations(), loadChampionshipMatches()]);
    }
  } catch (error) {
    console.warn("No se pudo cargar la configuracion del campeonato:", error);
  }
}

function renderChampionshipConfig() {
  const c = state.championship;
  $("#champName").value = c?.name ?? "";
  $("#champStatus").value = c?.status ?? "draft";
  $("#champMinBelt").value = c?.min_belt ?? "black";
  $("#champMaxAge").value = c?.max_age ?? 18;
  $("#champRegOpens").value = isoToDatetimeLocal(c?.registration_opens_at);
  $("#champRegCloses").value = isoToDatetimeLocal(c?.registration_closes_at);
  $("#champQuestionsPerMatch").value = c?.questions_per_match ?? 5;
  $("#champTimeEasy").value = c?.time_limit_easy_seconds ?? 60;
  $("#champTimeMedium").value = c?.time_limit_medium_seconds ?? 90;
  $("#champTimeHard").value = c?.time_limit_hard_seconds ?? 120;
  $("#champRulesText").value = c?.rules_text ?? "";
}

async function saveChampionshipConfig() {
  const statusEl = $("#champConfigStatus");
  const opensLocal = $("#champRegOpens").value;
  const closesLocal = $("#champRegCloses").value;
  if (!$("#champName").value.trim() || !opensLocal || !closesLocal) {
    statusEl.textContent = "Completa nombre, apertura y cierre de inscripcion.";
    return;
  }

  const payload = {
    name: $("#champName").value.trim(),
    status: $("#champStatus").value,
    min_belt: $("#champMinBelt").value,
    max_age: Number($("#champMaxAge").value) || 18,
    registration_opens_at: new Date(opensLocal).toISOString(),
    registration_closes_at: new Date(closesLocal).toISOString(),
    questions_per_match: Number($("#champQuestionsPerMatch").value) || 5,
    time_limit_easy_seconds: Number($("#champTimeEasy").value) || 60,
    time_limit_medium_seconds: Number($("#champTimeMedium").value) || 90,
    time_limit_hard_seconds: Number($("#champTimeHard").value) || 120,
    rules_text: $("#champRulesText").value.trim() || null,
  };

  statusEl.textContent = "Guardando...";
  try {
    if (state.championship?.id) {
      await supabaseRest(`championships?id=eq.${state.championship.id}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
    } else {
      await supabaseRest("championships", {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify(payload),
      });
    }
    statusEl.textContent = "";
    notify("Configuracion del campeonato guardada.");
    await loadChampionshipConfig();
  } catch (error) {
    console.error("No se pudo guardar el campeonato:", error);
    statusEl.textContent = `No se pudo guardar: ${error.message}`;
  }
}

async function saveChampionshipResendKey() {
  const input = $("#champResendKey");
  const statusEl = $("#champResendStatus");
  const value = input.value.trim();
  if (!value) {
    statusEl.textContent = "Pega tu API key de Resend antes de guardar.";
    return;
  }
  statusEl.textContent = "Guardando...";
  try {
    await supabaseFunctionInvoke("save-app-secret", { name: "resend_api_key", value });
    input.value = "";
    statusEl.textContent = "Clave guardada de forma cifrada.";
    notify("Clave de Resend guardada.");
  } catch (error) {
    console.error("No se pudo guardar la clave de Resend:", error);
    statusEl.textContent = `No se pudo guardar: ${error.message}`;
  }
}

async function runChampionshipDraw() {
  if (!state.championship?.id) {
    notify("Guarda la configuracion del campeonato primero.");
    return;
  }
  const scheduledLocal = $("#champDrawScheduledAt").value;
  if (!scheduledLocal) {
    notify("Elige la fecha y hora del combate.");
    return;
  }
  if (!window.confirm("Esto sorteara la ronda 1 entre todos los inscritos y les enviara un correo. Esta accion no se puede deshacer. ¿Continuar?")) return;

  const resultEl = $("#champDrawResult");
  resultEl.textContent = "Sorteando y enviando correos...";
  try {
    const result = await supabaseFunctionInvoke("championship-draw-round1", {
      championship_id: state.championship.id,
      scheduled_at: new Date(scheduledLocal).toISOString(),
      window_hours: Number($("#champDrawWindowHours").value) || 24,
    });
    if (result.error) {
      resultEl.innerHTML = `<p class="news-run-error">${esc(result.error)}</p>`;
    } else {
      const failedEmails = (result.emails || []).filter((e) => !e.ok);
      resultEl.innerHTML = `
        <p>${result.matches_created} combates creados (${result.byes} bye${result.byes === 1 ? "" : "s"}).</p>
        ${failedEmails.length > 0 ? `<p class="news-run-error">${failedEmails.length} correo(s) no se pudieron enviar: ${esc(failedEmails[0].error)}</p>` : "<p>Correos enviados correctamente.</p>"}
      `;
      await loadChampionshipMatches();
    }
  } catch (error) {
    console.error("Error al sortear la ronda 1:", error);
    resultEl.innerHTML = `<p class="news-run-error">${esc(error.message)}</p>`;
  }
}

async function loadChampionshipRegistrations() {
  if (!state.championship?.id) return;
  try {
    const rows = await supabaseRest(
      `championship_registrations?championship_id=eq.${state.championship.id}&select=*&order=registered_at.desc`
    );
    state.championshipRegistrations = Array.isArray(rows) ? rows : [];
    renderChampionshipRegistrations();
  } catch (error) {
    console.warn("No se pudieron cargar los inscritos:", error);
  }
}

function renderChampionshipRegistrations() {
  const container = $("#champRegistrationList");
  if (state.championshipRegistrations.length === 0) {
    container.innerHTML = `<p class="muted">Todavia no hay inscritos.</p>`;
    return;
  }
  container.innerHTML = state.championshipRegistrations.map((r) => `
    <div class="progress-row">
      <div class="news-run-head">
        <span class="badge ai">Inscrito</span>
        <strong>${esc(new Date(r.registered_at).toLocaleString("es-EC"))}</strong>
        <span class="muted">usuario ${esc(r.user_id)} · cinturon ${esc(r.belt_at_registration)} · nacimiento ${esc(r.birthdate)}</span>
      </div>
    </div>
  `).join("");
}

const CHAMP_MATCH_STATUS_LABEL = { scheduled: "Programado", in_progress: "En curso", completed: "Completado", bye: "Bye (avanza directo)" };

async function loadChampionshipMatches() {
  if (!state.championship?.id) return;
  try {
    const rows = await supabaseRest(
      `championship_matches?championship_id=eq.${state.championship.id}&select=*&order=round.asc`
    );
    state.championshipMatches = Array.isArray(rows) ? rows : [];
    renderChampionshipMatches();
  } catch (error) {
    console.warn("No se pudieron cargar los combates:", error);
  }
}

function renderChampionshipMatches() {
  const container = $("#champMatchList");
  if (state.championshipMatches.length === 0) {
    container.innerHTML = `<p class="muted">Todavia no se ha sorteado ninguna ronda.</p>`;
    return;
  }
  container.innerHTML = state.championshipMatches.map((m) => `
    <div class="progress-row">
      <div class="news-run-head">
        <span class="badge ${m.status === "completed" ? "ai" : m.status === "bye" ? "audit" : "manual"}">${esc(CHAMP_MATCH_STATUS_LABEL[m.status] || m.status)}</span>
        <strong>Ronda ${esc(String(m.round))}</strong>
        <span class="muted">${esc(new Date(m.scheduled_at).toLocaleString("es-EC"))}</span>
      </div>
      <p class="muted">Jugador 1: ${esc(m.player1_id)}${m.player2_id ? ` · Jugador 2: ${esc(m.player2_id)}` : " · (bye, sin oponente)"}</p>
      ${m.winner_id ? `<p>Ganador: ${esc(m.winner_id)}</p>` : ""}
    </div>
  `).join("");
}

const SEC_FEED_PAGE_SIZE = 25;
const SEC_SEVERITY_CLASS = { critica: "critical", alta: "high", media: "medium", baja: "low" };
const SEC_SEVERITY_LABEL = { critica: "Critica", alta: "Alta", media: "Media", baja: "Baja" };

function secSeverityBadge(severity) {
  const cls = SEC_SEVERITY_CLASS[severity] || "info";
  const label = SEC_SEVERITY_LABEL[severity] || severity || "n/d";
  return `<span class="severity-badge ${cls}">${esc(label)}</span>`;
}

async function loadSecurityCenter() {
  state.secFilters = state.secFilters || { severity: "", endpoint: "", from: "", to: "" };
  state.secFeedOffset = state.secFeedOffset || 0;
  $("#secFilterSeverity").value = state.secFilters.severity;
  $("#secFilterEndpoint").value = state.secFilters.endpoint;
  $("#secFilterFrom").value = state.secFilters.from;
  $("#secFilterTo").value = state.secFilters.to;
  ["secFilterSeverity", "secFilterEndpoint", "secFilterFrom", "secFilterTo"].forEach((id) => {
    $(`#${id}`).onchange = () => {
      state.secFilters.severity = $("#secFilterSeverity").value;
      state.secFilters.endpoint = $("#secFilterEndpoint").value.trim();
      state.secFilters.from = $("#secFilterFrom").value;
      state.secFilters.to = $("#secFilterTo").value;
      state.secFeedOffset = 0;
      void loadSecurityFeed();
    };
  });

  await Promise.all([
    loadSecurityFeed(),
    loadSecurityMetrics(),
    loadSecurityAlertConfigs(),
    loadSecurityDiagnoses(),
    loadSecurityEasmFindings(),
    loadSecurityKataDrafts(),
    loadSecurityEndpointOptions(),
  ]);
}

// Known endpoints even before any real event has landed for them, so the
// dropdown isn't empty on a fresh project — merged with whatever real
// distinct endpoints show up in security_events, so a new instrumented
// endpoint appears automatically without touching this list.
const SEC_KNOWN_ENDPOINTS = ["secure-register-user", "login"];

async function loadSecurityEndpointOptions() {
  try {
    const rows = await supabaseRest("security_events?select=endpoint&order=created_at.desc&limit=1000");
    const seen = new Set(Array.isArray(rows) ? rows.map((r) => r.endpoint) : []);
    SEC_KNOWN_ENDPOINTS.forEach((e) => seen.add(e));
    $("#secEndpointOptions").innerHTML = [...seen].sort().map((e) => `<option value="${esc(e)}"></option>`).join("");
  } catch (error) {
    console.warn("No se pudieron cargar los endpoints conocidos:", error);
  }
}

function buildSecFeedQuery(extra = "") {
  const filters = state.secFilters || {};
  const parts = ["select=*", "order=created_at.desc"];
  if (filters.severity) parts.push(`severity=eq.${filters.severity}`);
  if (filters.endpoint) parts.push(`endpoint=ilike.*${encodeURIComponent(filters.endpoint)}*`);
  if (filters.from) parts.push(`created_at=gte.${new Date(filters.from).toISOString()}`);
  if (filters.to) parts.push(`created_at=lte.${new Date(filters.to).toISOString()}`);
  return `security_events?${parts.join("&")}${extra}`;
}

async function loadSecurityFeed() {
  try {
    const offset = state.secFeedOffset || 0;
    const rows = await supabaseRest(`${buildSecFeedQuery()}&limit=${SEC_FEED_PAGE_SIZE + 1}&offset=${offset}`);
    const list = Array.isArray(rows) ? rows : [];
    state.secHasNextPage = list.length > SEC_FEED_PAGE_SIZE;
    state.secEvents = list.slice(0, SEC_FEED_PAGE_SIZE);
    renderSecurityFeed();
  } catch (error) {
    console.warn("No se pudieron cargar los eventos de seguridad:", error);
    $("#secEventFeed").innerHTML = `<p class="muted">No se pudieron cargar los eventos. Verifica la migracion 052.</p>`;
  }
}

function renderSecurityFeed() {
  const rows = state.secEvents || [];
  $("#secEventFeed").innerHTML = rows.length ? `
    <table class="data-table"><thead><tr><th>Fecha/hora</th><th>Endpoint</th><th>Tipo</th><th>Severidad</th><th>Detalle</th></tr></thead>
    <tbody>${rows.map((event) => `
      <tr>
        <td>${esc(new Date(event.created_at).toLocaleString("es-EC"))}</td>
        <td><code>${esc(event.endpoint)}</code></td>
        <td>${esc(event.event_type)}</td>
        <td>${secSeverityBadge(event.severity)}</td>
        <td class="muted">${esc(JSON.stringify(event.metadata || {}))}</td>
      </tr>
    `).join("")}</tbody></table>
  ` : `<p class="muted">No hay eventos para los filtros seleccionados.</p>`;

  const offset = state.secFeedOffset || 0;
  $("#secFeedPageInfo").textContent = `Mostrando ${rows.length ? offset + 1 : 0}-${offset + rows.length}`;
  $("#secFeedPrev").disabled = offset === 0;
  $("#secFeedNext").disabled = !state.secHasNextPage;
}

async function loadSecurityMetrics() {
  try {
    const since14d = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
    const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const rows = await supabaseRest(`security_events?select=created_at,endpoint,event_type,severity&created_at=gte.${since14d}&order=created_at.desc&limit=1000`);
    const events14d = Array.isArray(rows) ? rows : [];
    const events7d = events14d.filter((e) => e.created_at >= since7d);

    $("#secMetricEvents").textContent = String(events7d.length);
    $("#secMetricBlocks").textContent = String(events7d.filter((e) => e.event_type === "rate_limit_exceeded").length);
    $("#secMetricEndpoints").textContent = String(new Set(events7d.map((e) => e.endpoint)).size);

    const topEndpoints = countBy(events7d, "endpoint").sort((a, b) => b.count - a.count).slice(0, 5);
    $("#secTopEndpoints").innerHTML = renderSecBarChart(topEndpoints);

    const trend = trendByDay(events14d).sort((a, b) => String(a.value).localeCompare(String(b.value)));
    $("#secTrendChart").innerHTML = renderSecBarChart(trend, 14);
  } catch (error) {
    console.warn("No se pudieron cargar las metricas de seguridad:", error);
  }
}

function renderSecBarChart(items, max = 10) {
  const capped = items.slice(0, max);
  if (capped.length === 0) return "<p class='muted'>Sin datos.</p>";
  const maxVal = Math.max(1, ...capped.map((item) => item.count));
  return capped.map((item) => `
    <div class="bar-row">
      <span>${esc(String(item.value))}</span>
      <div class="bar-track"><i style="width:${Math.max(8, Math.round((item.count / maxVal) * 100))}%"></i></div>
      <strong>${item.count}</strong>
    </div>
  `).join("");
}

async function runSecurityAlertCheck() {
  try {
    const result = await supabaseFunctionInvoke("check-security-alerts", {});
    const breached = (result.results || []).filter((r) => r.breached);
    notify(breached.length ? `${breached.length} umbral(es) en estado de alerta.` : "Sin umbrales superados por ahora.");
    await loadSecurityAlertConfigs();
  } catch (error) {
    notify(`No se pudo verificar alertas: ${error.message}`);
  }
}

function secEventsToCsvRows(events) {
  const header = ["fecha", "endpoint", "tipo", "severidad", "metadata"];
  const lines = [header.join(",")];
  events.forEach((event) => {
    const row = [
      new Date(event.created_at).toISOString(),
      event.endpoint,
      event.event_type,
      event.severity,
      JSON.stringify(event.metadata || {}).replaceAll('"', '""'),
    ].map((value) => `"${String(value).replaceAll('"', '""')}"`);
    lines.push(row.join(","));
  });
  return lines.join("\n");
}

async function exportSecurityEventsCsv() {
  try {
    const rows = await supabaseRest(`${buildSecFeedQuery()}&limit=1000`);
    const csv = secEventsToCsvRows(Array.isArray(rows) ? rows : []);
    downloadTextFile(csv, `centro-de-seguridad-eventos-${Date.now()}.csv`, "text/csv");
  } catch (error) {
    notify(`No se pudo exportar CSV: ${error.message}`);
  }
}

async function exportSecurityEventsPdf() {
  try {
    const rows = await supabaseRest(`${buildSecFeedQuery()}&limit=1000`);
    const events = Array.isArray(rows) ? rows : [];
    const win = window.open("", "_blank");
    if (!win) { notify("El navegador bloqueo la ventana de impresion."); return; }
    win.document.write(`
      <html><head><title>Centro de Seguridad - Eventos</title>
      <style>body{font-family:sans-serif;font-size:12px;} table{width:100%;border-collapse:collapse;} td,th{border:1px solid #ccc;padding:4px;text-align:left;}</style>
      </head><body>
      <h2>Centro de Seguridad — Eventos de seguridad</h2>
      <p>Generado: ${esc(new Date().toLocaleString("es-EC"))} — ${events.length} eventos</p>
      <table><thead><tr><th>Fecha</th><th>Endpoint</th><th>Tipo</th><th>Severidad</th></tr></thead>
      <tbody>${events.map((e) => `<tr><td>${esc(new Date(e.created_at).toLocaleString("es-EC"))}</td><td>${esc(e.endpoint)}</td><td>${esc(e.event_type)}</td><td>${esc(e.severity)}</td></tr>`).join("")}</tbody>
      </table></body></html>
    `);
    win.document.close();
    win.focus();
    win.print();
  } catch (error) {
    notify(`No se pudo exportar PDF: ${error.message}`);
  }
}

function downloadTextFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

async function loadSecurityAlertConfigs() {
  try {
    const rows = await supabaseRest("security_alert_config?select=*&order=created_at.desc");
    state.secAlertConfigs = Array.isArray(rows) ? rows : [];
    $("#secMetricAlerts").textContent = String(state.secAlertConfigs.filter((c) => c.active).length);
    renderSecurityAlertConfigs();
  } catch (error) {
    console.warn("No se pudieron cargar los umbrales de alerta:", error);
  }
}

function renderSecurityAlertConfigs() {
  const rows = state.secAlertConfigs || [];
  $("#secAlertList").innerHTML = rows.length ? rows.map((cfg) => `
    <div class="question-row compact-row">
      <strong>${esc(cfg.name)}</strong>
      <span>${secSeverityBadge(cfg.severity_threshold)} +${cfg.event_count_threshold} eventos / ${cfg.window_minutes} min</span>
      <span class="muted">${esc(cfg.notify_email || cfg.notify_webhook_url || "sin destino")}</span>
      <span class="badge ${cfg.active ? "ai" : "manual"}">${cfg.active ? "activo" : "inactivo"}</span>
      <button class="btn secondary small" data-sec-alert-edit="${esc(cfg.id)}">Editar</button>
    </div>
  `).join("") : `<p class="muted">Todavia no hay umbrales configurados.</p>`;

  $$("[data-sec-alert-edit]").forEach((button) => {
    button.addEventListener("click", () => loadSecurityAlertIntoForm(button.dataset.secAlertEdit));
  });
}

function loadSecurityAlertIntoForm(id) {
  const cfg = (state.secAlertConfigs || []).find((c) => c.id === id);
  if (!cfg) return;
  $("#secAlertId").value = cfg.id;
  $("#secAlertName").value = cfg.name;
  $("#secAlertSeverity").value = cfg.severity_threshold;
  $("#secAlertCount").value = cfg.event_count_threshold;
  $("#secAlertWindow").value = cfg.window_minutes;
  $("#secAlertEmail").value = cfg.notify_email || "";
  $("#secAlertWebhook").value = cfg.notify_webhook_url || "";
  $("#secAlertStatus").textContent = "";
}

function clearSecurityAlertForm() {
  $("#secAlertId").value = "";
  $("#secAlertName").value = "";
  $("#secAlertSeverity").value = "media";
  $("#secAlertCount").value = "5";
  $("#secAlertWindow").value = "60";
  $("#secAlertEmail").value = "";
  $("#secAlertWebhook").value = "";
  $("#secAlertStatus").textContent = "";
}

async function saveSecurityAlertConfig() {
  const payload = {
    id: $("#secAlertId").value || undefined,
    name: $("#secAlertName").value.trim(),
    severity_threshold: $("#secAlertSeverity").value,
    event_count_threshold: Number($("#secAlertCount").value),
    window_minutes: Number($("#secAlertWindow").value),
    notify_email: $("#secAlertEmail").value.trim() || undefined,
    notify_webhook_url: $("#secAlertWebhook").value.trim() || undefined,
    active: true,
  };
  try {
    const result = await supabaseFunctionInvoke("save-security-alert-config", payload);
    $("#secAlertId").value = result.config.id;
    $("#secAlertStatus").textContent = "Guardado.";
    await loadSecurityAlertConfigs();
  } catch (error) {
    $("#secAlertStatus").textContent = `Error: ${error.message}`;
  }
}

async function deleteSecurityAlertConfig() {
  const id = $("#secAlertId").value;
  if (!id) return;
  if (!window.confirm("¿Eliminar este umbral de alerta?")) return;
  try {
    await supabaseFunctionInvoke("save-security-alert-config", { action: "delete", id });
    clearSecurityAlertForm();
    await loadSecurityAlertConfigs();
  } catch (error) {
    $("#secAlertStatus").textContent = `Error: ${error.message}`;
  }
}

async function loadSecurityDiagnoses() {
  try {
    const rows = await supabaseRest("security_diagnoses?select=*&order=created_at.desc&limit=20");
    state.secDiagnoses = Array.isArray(rows) ? rows : [];
    renderSecurityDiagnoses();
  } catch (error) {
    console.warn("No se pudieron cargar los diagnosticos:", error);
  }
}

function renderSecurityDiagnoses() {
  const rows = state.secDiagnoses || [];
  $("#secDiagnosisList").innerHTML = rows.length ? rows.map((d) => `
    <div class="progress-row">
      <div class="news-run-head">
        ${secSeverityBadge(d.severity)}
        <strong>${esc(new Date(d.created_at).toLocaleString("es-EC"))}</strong>
        <span class="muted">${d.event_count} eventos${d.validation_status === "partial" ? " · respuesta IA invalida" : ""}</span>
      </div>
      <p>${esc(d.summary_es)}</p>
      ${Array.isArray(d.recommendations) && d.recommendations.length ? `<ul>${d.recommendations.map((r) => `<li>${esc(r)}</li>`).join("")}</ul>` : ""}
      <div class="modal-actions">
        <button class="btn secondary small" data-sec-diag-feedback="${esc(d.id)}" data-rating="correcto">👍 Correcto</button>
        <button class="btn secondary small" data-sec-diag-feedback="${esc(d.id)}" data-rating="incorrecto">👎 Incorrecto</button>
        <button class="btn secondary small" data-sec-diag-kata="${esc(d.id)}">Convertir en kata</button>
      </div>
    </div>
  `).join("") : `<p class="muted">Todavia no se ha generado ningun diagnostico.</p>`;

  $$("[data-sec-diag-feedback]").forEach((button) => {
    button.addEventListener("click", () => submitSecurityDiagnosisFeedback(button.dataset.secDiagFeedback, button.dataset.rating));
  });
  $$("[data-sec-diag-kata]").forEach((button) => {
    button.addEventListener("click", () => startSecurityKataFromDiagnosis(button.dataset.secDiagKata));
  });
}

async function submitSecurityDiagnosisFeedback(diagnosisId, rating) {
  try {
    await supabaseRest("security_diagnosis_feedback", {
      method: "POST",
      body: JSON.stringify({ diagnosis_id: diagnosisId, rating, submitted_by: "central-admin" }),
    });
    notify("Gracias, feedback registrado.");
  } catch (error) {
    notify(`No se pudo registrar el feedback: ${error.message}`);
  }
}

function startSecurityKataFromDiagnosis(diagnosisId) {
  const diagnosis = (state.secDiagnoses || []).find((d) => d.id === diagnosisId);
  if (!diagnosis) return;
  $("#secKataId").value = "";
  $("#secKataTitle").value = `Incidente: ${SEC_SEVERITY_LABEL[diagnosis.severity] || diagnosis.severity}`;
  $("#secKataBody").value = `${diagnosis.summary_es}\n\nRecomendaciones:\n${(diagnosis.recommendations || []).map((r) => `- ${r}`).join("\n")}`;
  state.secKataSourceDiagnosisId = diagnosisId;
  $("#secKataPublishFields").classList.add("hidden");
  $("#secKataStatus").textContent = "Borrador prellenado desde el diagnostico. Guarda y envia a revision.";
}

async function runSecurityDiagnosis() {
  $("#secDiagnosisStatus").textContent = "Generando diagnostico...";
  try {
    const result = await supabaseFunctionInvoke("security-diagnose", {});
    $("#secDiagnosisStatus").textContent = result.skipped ? result.reason : "Diagnostico generado.";
    await loadSecurityDiagnoses();
  } catch (error) {
    $("#secDiagnosisStatus").textContent = `Error: ${error.message}`;
  }
}

async function loadSecurityEasmFindings() {
  try {
    const rows = await supabaseRest("security_easm_findings?select=*&order=created_at.desc&limit=100");
    state.secEasmFindings = Array.isArray(rows) ? rows : [];
    renderSecurityEasmFindings();
  } catch (error) {
    console.warn("No se pudieron cargar los hallazgos EASM:", error);
  }
}

const SEC_FINDING_TYPE_LABEL = { public_endpoint: "Endpoint publico", public_bucket: "Bucket publico", missing_env_var: "Variable de entorno faltante", other: "Otro" };

function renderSecurityEasmFindings() {
  const rows = state.secEasmFindings || [];
  $("#secEasmList").innerHTML = rows.length ? `
    <table class="data-table"><thead><tr><th>Mes</th><th>Tipo</th><th>Objetivo</th><th>Severidad</th><th>Estado</th></tr></thead>
    <tbody>${rows.map((f) => `
      <tr>
        <td>${esc(f.scan_month)}</td>
        <td>${esc(SEC_FINDING_TYPE_LABEL[f.finding_type] || f.finding_type)}</td>
        <td><code>${esc(f.target)}</code></td>
        <td>${secSeverityBadge(f.severity)}</td>
        <td><button class="badge ${f.resolved ? "ai" : "audit"}" data-sec-finding-detail="${esc(f.id)}" style="cursor:pointer;border:0;">${f.resolved ? "resuelto" : "pendiente"}</button></td>
      </tr>
    `).join("")}</tbody></table>
  ` : `<p class="muted">Todavia no se ha ejecutado el inventario EASM.</p>`;

  $$("[data-sec-finding-detail]").forEach((button) => {
    button.addEventListener("click", () => openSecFindingModal(button.dataset.secFindingDetail));
  });
}

function secFindingExplanation(finding) {
  const target = finding.target;
  if (finding.finding_type === "public_endpoint") {
    return `Este endpoint (<code>${esc(target)}</code>) es publico a proposito: pg_cron lo llama sin sesion de usuario, por eso tiene <code>verify_jwt = false</code> en <code>supabase/config.toml</code>. No requiere ninguna accion.`;
  }
  if (finding.finding_type === "public_bucket") {
    return finding.resolved
      ? `El bucket <code>${esc(target)}</code> ya fue revisado y confirmado como publico a proposito.`
      : `El bucket <code>${esc(target)}</code> esta marcado como publico en Supabase Storage y no esta en la lista de buckets que deberian serlo (solo <code>campaign-ads</code>). Revisalo en Supabase &rarr; Storage: si no necesita ser publico, cambialo a privado.`;
  }
  if (finding.finding_type === "missing_env_var") {
    return finding.resolved
      ? `La variable <code>${esc(target)}</code> ya fue configurada.`
      : `La variable de entorno <code>${esc(target)}</code> no esta definida en los secretos de las Edge Functions. Configurala en Supabase &rarr; Edge Functions &rarr; Secrets. Mientras falte, las funciones que dependen de ella pueden fallar o quedar menos protegidas.`;
  }
  return finding.resolved ? "Este hallazgo ya fue resuelto." : "Este hallazgo todavia no se ha resuelto.";
}

function openSecFindingModal(id) {
  const finding = (state.secEasmFindings || []).find((f) => f.id === id);
  if (!finding) return;
  $("#secFindingModalTitle").textContent = `${SEC_FINDING_TYPE_LABEL[finding.finding_type] || finding.finding_type}: ${finding.target}`;
  $("#secFindingModalBody").innerHTML = `
    <p>${secFindingExplanation(finding)}</p>
    <p class="muted">Mes del escaneo: ${esc(finding.scan_month)} &middot; Severidad: ${secSeverityBadge(finding.severity)} &middot; Estado: ${finding.resolved ? "resuelto" : "pendiente"}${finding.resolved_at ? ` (${esc(new Date(finding.resolved_at).toLocaleString("es-EC"))})` : ""}</p>
    ${finding.details && Object.keys(finding.details).length ? `<p class="muted">Detalle tecnico: <code>${esc(JSON.stringify(finding.details))}</code></p>` : ""}
  `;
  $("#secFindingModal").classList.add("active");
}

function closeSecFindingModal() {
  $("#secFindingModal").classList.remove("active");
}

async function runSecurityEasmScan() {
  $("#secEasmStatus").textContent = "Ejecutando inventario...";
  try {
    const result = await supabaseFunctionInvoke("security-easm-scan", {});
    $("#secEasmStatus").textContent = `${result.findings_count} hallazgo(s) registrados, ${result.unresolved_serious} sin resolver.`;
    await loadSecurityEasmFindings();
  } catch (error) {
    $("#secEasmStatus").textContent = `Error: ${error.message}`;
  }
}

const SEC_KATA_STATUS_LABEL = { borrador: "Borrador", en_revision: "En revision", publicado: "Publicado" };

async function loadSecurityKataDrafts() {
  try {
    const rows = await supabaseRest("security_kata_drafts?select=*&order=created_at.desc&limit=50");
    state.secKataDrafts = Array.isArray(rows) ? rows : [];
    renderSecurityKataDrafts();
  } catch (error) {
    console.warn("No se pudieron cargar los borradores de kata:", error);
  }
}

function renderSecurityKataDrafts() {
  const rows = state.secKataDrafts || [];
  $("#secKataList").innerHTML = rows.length ? rows.map((k) => `
    <div class="question-row compact-row" data-sec-kata-select="${esc(k.id)}">
      <strong>${esc(k.title)}</strong>
      <span class="badge ${k.status === "publicado" ? "ai" : k.status === "en_revision" ? "manual" : "audit"}">${esc(SEC_KATA_STATUS_LABEL[k.status] || k.status)}</span>
      <span class="muted">${esc(new Date(k.created_at).toLocaleDateString("es-EC"))}</span>
    </div>
  `).join("") : `<p class="muted">Todavia no hay borradores de kata.</p>`;

  $$("[data-sec-kata-select]").forEach((row) => {
    row.addEventListener("click", () => loadSecurityKataIntoEditor(row.dataset.secKataSelect));
  });
}

function populateSecKataDojoSelect() {
  const select = $("#secKataDojo");
  select.innerHTML = (state.dojos || []).map((d) => `<option value="${esc(d.id)}">${esc(d.name)}</option>`).join("");
}

function loadSecurityKataIntoEditor(id) {
  const draft = (state.secKataDrafts || []).find((k) => k.id === id);
  if (!draft) return;
  $("#secKataId").value = draft.id;
  $("#secKataTitle").value = draft.title;
  $("#secKataBody").value = draft.body_md;
  $("#secKataStatus").textContent = `Estado actual: ${SEC_KATA_STATUS_LABEL[draft.status] || draft.status}`;
  if (draft.status === "en_revision") {
    populateSecKataDojoSelect();
    $("#secKataPublishFields").classList.remove("hidden");
    $("#secKataQuestion").value = "";
    $("#secKataAnswer").value = "";
    $("#secKataExplanation").value = "";
  } else {
    $("#secKataPublishFields").classList.add("hidden");
  }
}

async function saveSecurityKataDraft() {
  const id = $("#secKataId").value;
  const title = $("#secKataTitle").value.trim();
  const bodyMd = $("#secKataBody").value.trim();
  if (!title || !bodyMd) { $("#secKataStatus").textContent = "Completa titulo y contenido."; return; }
  try {
    const result = id
      ? await supabaseFunctionInvoke("security-kata-convert", { action: "update", id, title, body_md: bodyMd })
      : await supabaseFunctionInvoke("security-kata-convert", { action: "create", title, body_md: bodyMd, source_diagnosis_id: state.secKataSourceDiagnosisId });
    $("#secKataId").value = result.draft.id;
    $("#secKataStatus").textContent = "Borrador guardado.";
    state.secKataSourceDiagnosisId = null;
    await loadSecurityKataDrafts();
  } catch (error) {
    $("#secKataStatus").textContent = `Error: ${error.message}`;
  }
}

async function submitSecurityKataForReview() {
  const id = $("#secKataId").value;
  if (!id) { $("#secKataStatus").textContent = "Guarda el borrador primero."; return; }
  try {
    await supabaseFunctionInvoke("security-kata-convert", { action: "submit_review", id });
    $("#secKataStatus").textContent = "Enviado a revision.";
    await loadSecurityKataDrafts();
    loadSecurityKataIntoEditor(id);
  } catch (error) {
    $("#secKataStatus").textContent = `Error: ${error.message}`;
  }
}

async function rejectSecurityKataDraft() {
  const id = $("#secKataId").value;
  if (!id) return;
  try {
    await supabaseFunctionInvoke("security-kata-convert", { action: "reject", id });
    $("#secKataStatus").textContent = "Regresado a borrador.";
    await loadSecurityKataDrafts();
    loadSecurityKataIntoEditor(id);
  } catch (error) {
    $("#secKataStatus").textContent = `Error: ${error.message}`;
  }
}

async function publishSecurityKataDraft() {
  const id = $("#secKataId").value;
  if (!id) return;
  const payload = {
    action: "publish",
    id,
    dojo_id: $("#secKataDojo").value,
    kata_label: $("#secKataLabel").value.trim() || "Kata 1",
    difficulty: Number($("#secKataDifficulty").value) || 1,
    question_text: $("#secKataQuestion").value.trim(),
    answer_text: $("#secKataAnswer").value.trim(),
    explanation: $("#secKataExplanation").value.trim(),
  };
  try {
    await supabaseFunctionInvoke("security-kata-convert", payload);
    $("#secKataStatus").textContent = "Publicado como pregunta de kata.";
    $("#secKataPublishFields").classList.add("hidden");
    await loadSecurityKataDrafts();
  } catch (error) {
    $("#secKataStatus").textContent = `Error: ${error.message}`;
  }
}

init();
