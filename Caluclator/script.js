/**
 * Basic Calculator — core logic, keyboard support, history, and preferences.
 */

(function () {
  "use strict";

  // ---------------------------------------------------------------------------
  // DOM references
  // ---------------------------------------------------------------------------

  const currentDisplay = document.getElementById("currentDisplay");
  const previousDisplay = document.getElementById("previousDisplay");
  const errorDisplay = document.getElementById("errorDisplay");
  const historyPanel = document.getElementById("historyPanel");
  const historyList = document.getElementById("historyList");
  const historyEmpty = document.getElementById("historyEmpty");
  const themeToggle = document.getElementById("themeToggle");
  const soundToggle = document.getElementById("soundToggle");
  const historyToggle = document.getElementById("historyToggle");
  const clearHistoryBtn = document.getElementById("clearHistory");
  const buttons = document.querySelectorAll(".keypad .btn");

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  let currentValue = "0";
  let previousExpression = "";
  let lastOperator = null;
  let waitingForOperand = false;
  let hasError = false;

  const STORAGE_KEYS = {
    theme: "calc-theme",
    sound: "calc-sound",
    history: "calc-history",
    historyOpen: "calc-history-open",
  };

  let soundEnabled = loadSoundPreference();
  let history = loadHistory();

  // ---------------------------------------------------------------------------
  // Audio (Web Audio API — no external files)
  // ---------------------------------------------------------------------------

  let audioContext = null;

  function getAudioContext() {
    if (!audioContext) {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    return audioContext;
  }

  function playClickSound() {
    if (!soundEnabled) return;
    try {
      const ctx = getAudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 520;
      osc.type = "sine";
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.06);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.06);
    } catch {
      /* Audio not available */
    }
  }

  function playErrorSound() {
    if (!soundEnabled) return;
    try {
      const ctx = getAudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 180;
      osc.type = "square";
      gain.gain.setValueAtTime(0.06, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.15);
    } catch {
      /* Audio not available */
    }
  }

  // ---------------------------------------------------------------------------
  // Display updates
  // ---------------------------------------------------------------------------

  function updateDisplay() {
    currentDisplay.textContent = formatDisplayNumber(currentValue);
    currentDisplay.classList.toggle("display__current--error", hasError);
    previousDisplay.textContent = previousExpression;
    errorDisplay.hidden = !errorDisplay.textContent;
  }

  function formatDisplayNumber(value) {
    if (value === "Error" || hasError) return "Error";
    const num = parseFloat(value);
    if (Number.isNaN(num)) return value;
    if (Math.abs(num) >= 1e12 || (Math.abs(num) < 1e-6 && num !== 0)) {
      return num.toExponential(6).replace(/\.?0+e/, "e");
    }
    const str = String(value);
    if (str.includes(".") && str.length > 12) {
      return num.toPrecision(10).replace(/\.?0+$/, "");
    }
    if (str.replace("-", "").length > 12) {
      return num.toPrecision(10);
    }
    return str;
  }

  function showError(message) {
    hasError = true;
    currentValue = "Error";
    errorDisplay.textContent = message;
    playErrorSound();
    updateDisplay();
  }

  function clearError() {
    hasError = false;
    errorDisplay.textContent = "";
    currentDisplay.classList.remove("display__current--error");
  }

  // ---------------------------------------------------------------------------
  // Input handlers
  // ---------------------------------------------------------------------------

  function inputNumber(digit) {
    if (hasError) resetAll();
    playClickSound();

    if (waitingForOperand) {
      currentValue = digit;
      waitingForOperand = false;
    } else {
      currentValue = currentValue === "0" ? digit : currentValue + digit;
    }

    if (currentValue.replace("-", "").length > 15) {
      showError("Number too long");
      return;
    }

    updateDisplay();
  }

  function inputDecimal() {
    if (hasError) resetAll();
    playClickSound();

    if (waitingForOperand) {
      currentValue = "0.";
      waitingForOperand = false;
      updateDisplay();
      return;
    }

    if (!currentValue.includes(".")) {
      currentValue += ".";
    }

    updateDisplay();
  }

  function inputOperator(operator) {
    if (hasError) resetAll();
    playClickSound();

    const inputValue = parseFloat(currentValue);

    if (lastOperator && !waitingForOperand) {
      const leftValue = parseFloat(previousExpression.split(" ")[0]);
      const result = calculate(leftValue, inputValue, lastOperator);
      if (result === null) return;

      currentValue = String(result);
      previousExpression = `${formatDisplayNumber(currentValue)} ${operatorSymbol(lastOperator)}`;
    } else if (waitingForOperand && lastOperator) {
      previousExpression = previousExpression.replace(
        /\s[+\−×÷]$/,
        ` ${operatorSymbol(operator)}`
      );
      lastOperator = operator;
      updateDisplay();
      return;
    } else {
      previousExpression = `${formatDisplayNumber(currentValue)} ${operatorSymbol(operator)}`;
    }

    lastOperator = operator;
    waitingForOperand = true;
    updateDisplay();
  }

  function operatorSymbol(op) {
    const map = { "+": "+", "-": "−", "*": "×", "/": "÷" };
    return map[op] || op;
  }

  function calculate(leftValue, rightValue, operator) {
    let result;

    switch (operator) {
      case "+":
        result = leftValue + rightValue;
        break;
      case "-":
        result = leftValue - rightValue;
        break;
      case "*":
        result = leftValue * rightValue;
        break;
      case "/":
        if (rightValue === 0) {
          showError("Cannot divide by zero");
          return null;
        }
        result = leftValue / rightValue;
        break;
      default:
        return rightValue;
    }

    if (!Number.isFinite(result)) {
      showError("Invalid result");
      return null;
    }

    return roundResult(result);
  }

  function roundResult(num) {
    return Math.round((num + Number.EPSILON) * 1e10) / 1e10;
  }

  function performEquals() {
    if (hasError) return;
    if (!lastOperator || waitingForOperand) {
      playClickSound();
      return;
    }

    playClickSound();

    const leftValue = parseFloat(previousExpression.split(" ")[0]) || 0;
    const rightValue = parseFloat(currentValue);
    const op = lastOperator;
    const fullExpression = `${formatDisplayNumber(String(leftValue))} ${operatorSymbol(op)} ${formatDisplayNumber(currentValue)}`;

    const result = calculate(leftValue, rightValue, op);
    if (result === null) return;

    addToHistory(fullExpression + " =", String(result));

    previousExpression = fullExpression + " =";
    currentValue = String(result);
    lastOperator = null;
    waitingForOperand = true;
    updateDisplay();
  }

  function clearAll() {
    playClickSound();
    resetAll();
    updateDisplay();
  }

  function resetAll() {
    clearError();
    currentValue = "0";
    previousExpression = "";
    lastOperator = null;
    waitingForOperand = false;
  }

  function deleteLast() {
    if (hasError) {
      resetAll();
      updateDisplay();
      return;
    }

    playClickSound();

    if (waitingForOperand) {
      waitingForOperand = false;
      lastOperator = null;
      previousExpression = "";
      updateDisplay();
      return;
    }

    if (currentValue.length <= 1 || (currentValue.length === 2 && currentValue.startsWith("-"))) {
      currentValue = "0";
    } else {
      currentValue = currentValue.slice(0, -1);
    }

    updateDisplay();
  }

  // ---------------------------------------------------------------------------
  // History
  // ---------------------------------------------------------------------------

  function addToHistory(expression, result) {
    history.unshift({ expression, result, time: Date.now() });
    if (history.length > 50) history.pop();
    saveHistory();
    renderHistory();
  }

  function renderHistory() {
    historyList.innerHTML = "";
    const hasItems = history.length > 0;
    historyEmpty.classList.toggle("history-empty--hidden", hasItems);

    history.forEach((item, index) => {
      const li = document.createElement("li");
      li.className = "history-item";
      li.setAttribute("role", "listitem");
      li.innerHTML = `
        <div class="history-item__expr">${escapeHtml(item.expression)}</div>
        <div class="history-item__result">= ${escapeHtml(formatDisplayNumber(item.result))}</div>
      `;
      li.addEventListener("click", () => {
        currentValue = item.result;
        previousExpression = item.expression;
        waitingForOperand = true;
        hasError = false;
        clearError();
        updateDisplay();
        playClickSound();
      });
      historyList.appendChild(li);
    });
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  function loadHistory() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.history);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  function saveHistory() {
    try {
      localStorage.setItem(STORAGE_KEYS.history, JSON.stringify(history));
    } catch {
      /* Storage full or disabled */
    }
  }

  // ---------------------------------------------------------------------------
  // Theme & preferences
  // ---------------------------------------------------------------------------

  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    try {
      localStorage.setItem(STORAGE_KEYS.theme, theme);
    } catch {
      /* ignore */
    }
  }

  function loadTheme() {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.theme);
      if (saved === "dark" || saved === "light") return saved;
    } catch {
      /* ignore */
    }
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  function loadSoundPreference() {
    try {
      return localStorage.getItem(STORAGE_KEYS.sound) !== "false";
    } catch {
      return true;
    }
  }

  function updateSoundUI() {
    document.body.classList.toggle("sound-disabled", !soundEnabled);
    try {
      localStorage.setItem(STORAGE_KEYS.sound, String(soundEnabled));
    } catch {
      /* ignore */
    }
  }

  // ---------------------------------------------------------------------------
  // Button actions
  // ---------------------------------------------------------------------------

  function handleButtonClick(btn) {
    const action = btn.dataset.action;
    const value = btn.dataset.value;

    if (audioContext && audioContext.state === "suspended") {
      audioContext.resume();
    }

    switch (action) {
      case "number":
        inputNumber(value);
        break;
      case "decimal":
        inputDecimal();
        break;
      case "operator":
        inputOperator(value);
        break;
      case "equals":
        performEquals();
        break;
      case "clear":
        clearAll();
        break;
      case "delete":
        deleteLast();
        break;
      default:
        break;
    }
  }

  // ---------------------------------------------------------------------------
  // Keyboard support
  // ---------------------------------------------------------------------------

  const keyMap = {
    "0": "0",
    "1": "1",
    "2": "2",
    "3": "3",
    "4": "4",
    "5": "5",
    "6": "6",
    "7": "7",
    "8": "8",
    "9": "9",
    ".": ".",
    "+": "+",
    "-": "-",
    "*": "*",
    "/": "/",
  };

  function findButtonByKey(key) {
    return document.querySelector(`.keypad .btn[data-key="${key}"]`);
  }

  function highlightButton(btn) {
    if (!btn) return;
    btn.classList.add("btn--key-active");
    setTimeout(() => btn.classList.remove("btn--key-active"), 150);
  }

  function handleKeyboard(event) {
    const key = event.key;

    if (key === "Escape") {
      event.preventDefault();
      highlightButton(findButtonByKey("Escape"));
      clearAll();
      return;
    }

    if (key === "Backspace") {
      event.preventDefault();
      highlightButton(findButtonByKey("Backspace"));
      deleteLast();
      return;
    }

    if (key === "Enter" || key === "=") {
      event.preventDefault();
      highlightButton(findButtonByKey("Enter"));
      performEquals();
      return;
    }

    if (keyMap[key] !== undefined) {
      event.preventDefault();
      const btn = findButtonByKey(key);
      highlightButton(btn);
      if (btn) handleButtonClick(btn);
    }
  }

  // ---------------------------------------------------------------------------
  // Event listeners
  // ---------------------------------------------------------------------------

  buttons.forEach((btn) => {
    btn.addEventListener("click", () => handleButtonClick(btn));
  });

  document.addEventListener("keydown", handleKeyboard);

  themeToggle.addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-theme");
    const next = current === "dark" ? "light" : "dark";
    applyTheme(next);
    playClickSound();
  });

  soundToggle.addEventListener("click", () => {
    soundEnabled = !soundEnabled;
    updateSoundUI();
    if (soundEnabled) playClickSound();
  });

  historyToggle.addEventListener("click", () => {
    const isHidden = historyPanel.hasAttribute("hidden");
    if (isHidden) {
      historyPanel.removeAttribute("hidden");
    } else {
      historyPanel.setAttribute("hidden", "");
    }
    try {
      localStorage.setItem(STORAGE_KEYS.historyOpen, String(!isHidden));
    } catch {
      /* ignore */
    }
    playClickSound();
  });

  clearHistoryBtn.addEventListener("click", () => {
    history = [];
    saveHistory();
    renderHistory();
    playClickSound();
  });

  // ---------------------------------------------------------------------------
  // Initialize
  // ---------------------------------------------------------------------------

  applyTheme(loadTheme());
  updateSoundUI();
  renderHistory();

  try {
    if (localStorage.getItem(STORAGE_KEYS.historyOpen) === "true") {
      historyPanel.removeAttribute("hidden");
    }
  } catch {
    /* ignore */
  }

  updateDisplay();
})();
