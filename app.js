(function () {
  const entries = (window.ENTRIES || []).slice().sort((a, b) => b.date.localeCompare(a.date));

  const $ = (id) => document.getElementById(id);
  const listEl = $("entry-list");
  const textEl = $("text");
  const inputEl = $("input");
  const boardEl = $("board");
  const doneEl = $("done");

  let current = null;
  let target = "";
  let spans = [];
  let startTime = null;
  let timer = null;
  let keystrokes = 0;
  let mistakes = 0;
  let prevLength = 0;

  // 把彎引號等換成鍵盤打得出來的字元，段落之間只需要按一次 Enter
  function normalize(text) {
    return text
      .replace(/\r\n?/g, "\n")
      .replace(/[‘’]/g, "'")
      .replace(/[“”]/g, '"')
      .replace(/[–—]/g, "-")
      .replace(/…/g, "...")
      .replace(/ /g, " ")
      .split("\n")
      .map((line) => line.trim().replace(/\s+/g, " "))
      .filter((line) => line.length > 0)
      .join("\n");
  }

  function storageGet(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }
  function storageSet(key, value) {
    try { localStorage.setItem(key, value); } catch (e) { /* ignore */ }
  }
  const bestKey = (date) => "typing-best-" + date;

  function renderList() {
    listEl.innerHTML = "";
    entries.forEach((entry) => {
      const li = document.createElement("li");
      li.dataset.date = entry.date;
      const best = storageGet(bestKey(entry.date));
      li.innerHTML =
        '<div class="d"></div><div class="t"></div>';
      li.querySelector(".d").textContent = entry.date + (best ? "  ✓ " + best + " WPM" : "");
      li.querySelector(".t").textContent = entry.title || "";
      li.addEventListener("click", () => {
        location.hash = entry.date;
      });
      listEl.appendChild(li);
    });
  }

  function load(entry) {
    current = entry;
    target = normalize(entry.text);
    $("entry-date").textContent = entry.date;
    $("entry-title").textContent = entry.title || "Daily update";
    [...listEl.children].forEach((li) => li.classList.toggle("active", li.dataset.date === entry.date));

    textEl.innerHTML = "";
    spans = [];
    for (const ch of target) {
      const span = document.createElement("span");
      if (ch === "\n") {
        span.textContent = "↵";
        span.className = "nl";
        textEl.appendChild(span);
        textEl.appendChild(document.createTextNode("\n\n"));
      } else {
        span.textContent = ch;
        textEl.appendChild(span);
      }
      spans.push(span);
    }
    reset();
  }

  function reset() {
    clearInterval(timer);
    timer = null;
    startTime = null;
    keystrokes = 0;
    mistakes = 0;
    prevLength = 0;
    inputEl.value = "";
    inputEl.disabled = false;
    doneEl.hidden = true;
    const best = current && storageGet(bestKey(current.date));
    $("best").textContent = best || "—";
    update();
    inputEl.focus();
  }

  function elapsedMinutes() {
    return startTime ? (Date.now() - startTime) / 60000 : 0;
  }

  function stats() {
    const typed = inputEl.value;
    let correct = 0;
    for (let i = 0; i < typed.length; i++) if (typed[i] === target[i]) correct++;
    const minutes = elapsedMinutes();
    // 前幾秒樣本太少，用至少 5 秒計算避免數字暴衝
    const wpm = startTime ? Math.round(correct / 5 / Math.max(minutes, 5 / 60)) : 0;
    const accuracy = keystrokes ? Math.max(0, Math.round(((keystrokes - mistakes) / keystrokes) * 100)) : 100;
    return { wpm, accuracy, correct };
  }

  function update() {
    const typed = inputEl.value;
    for (let i = 0; i < spans.length; i++) {
      const span = spans[i];
      const isNl = target[i] === "\n";
      let cls = isNl ? "nl" : "";
      if (i < typed.length) cls += typed[i] === target[i] ? " ok" : " bad";
      if (i === typed.length) cls += " cur";
      span.className = cls.trim();
    }
    const { wpm, accuracy } = stats();
    $("wpm").textContent = wpm;
    $("accuracy").textContent = accuracy + "%";
    $("progress").textContent = Math.floor((typed.length / target.length) * 100) + "%";
    const secs = Math.floor(elapsedMinutes() * 60);
    $("time").textContent = Math.floor(secs / 60) + ":" + String(secs % 60).padStart(2, "0");

    const cur = spans[typed.length];
    if (cur && document.activeElement === inputEl) {
      const rect = cur.getBoundingClientRect();
      if (rect.bottom > window.innerHeight - 80 || rect.top < 80) {
        cur.scrollIntoView({ block: "center", behavior: "smooth" });
      }
    }
  }

  function finish() {
    clearInterval(timer);
    timer = null;
    inputEl.disabled = true;
    const { wpm, accuracy } = stats();
    const prev = Number(storageGet(bestKey(current.date))) || 0;
    const isBest = wpm > prev;
    if (isBest) storageSet(bestKey(current.date), String(wpm));
    $("best").textContent = Math.max(wpm, prev);
    doneEl.hidden = false;
    doneEl.textContent =
      "完成！ " + wpm + " WPM，正確率 " + accuracy + "%" +
      (isBest ? "（新紀錄 🎉）" : "") + "　按 Esc 或「重新開始」再練一次。";
    renderList();
    [...listEl.children].forEach((li) => li.classList.toggle("active", li.dataset.date === current.date));
  }

  inputEl.addEventListener("input", () => {
    if (inputEl.value.length > target.length) {
      inputEl.value = inputEl.value.slice(0, target.length);
    }
    const typed = inputEl.value;
    if (!startTime && typed.length > 0) {
      startTime = Date.now();
      timer = setInterval(update, 1000);
    }
    // 只計算新打的字，用來算正確率（刪掉重打的錯字仍算一次錯）
    for (let i = prevLength; i < typed.length; i++) {
      keystrokes++;
      if (typed[i] !== target[i]) mistakes++;
    }
    prevLength = typed.length;
    update();
    if (typed.length === target.length) finish();
  });

  inputEl.addEventListener("keydown", (e) => {
    if (e.key === "Tab") e.preventDefault();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      reset();
    }
  });

  boardEl.addEventListener("click", () => inputEl.focus());
  inputEl.addEventListener("focus", () => boardEl.classList.add("focused"));
  inputEl.addEventListener("blur", () => boardEl.classList.remove("focused"));
  $("restart").addEventListener("click", reset);
  $("blind").addEventListener("change", (e) => {
    textEl.classList.toggle("blind", e.target.checked);
    inputEl.focus();
  });

  function route() {
    const date = decodeURIComponent(location.hash.slice(1));
    const entry = entries.find((e) => e.date === date) || entries[0];
    if (entry) load(entry);
  }

  window.addEventListener("hashchange", route);
  renderList();
  if (entries.length === 0) {
    textEl.textContent = "還沒有文章，請在 entries.js 新增。";
  } else {
    route();
  }
})();
