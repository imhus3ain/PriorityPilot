// PriorityPilot — app.js (ALL 5 UPGRADES IN ONE FILE)
// - Pomodoro polish (auto-complete, short/long breaks, sound + visual cue)
// - Daily stats (focus minutes today, streak)
// - Smarter suggestions
// - UI/UX polish via injected CSS + toast
// - Prep-for-AI architecture hooks (no keys)

let tasks = [];
const storageKey = "priorityPilotTasks";

// stats storage
const statsKey = "priorityPilotStatsV1"; // separate from tasks
const stats = {
  // focusSecondsByDay: { "YYYY-MM-DD": number }
  focusSecondsByDay: {},
  // lastFocusDay: "YYYY-MM-DD"
  lastFocusDay: null,
};

let contextState = { time: "15", energy: "high", location: "any" };

// Focus/Pomodoro state
let focusState = {
  taskId: null,
  timerId: null,
  remaining: 0,
  running: false,

  // Pomodoro
  phase: "work", // "work" | "break"
  pomodorosDone: 0, // counts work sessions completed in this streak
  shortBreakSeconds: 5 * 60,
  longBreakSeconds: 15 * 60,
  longBreakEvery: 4,

  // Tracking time for stats
  tickLast: null, // ms timestamp of last tick
};

const form = {
  title: document.getElementById("title"),
  eta: document.getElementById("eta"),
  deadline: document.getElementById("deadline"),
  notes: document.getElementById("notes"),
  dependencies: document.getElementById("dependencies"),
  impactButtons: document.getElementById("impactButtons"),
  effortStars: document.getElementById("effortStars"),
  formEl: document.getElementById("taskForm"),
};

const ui = {
  timeChips: document.getElementById("timeChips"),
  energyChips: document.getElementById("energyChips"),
  locationChips: document.getElementById("locationChips"),
  showPriorities: document.getElementById("showPriorities"),
  priorityList: document.getElementById("priorityList"),
  parkedList: document.getElementById("parkedList"),
  completedCount: document.getElementById("completedCount"),
  remainingCount: document.getElementById("remainingCount"),
  quickWins: document.getElementById("quickWins"),
  suggestionList: document.getElementById("suggestionList"),
  focusToggle: document.getElementById("focusToggle"),

  // Optional (if your HTML has these — we’ll use them if present)
  focusMinutesToday: document.getElementById("focusMinutesToday"),
  streakCount: document.getElementById("streakCount"),
};

const focusPanel = {
  panel: document.getElementById("focusPanel"),
  title: document.getElementById("focusTitle"),
  reason: document.getElementById("focusReason"),
  status: document.getElementById("focusStatus"),
  eta: document.getElementById("focusEta"),
  impact: document.getElementById("focusImpact"),
  deadline: document.getElementById("focusDeadline"),
  timerDisplay: document.getElementById("timerDisplay"),
  start: document.getElementById("startTimer"),
  pause: document.getElementById("pauseTimer"),
  reset: document.getElementById("resetTimer"),
  complete: document.getElementById("completeFocus"),
  defer: document.getElementById("deferFocus"),

  // Optional
  phaseChip: document.getElementById("focusPhase"),
};

function injectUXPolishCSS() {
  const css = `
    .task-card { transition: transform 160ms ease, box-shadow 160ms ease; }
    .task-card:hover { transform: translateY(-2px); }
    .progress-bar { transition: width 260ms ease; }
    .badge { transition: transform 140ms ease, opacity 140ms ease; }
    .badge:hover { transform: translateY(-1px); }
    .pp-toast {
      position: fixed; left: 50%; bottom: 18px; transform: translateX(-50%);
      padding: 10px 14px; border-radius: 12px; font-size: 14px;
      background: rgba(20, 25, 35, 0.92); color: white; z-index: 9999;
      box-shadow: 0 10px 25px rgba(0,0,0,.25);
      opacity: 0; pointer-events: none;
      transition: opacity 200ms ease, transform 200ms ease;
    }
    .pp-toast.show { opacity: 1; transform: translateX(-50%) translateY(-4px); }
    .pp-flash {
      animation: ppFlash 900ms ease-in-out 1;
    }
    @keyframes ppFlash {
      0% { filter: none; }
      30% { filter: drop-shadow(0 0 10px rgba(255, 170, 0, 0.55)); }
      100% { filter: none; }
    }
    .pp-focus-glow {
      box-shadow: 0 0 0 3px rgba(0, 190, 255, 0.18), 0 18px 60px rgba(0,0,0,0.18) !important;
    }
  `;
  const style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);
}

