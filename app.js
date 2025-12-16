const storageKey = "priorityPilotTasks";
let tasks = [];
let contextState = { time: "15", energy: "high", location: "any" };
let focusState = { taskId: null, timerId: null, remaining: 0, running: false };

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
};

function loadTasks() {
  const saved = localStorage.getItem(storageKey);
  if (saved) {
    tasks = JSON.parse(saved);
    return;
  }
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

function saveTasks() {
  localStorage.setItem(storageKey, JSON.stringify(tasks));
}

function init() {
  loadTasks();
  bindImpactButtons();
  bindEffortStars();
  bindContextChips();
  bindForm();
  bindFocusControls();
  ui.priorityList.addEventListener("click", priorityListClickHandler);
  renderDependencyOptions();
  computeAndRender();
}

function bindImpactButtons() {
  form.impactButtons.addEventListener("click", (e) => {
    if (e.target.dataset.impact) {
      [...form.impactButtons.querySelectorAll(".chip")].forEach((btn) =>
        btn.classList.remove("active")
      );
      e.target.classList.add("active");
    }
  });
}

function bindEffortStars() {
  form.effortStars.addEventListener("click", (e) => {
    const value = Number(e.target.dataset.value);
    if (!value) return;
    [...form.effortStars.children].forEach((star) => {
      star.classList.toggle("active", Number(star.dataset.value) <= value);
    });
    form.effortStars.dataset.value = value;
  });
  form.effortStars.dataset.value = "2";
}

function bindContextChips() {
  const setActive = (wrapper, key) => {
    wrapper.addEventListener("click", (e) => {
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
  form.formEl.addEventListener("submit", (e) => {
    e.preventDefault();
    const title = form.title.value.trim();
    if (!title) return;
    const impact =
      form.impactButtons.querySelector(".active")?.dataset.impact || "High";
    const effort = Number(form.effortStars.dataset.value || 2);
    const eta = Number(form.eta.value);
    const deadlineValue = form.deadline.value ? new Date(form.deadline.value) : null;
    const selectedDeps = [...form.dependencies.selectedOptions].map(
      (opt) => opt.value
    );
    const newTask = {
      id: crypto.randomUUID(),
      title,
      estimatedMinutes: eta,
      deadline: deadlineValue ? deadlineValue.toISOString() : null,
      impact,
      effort,
      notes: form.notes.value.trim(),
      dependencies: selectedDeps,
      status: "active",
      completedAt: null,
      location: "any",
    };
    tasks.push(newTask);
    saveTasks();
    form.formEl.reset();
    form.effortStars.dataset.value = "2";
    [...form.effortStars.children].forEach((star, idx) =>
      star.classList.toggle("active", idx < 2)
    );
    renderDependencyOptions();
    computeAndRender();
  });

  ui.showPriorities.addEventListener("click", () => computeAndRender());
}

function bindFocusControls() {
  ui.focusToggle.addEventListener("click", () => {
    focusPanel.panel.scrollIntoView({ behavior: "smooth" });
  });
  focusPanel.start.addEventListener("click", startTimer);
  focusPanel.pause.addEventListener("click", pauseTimer);
  focusPanel.reset.addEventListener("click", resetTimer);
  focusPanel.complete.addEventListener("click", () => {
    if (!focusState.taskId) return;
    completeTask(focusState.taskId);
  });
  focusPanel.defer.addEventListener("click", () => {
    if (!focusState.taskId) return;
    deferTask(focusState.taskId);
  });
}

function renderDependencyOptions() {
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
  const impactFactor = { High: 1, Medium: 0.65, Low: 0.35 }[task.impact] || 0.5;
  const effortToValue = clamp((impactFactor * 1.4) / Math.max(task.effort, 1), 0, 1);
  const dependencyCount = tasks.filter(
    (t) => t.dependencies?.includes(task.id) && t.status === "active"
  ).length;
  const dependencyFactor = tasks.length
    ? clamp(dependencyCount / Math.max(tasks.length - 1, 1), 0, 1)
    : 0;
  const contextFactor = contextScore(task, ctx);
  const baseScore =
    deadlineFactor * 0.3 +
    impactFactor * 0.35 +
    effortToValue * 0.2 +
    dependencyFactor * 0.1 +
    contextFactor * 0.05;
  return {
    score: Math.round(baseScore * 100),
    breakdown: { deadlineFactor, impactFactor, effortToValue, dependencyFactor, contextFactor },
    badges: buildBadges(task, { deadlineFactor, impactFactor, effortToValue, dependencyFactor, contextFactor }),
    reasoning: buildReasoning(task, { deadlineFactor, impactFactor, effortToValue, dependencyFactor, contextFactor }),
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
  return badges;
}

function buildReasoning(task, factors) {
  const reasons = [];
  if (factors.dependencyFactor > 0) reasons.push("blocks other tasks");
  if (task.impact === "High") reasons.push("high impact");
  if (task.deadline && factors.deadlineFactor >= 0.45) reasons.push("time-sensitive");
  if (task.estimatedMinutes <= Number(contextState.time)) reasons.push("fits your time window");
  if (task.effort <= 2) reasons.push("low effort win");
  if (!reasons.length) reasons.push("balanced pick for today");
  return reasons;
}

function renderPriorityList(scored) {
  ui.priorityList.innerHTML = "";
  if (!scored.length) {
    ui.priorityList.innerHTML = '<p class="muted">No tasks match this context. Try adjusting filters.</p>';
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
          ${badges
            .map((b) => `<span class="badge ${b.className}">${b.label}</span>`)
            .join("")}
        </div>
        <p class="muted">Why prioritized: ${reasons}</p>
      </div>
      <div class="score">
        <div class="score-number">${score}</div>
        <div class="progress"><div class="progress-bar" style="width:${Math.round(
          (score / maxScore) * 100
        )}%"></div></div>
      </div>
    `;
    ui.priorityList.appendChild(card);
  });
}

function priorityListClickHandler(e) {
  const completeId = e.target.dataset.complete;
  const deferId = e.target.dataset.defer;
  const focusId = e.target.dataset.focus;
  if (completeId) completeTask(completeId);
  if (deferId) deferTask(deferId);
  if (focusId) setFocusTask(focusId, "Pinned from list");
}

function renderParkedList(list) {
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
  ui.completedCount.textContent = completedToday.length;
  ui.remainingCount.textContent = tasks.filter((t) => t.status === "active").length;
  ui.quickWins.textContent = tasks.filter(
    (t) => t.status === "active" && t.estimatedMinutes <= 30
  ).length;
}

function renderSuggestions(scored, parked) {
  const suggestions = [];
  const quickWins = tasks.filter(
    (t) => t.status === "active" && t.estimatedMinutes <= 30
  );
  if (quickWins.length) {
    suggestions.push(`You have ${quickWins.length} quick wins ready for short breaks.`);
  }
  const highImpact = tasks.filter((t) => t.status === "active" && t.impact === "High");
  if (highImpact.length) {
    suggestions.push("Schedule high-impact items during your peak energy window today.");
  }
  if (parked.length) {
    suggestions.push(`There are ${parked.length} tasks parked for later due to context.`);
  }
  const blockers = tasks.filter((t) =>
    tasks.some((other) => other.dependencies?.includes(t.id) && other.status === "active")
  );
  if (blockers.length) suggestions.push("Clearing blocker tasks will unlock more work.");
  const topReason = scored[0]?.reasoning?.slice(0, 2).join(", ");
  if (topReason) suggestions.push(`Top pick because: ${topReason}.`);

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

function setFocusTask(id, reason) {
  const task = tasks.find((t) => t.id === id);
  if (!task) return;
  focusState.taskId = id;
  focusState.remaining = (task.estimatedMinutes || 25) * 60;
  focusState.running = false;
  clearInterval(focusState.timerId);
  focusPanel.title.textContent = task.title;
  focusPanel.eta.textContent = `${task.estimatedMinutes} min`;
  focusPanel.impact.textContent = task.impact;
  focusPanel.deadline.textContent = task.deadline ? formatDeadline(task.deadline) : "No deadline";
  focusPanel.reason.textContent = reason || "Top-ranked task selected.";
  focusPanel.status.textContent = "Ready";
  updateTimerDisplay();
}

function clearFocus() {
  focusState.taskId = null;
  focusState.running = false;
  clearInterval(focusState.timerId);
  focusPanel.title.textContent = "Pick a task to focus";
  focusPanel.reason.textContent = "The top-ranked task will land here with a timer.";
  focusPanel.status.textContent = "Idle";
  focusPanel.eta.textContent = "—";
  focusPanel.impact.textContent = "—";
  focusPanel.deadline.textContent = "—";
  focusPanel.timerDisplay.textContent = "00:00";
}

function startTimer() {
  if (!focusState.taskId) return;
  if (focusState.running) return;
  focusState.running = true;
  focusPanel.status.textContent = "In progress";
  focusState.timerId = setInterval(() => {
    focusState.remaining = Math.max(0, focusState.remaining - 1);
    updateTimerDisplay();
    if (focusState.remaining === 0) {
      pauseTimer();
    }
  }, 1000);
}

function pauseTimer() {
  focusState.running = false;
  clearInterval(focusState.timerId);
  focusPanel.status.textContent = "Paused";
}

function resetTimer() {
  if (!focusState.taskId) return;
  const task = tasks.find((t) => t.id === focusState.taskId);
  focusState.remaining = (task?.estimatedMinutes || 25) * 60;
  updateTimerDisplay();
  pauseTimer();
  focusPanel.status.textContent = "Ready";
}

function updateTimerDisplay() {
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
  if (focusState.taskId === id) clearFocus();
  saveTasks();
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

document.addEventListener("DOMContentLoaded", init);