function toast(msg) {
  let el = document.querySelector(".pp-toast");
  if (!el) {
    el = document.createElement("div");
    el.className = "pp-toast";
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 1700);
}

function safeBeep() {
  // Small pleasant beep (no permissions needed)
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.value = 880;
    g.gain.value = 0.06;
    o.connect(g);
    g.connect(ctx.destination);
    o.start();
    setTimeout(() => {
      o.stop();
      ctx.close?.();
    }, 180);
  } catch {
    // ignore
  }
}

function todayKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function loadStats() {
  const raw = localStorage.getItem(statsKey);
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      stats.focusSecondsByDay = parsed.focusSecondsByDay || {};
      stats.lastFocusDay = parsed.lastFocusDay || null;
    }
  } catch {
    // ignore corrupted stats
  }
}

function saveStats() {
  localStorage.setItem(statsKey, JSON.stringify(stats));
}

function addFocusSeconds(seconds) {
  if (!seconds || seconds <= 0) return;
  const key = todayKey();
  stats.focusSecondsByDay[key] = (stats.focusSecondsByDay[key] || 0) + seconds;
  stats.lastFocusDay = key;
  saveStats();
}

function computeStreak() {
  // streak based on "focusSecondsByDay" (any focus counts)
  const map = stats.focusSecondsByDay || {};
  let streak = 0;

  let cursor = new Date();
  for (;;) {
    const k = todayKey(cursor);
    if ((map[k] || 0) > 0) {
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
    } else {
      break;
    }
  }
  return streak;
}

function focusMinutesToday() {
  const secs = stats.focusSecondsByDay[todayKey()] || 0;
  return Math.floor(secs / 60);
}

function saveTasks() {
  localStorage.setItem(storageKey, JSON.stringify(tasks));
}

function loadTasks() {
  const saved = localStorage.getItem(storageKey);
  if (saved) {
    try {
      tasks = JSON.parse(saved) || [];
      return;
    } catch {
      tasks = [];
    }
  }

  // Seed demo tasks on first run
  const now = Date.now();
  tasks = [
    {
      id: crypto.randomUUID(),
      title: "Draft Q1 roadmap summary",
      estimatedMinutes: 60,
      deadline: new Date(now + 6 * 60 * 60 * 1000).toISOString(),
      impact: "High",
      effort: 3,
      notes: "Exec summary + slides",
      dependencies: [],
      status: "active",
      completedAt: null,
      location: "any",
    },
    {
      id: crypto.randomUUID(),
      title: "Send follow-up emails to pilot customers",
      estimatedMinutes: 30,
      deadline: new Date(now + 30 * 60 * 1000).toISOString(),
      impact: "Medium",
      effort: 2,
      notes: "Include scheduling link",
      dependencies: [],
      status: "active",
      completedAt: null,
      location: "any",
    },
    {
      id: crypto.randomUUID(),
      title: "Refactor notification batching",
      estimatedMinutes: 120,
      deadline: new Date(now + 3 * 24 * 60 * 60 * 1000).toISOString(),
      impact: "High",
      effort: 4,
      notes: "Unblock mobile launch",
      dependencies: [],
      status: "active",
      completedAt: null,
      location: "office",
    },
  ];
  saveTasks();
}

function init() {
  injectUXPolishCSS();
  loadStats();
  loadTasks();

  bindImpactButtons();
  bindEffortStars();
  bindContextChips();
  bindForm();
  bindFocusControls();

  ui.priorityList?.addEventListener("click", priorityListClickHandler);

  renderDependencyOptions();
  computeAndRender();
  updateStats(); // ensure stats show immediately
}

function bindImpactButtons() {
  form.impactButtons?.addEventListener("click", (e) => {
    if (e.target.dataset.impact) {
      [...form.impactButtons.querySelectorAll(".chip")].forEach((btn) =>
        btn.classList.remove("active")
      );
      e.target.classList.add("active");
    }
  });
}

function bindEffortStars() {
  form.effortStars?.addEventListener("click", (e) => {
    const value = Number(e.target.dataset.value);
    if (!value) return;
    [...form.effortStars.children].forEach((star) => {
      star.classList.toggle("active", Number(star.dataset.value) <= value);
    });
    form.effortStars.dataset.value = value;
  });
  if (form.effortStars) form.effortStars.dataset.value = "2";
}

function bindContextChips() {
  const setActive = (wrapper, key) => {
    wrapper?.addEventListener("click", (e) => {
      if (!e.target.dataset.value) return;
      [...wrapper.querySelectorAll(".chip")].forEach((c) =>
        c.classList.remove("active")
      );
      e.target.classList.add("active");
      contextState[key] = e.target.dataset.value;
      computeAndRender();
    });
  };
  setActive(ui.timeChips, "time");
  setActive(ui.energyChips, "energy");
  setActive(ui.locationChips, "location");
}

function bindForm() {
  form.formEl?.addEventListener("submit", (e) => {
    e.preventDefault();

    const title = form.title?.value?.trim();
    if (!title) return;

    const impact =
      form.impactButtons?.querySelector(".active")?.dataset.impact || "High";

    const effort = Number(form.effortStars?.dataset.value || 2);
    const eta = Number(form.eta?.value || 15);

    const deadlineValue = form.deadline?.value
      ? new Date(form.deadline.value)
      : null;

    const selectedDeps = form.dependencies
      ? [...form.dependencies.selectedOptions].map((opt) => opt.value)
      : [];

    const newTask = {
      id: crypto.randomUUID(),
      title,
      estimatedMinutes: eta,
      deadline: deadlineValue ? deadlineValue.toISOString() : null,
      impact,
      effort,
      notes: form.notes?.value?.trim() || "",
      dependencies: selectedDeps,
      status: "active",
      completedAt: null,
      location: "any",
    };

    tasks.push(newTask);
    saveTasks();

    form.formEl.reset();
    if (form.effortStars) form.effortStars.dataset.value = "2";
    if (form.effortStars) {
      [...form.effortStars.children].forEach((star, idx) =>
        star.classList.toggle("active", idx < 2)
      );
    }

    renderDependencyOptions();
    computeAndRender();
    toast("Task added ✅");
  });

  ui.showPriorities?.addEventListener("click", () => computeAndRender());
}

function bindFocusControls() {
  ui.focusToggle?.addEventListener("click", () => {
    focusPanel.panel?.scrollIntoView({ behavior: "smooth" });
  });

  focusPanel.start?.addEventListener("click", startTimer);
  focusPanel.pause?.addEventListener("click", pauseTimer);
  focusPanel.reset?.addEventListener("click", resetTimer);

  focusPanel.complete?.addEventListener("click", () => {
    if (!focusState.taskId) return;
    completeTask(focusState.taskId);
    toast("Completed ✅");
  });

  focusPanel.defer?.addEventListener("click", () => {
    if (!focusState.taskId) return;
    deferTask(focusState.taskId);
    toast("Deferred to tomorrow ⏭️");
  });
}

function renderDependencyOptions() {
  if (!form.dependencies) return;

  form.dependencies.innerHTML = "";
  tasks
    .filter((t) => t.status === "active")
    .forEach((task) => {
      const opt = document.createElement("option");
      opt.value = task.id;
      opt.textContent = task.title;
      form.dependencies.appendChild(opt);
    });
}

function computeAndRender() {
  const active = tasks.filter((t) => t.status === "active");
  const eligible = active.filter((t) => matchesContext(t, contextState));
  const parked = active.filter((t) => !eligible.includes(t));

  const scored = eligible
    .map((task) => {
      const scoring = scoreTask(task, contextState);
      return { task, ...scoring };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  renderPriorityList(scored);
  renderParkedList(parked);
  updateStats();
  renderSuggestions(scored, parked);

  // Focus auto-pick when none selected
  const top = scored[0]?.task;
  if (top && !focusState.taskId) {
    setFocusTask(top.id, "Auto-selected top task");
  } else if (!top) {
    clearFocus();
  }
}

function matchesContext(task, ctx) {
  const timeOk =
    ctx.time === "120" || Number(task.estimatedMinutes) <= Number(ctx.time);

  const energyOk =
    ctx.energy === "high" ||
    (ctx.energy === "medium" ? task.effort <= 4 : task.effort <= 2);

  const locationOk =
    !task.location || task.location === "any" || task.location === ctx.location;

  return timeOk && energyOk && locationOk;
}

// Scoring: weighted + quick-win bonus
function scoreTask(task, ctx) {
  const now = Date.now();

  let deadlineFactor = 0.15;
  if (task.deadline) {
    const diffHours = (new Date(task.deadline).getTime() - now) / 3600000;
    if (diffHours <= 0) deadlineFactor = 1;
    else if (diffHours <= 24) deadlineFactor = 0.9;
    else if (diffHours <= 72) deadlineFactor = 0.7;
    else if (diffHours <= 168) deadlineFactor = 0.45;
    else deadlineFactor = 0.2;
  }

  const impactFactor =
    { High: 1, Medium: 0.65, Low: 0.35 }[task.impact] || 0.5;

  const effortToValue = clamp(
    (impactFactor * 1.4) / Math.max(task.effort, 1),
    0,
    1
  );

  const dependencyCount = tasks.filter(
    (t) => t.dependencies?.includes(task.id) && t.status === "active"
  ).length;

  const dependencyFactor = tasks.length
    ? clamp(dependencyCount / Math.max(tasks.length - 1, 1), 0, 1)
    : 0;

  const contextFactor = contextScore(task, ctx);

  let quickWinBonus = 0;
  if (task.estimatedMinutes <= 30) quickWinBonus = 0.15;

  // Small penalty if time is tight and task is big (feels more human)
  let timeMismatchPenalty = 0;
  if (ctx.time !== "120") {
    const t = Number(ctx.time);
    if (task.estimatedMinutes > t) timeMismatchPenalty = 0.12;
  }

  const baseScore =
    deadlineFactor * 0.3 +
    impactFactor * 0.35 +
    effortToValue * 0.2 +
    dependencyFactor * 0.1 +
    contextFactor * 0.05 +
    quickWinBonus -
    timeMismatchPenalty;

  return {
    score: Math.round(clamp(baseScore, 0, 1.4) * 100),
    breakdown: {
      deadlineFactor,
      impactFactor,
      effortToValue,
      dependencyFactor,
      contextFactor,
      quickWinBonus,
      timeMismatchPenalty,
    },
    badges: buildBadges(task, {
      deadlineFactor,
      impactFactor,
      effortToValue,
      dependencyFactor,
      contextFactor,
      quickWinBonus,
      timeMismatchPenalty,
    }),
    reasoning: buildReasoning(task, {
      deadlineFactor,
      impactFactor,
      effortToValue,
      dependencyFactor,
      contextFactor,
      quickWinBonus,
      timeMismatchPenalty,
    }),
  };
}

function contextScore(task, ctx) {
  let score = 1;
  if (ctx.time !== "120" && Number(task.estimatedMinutes) > Number(ctx.time)) {
    score -= 0.5;
  }
  if (ctx.energy === "low" && task.effort >= 4) score -= 0.4;
  if (ctx.energy === "medium" && task.effort === 5) score -= 0.2;
  if (task.location && task.location !== "any" && task.location !== ctx.location) {
    score -= 0.35;
  }
  return clamp(score, 0, 1);
}

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

function buildBadges(task, factors) {
  const badges = [];
  if (factors.deadlineFactor >= 0.7) badges.push({ label: "Due soon", className: "due" });
  if (task.impact === "High") badges.push({ label: "High impact", className: "impact" });
  if (task.estimatedMinutes <= 30) badges.push({ label: "Quick win", className: "quick" });
  if (factors.dependencyFactor > 0) badges.push({ label: "Unblocks others", className: "dependency" });
  if (factors.contextFactor >= 0.7) badges.push({ label: "Context fit", className: "context" });
  if (factors.timeMismatchPenalty > 0) badges.push({ label: "Too big now", className: "parked" });
  return badges;
}

function buildReasoning(task, factors) {
  const reasons = [];
  if (factors.dependencyFactor > 0) reasons.push("blocks other tasks");
  if (task.impact === "High") reasons.push("high impact");
  if (task.deadline && factors.deadlineFactor >= 0.45) reasons.push("time-sensitive");
  if (task.estimatedMinutes <= Number(contextState.time) || contextState.time === "120")
    reasons.push("fits your time window");
  if (task.effort <= 2) reasons.push("low effort win");
  if (factors.timeMismatchPenalty > 0) reasons.push("bigger than your current window");
  if (!reasons.length) reasons.push("balanced pick for today");
  return reasons;
}

function renderPriorityList(scored) {
  if (!ui.priorityList) return;
  ui.priorityList.innerHTML = "";

  if (!scored.length) {
    ui.priorityList.innerHTML =
      '<p class="muted">No tasks match this context. Try adjusting filters.</p>';
    return;
  }

  const maxScore = Math.max(...scored.map((s) => s.score), 1);

  scored.forEach(({ task, score, badges, reasoning }, idx) => {
    const card = document.createElement("div");
    card.className = "task-card";

    const dueText = task.deadline ? formatDeadline(task.deadline) : "No deadline";
    const reasons = reasoning.join(", ");

    card.innerHTML = `
      <div class="task-actions">
        <label><input type="checkbox" data-complete="${task.id}"> Done</label>
        <button data-focus="${task.id}" class="primary">Focus</button>
        <button data-defer="${task.id}">Defer</button>
      </div>
      <div class="task-main">
        <h4>${idx + 1}. ${task.title}</h4>
        <p>${dueText} • ${task.estimatedMinutes} min • Impact ${task.impact} • Effort ${task.effort}/5</p>
        <div class="badge-row">
          ${badges.map((b) => `<span class="badge ${b.className}">${b.label}</span>`).join("")}
        </div>
        <p class="muted">Why prioritized: ${reasons}</p>
      </div>
      <div class="score">
        <div class="score-number">${score}</div>
        <div class="progress">
          <div class="progress-bar" style="width:${Math.round((score / maxScore) * 100)}%"></div>
        </div>
      </div>
    `;

    // UI polish: highlight top task a bit
    if (idx === 0) card.classList.add("pp-focus-glow");

    ui.priorityList.appendChild(card);
  });
}

function priorityListClickHandler(e) {
  const completeId = e.target?.dataset?.complete;
  const deferId = e.target?.dataset?.defer;
  const focusId = e.target?.dataset?.focus;

  if (completeId) {
    completeTask(completeId);
    toast("Completed ✅");
  }
  if (deferId) {
    deferTask(deferId);
    toast("Deferred to tomorrow ⏭️");
  }
  if (focusId) {
    setFocusTask(focusId, "Pinned from list");
    toast("Focus set 🎯");
  }
}

function renderParkedList(list) {
  if (!ui.parkedList) return;
  ui.parkedList.innerHTML = "";

  if (!list.length) {
    ui.parkedList.innerHTML = '<p class="muted">All tasks fit your current context.</p>';
    return;
  }

  list.forEach((task) => {
    const div = document.createElement("div");
    div.className = "parked-item";
    div.textContent = `${task.title} • ${task.estimatedMinutes} min • Effort ${task.effort}`;
    ui.parkedList.appendChild(div);
  });
}

function updateStats() {
  const today = new Date();
  const completedToday = tasks.filter(
    (t) =>
      t.status === "completed" &&
      t.completedAt &&
      new Date(t.completedAt).toDateString() === today.toDateString()
  );

  if (ui.completedCount) ui.completedCount.textContent = completedToday.length;
  if (ui.remainingCount) ui.remainingCount.textContent = tasks.filter((t) => t.status === "active").length;
  if (ui.quickWins)
    ui.quickWins.textContent = tasks.filter((t) => t.status === "active" && t.estimatedMinutes <= 30).length;

  // Optional extra stats slots (if you added them in HTML)
  if (ui.focusMinutesToday) ui.focusMinutesToday.textContent = focusMinutesToday();
  if (ui.streakCount) ui.streakCount.textContent = computeStreak();
}

function renderSuggestions(scored, parked) {
  if (!ui.suggestionList) return;

  const suggestions = [];

  // 1) quick wins
  const quickWins = tasks.filter((t) => t.status === "active" && t.estimatedMinutes <= 30);
  if (quickWins.length) suggestions.push(`You have ${quickWins.length} quick wins ready for short breaks.`);

  // 2) high-impact heavy tasks (schedule suggestion)
  const heavyHighImpact = tasks.filter(
    (t) => t.status === "active" && t.impact === "High" && t.effort >= 4
  );
  if (heavyHighImpact.length) {
    const when = contextState.energy === "low" ? "tomorrow morning" : "your next high-energy block";
    suggestions.push(`You have ${heavyHighImpact.length} high-impact heavy tasks—schedule them for ${when}.`);
  }

  // 3) batching suggestion (same type)
  const emailLike = tasks.filter((t) => t.status === "active" && /email|follow-up|follow up/i.test(t.title));
  if (emailLike.length >= 2) suggestions.push("Batch your email/follow-up tasks together to reduce context switching.");

  // 4) parked due to context
  if (parked.length) suggestions.push(`There are ${parked.length} tasks parked for later due to context.`);

  // 5) blockers
  const blockers = tasks.filter((t) =>
    tasks.some((other) => other.dependencies?.includes(t.id) && other.status === "active")
  );
  if (blockers.length) suggestions.push("Clearing blocker tasks will unlock more work.");

  // 6) top reasons
  const topReason = scored[0]?.reasoning?.slice(0, 2).join(", ");
  if (topReason) suggestions.push(`Top pick because: ${topReason}.`);

  // 7) optional “AI-ready” hook (no API)
  const aiHint = getAISuggestionsPlaceholder(buildAIPayload());
  if (aiHint) suggestions.push(aiHint);

  ui.suggestionList.innerHTML = "";
  if (!suggestions.length) {
    ui.suggestionList.innerHTML = "<li>No suggestions right now—add tasks to get guidance.</li>";
    return;
  }
  suggestions.forEach((s) => {
    const li = document.createElement("li");
    li.textContent = s;
    ui.suggestionList.appendChild(li);
  });
}

// Focus Mode + Pomodoro
function setFocusTask(id, reason) {
  const task = tasks.find((t) => t.id === id);
  if (!task) return;

  focusState.taskId = id;
  focusState.phase = "work";
  focusState.running = false;
  focusState.tickLast = null;

  clearInterval(focusState.timerId);

  focusState.remaining = (task.estimatedMinutes || 25) * 60;

  if (focusPanel.title) focusPanel.title.textContent = task.title;
  if (focusPanel.eta) focusPanel.eta.textContent = `${task.estimatedMinutes} min`;
  if (focusPanel.impact) focusPanel.impact.textContent = task.impact;
  if (focusPanel.deadline) focusPanel.deadline.textContent = task.deadline ? formatDeadline(task.deadline) : "No deadline";
  if (focusPanel.reason) focusPanel.reason.textContent = reason || "Top-ranked task selected.";
  if (focusPanel.status) focusPanel.status.textContent = "Ready";
  if (focusPanel.phaseChip) focusPanel.phaseChip.textContent = "Work";

  updateTimerDisplay();
}

function clearFocus() {
  focusState.taskId = null;
  focusState.running = false;
  focusState.phase = "work";
  focusState.tickLast = null;
  clearInterval(focusState.timerId);

  if (focusPanel.title) focusPanel.title.textContent = "Pick a task to focus";
  if (focusPanel.reason) focusPanel.reason.textContent = "The top-ranked task will land here with a timer.";
  if (focusPanel.status) focusPanel.status.textContent = "Idle";
  if (focusPanel.eta) focusPanel.eta.textContent = "—";
  if (focusPanel.impact) focusPanel.impact.textContent = "—";
  if (focusPanel.deadline) focusPanel.deadline.textContent = "—";
  if (focusPanel.timerDisplay) focusPanel.timerDisplay.textContent = "00:00";
  if (focusPanel.phaseChip) focusPanel.phaseChip.textContent = "—";
}

function startTimer() {
  if (!focusState.taskId) return;
  if (focusState.running) return;

  focusState.running = true;
  focusState.tickLast = Date.now();
  if (focusPanel.status) focusPanel.status.textContent = focusState.phase === "work" ? "In progress" : "On break";

  focusState.timerId = setInterval(() => {
    const now = Date.now();
    const deltaSec = Math.max(0, Math.floor((now - (focusState.tickLast || now)) / 1000));
    focusState.tickLast = now;

    // Track focus time only during work phase
    if (focusState.phase === "work" && deltaSec > 0) {
      addFocusSeconds(deltaSec);
    }

    focusState.remaining = Math.max(0, focusState.remaining - 1);
    updateTimerDisplay();

    if (focusState.remaining === 0) {
      onTimerFinished();
    }
  }, 1000);

  toast(focusState.phase === "work" ? "Timer started ⏱️" : "Break started ☕");
}

function pauseTimer() {
  focusState.running = false;
  focusState.tickLast = null;
  clearInterval(focusState.timerId);
  if (focusPanel.status) focusPanel.status.textContent = "Paused";
  toast("Paused ⏸️");
}

function resetTimer() {
  if (!focusState.taskId) return;

  const task = tasks.find((t) => t.id === focusState.taskId);
  pauseTimer();

  focusState.phase = "work";
  focusState.remaining = (task?.estimatedMinutes || 25) * 60;

  if (focusPanel.phaseChip) focusPanel.phaseChip.textContent = "Work";
  if (focusPanel.status) focusPanel.status.textContent = "Ready";

  updateTimerDisplay();
  toast("Reset 🔄");
}

function onTimerFinished() {
  pauseTimer();

  document.body.classList.add("pp-flash");
  setTimeout(() => document.body.classList.remove("pp-flash"), 950);
  safeBeep();

  if (focusState.phase === "work") {
    // 1️⃣ Auto-complete when work timer ends
    if (focusState.taskId) {
      completeTask(focusState.taskId);
      toast("Work session done ✅ Task auto-completed");
    }

    // 2️⃣ Start break (short or long)
    focusState.pomodorosDone += 1;
    const isLong = focusState.pomodorosDone % focusState.longBreakEvery === 0;
    focusState.phase = "break";
    focusState.remaining = isLong ? focusState.longBreakSeconds : focusState.shortBreakSeconds;

    if (focusPanel.phaseChip) focusPanel.phaseChip.textContent = isLong ? "Long Break" : "Short Break";
    if (focusPanel.status) focusPanel.status.textContent = "Break";

    updateTimerDisplay();
    toast(isLong ? "Long break ⛱️" : "Short break ☕");
    // auto-start break for smoother flow
    startTimer();
    return;
  }

  // Break finished → pick next top task
  focusState.phase = "work";
  if (focusPanel.phaseChip) focusPanel.phaseChip.textContent = "Work";
  if (focusPanel.status) focusPanel.status.textContent = "Ready";

  focusState.taskId = null; // allow auto-pick in computeAndRender
  computeAndRender();
  toast("Break finished. Back to work 💪");
}

function updateTimerDisplay() {
  if (!focusPanel.timerDisplay) return;

  const minutes = Math.floor(focusState.remaining / 60)
    .toString()
    .padStart(2, "0");
  const seconds = Math.floor(focusState.remaining % 60)
    .toString()
    .padStart(2, "0");

  focusPanel.timerDisplay.textContent = `${minutes}:${seconds}`;
}

function completeTask(id) {
  const task = tasks.find((t) => t.id === id);
  if (!task) return;

  task.status = "completed";
  task.completedAt = new Date().toISOString();

  if (focusState.taskId === id) {
    // keep focus panel usable, but allow next pick
    focusState.taskId = null;
  }

  saveTasks();
  renderDependencyOptions();
  computeAndRender();
}

function deferTask(id) {
  const task = tasks.find((t) => t.id === id);
  if (!task) return;

  const base = task.deadline ? new Date(task.deadline).getTime() : Date.now();
  task.deadline = new Date(base + 24 * 60 * 60 * 1000).toISOString();
  task.status = "active";

  saveTasks();
  computeAndRender();
}

function formatDeadline(deadline) {
  const date = new Date(deadline);
  const diff = date.getTime() - Date.now();
  const hours = Math.round(diff / 3600000);
  if (hours < 0) return "Overdue";
  if (hours < 24) return `Due in ${hours}h`;
  const days = Math.round(hours / 24);
  return `Due in ${days}d`;
}

// ===== Prep-for-AI (SAFE STUBS — no keys, no network) =====
function buildAIPayload() {
  return {
    context: { ...contextState },
    tasks: tasks
      .filter((t) => t.status === "active")
      .map((t) => ({
        id: t.id,
        title: t.title,
        minutes: t.estimatedMinutes,
        deadline: t.deadline,
        impact: t.impact,
        effort: t.effort,
        dependencies: t.dependencies || [],
      })),
    generatedAt: new Date().toISOString(),
  };
}

function getAISuggestionsPlaceholder(payload) {
  // No API. Just a "shape" so we can plug real AI later cleanly.
  // Return null most of the time to avoid noise.
  const activeCount = payload.tasks.length;
  if (activeCount >= 10) return "Tip: With 10+ tasks, use smaller time windows to reduce decision overload.";
  return null;
}

document.addEventListener("DOMContentLoaded", init);
