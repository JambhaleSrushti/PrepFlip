// UI flow: input -> review -> quiz -> result.

const $ = (id) => document.getElementById(id);
const LETTERS = "ABCDEFGHIJ";

const state = {
  questions: [], // parsed + reviewed MCQs
  order: [],     // indices into questions, for the current quiz run
  current: 0,
  responses: {}, // question index -> chosen option index
};

const SAMPLE = `1. Which organelle is known as the powerhouse of the cell?
(A) Nucleus
(B) Mitochondria
(C) Ribosome
(D) Golgi body
Answer: B

2. The SI unit of electric charge is
(1) Volt (2) Ampere (3) Coulomb (4) Ohm
Answer: 3

3. What is the chemical formula of water?
A) H2O2
B) HO
C) H2O
D) OH
Answer: C

4. Which of the following is a noble gas?
(A) Nitrogen
(B) Argon
(C) Oxygen`;

function show(screen) {
  document.querySelectorAll(".screen").forEach((s) => s.classList.add("hidden"));
  $(`screen-${screen}`).classList.remove("hidden");
  window.scrollTo(0, 0);
}

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  node.append(...children);
  return node;
}

// ---------- Input ----------

$("btn-sample").onclick = () => { $("text-input").value = SAMPLE; };

$("pdf-input").onchange = async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const status = $("input-status");
  if (!window.pdfjsLib) {
    status.textContent = "PDF reader couldn't load (are you offline?). Paste the text instead.";
    return;
  }
  status.textContent = `Reading ${file.name}…`;
  try {
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
    const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
    let text = "";
    for (let p = 1; p <= pdf.numPages; p++) {
      const content = await (await pdf.getPage(p)).getTextContent();
      text += content.items.map((it) => it.str + (it.hasEOL ? "\n" : "")).join("") + "\n";
    }
    if (!text.trim()) {
      status.textContent = "No text found — this PDF may be a scanned image. Scanned PDFs aren't supported yet.";
      return;
    }
    $("text-input").value = text.trim();
    status.textContent = `Extracted text from ${pdf.numPages} page(s). Check it below, then convert.`;
  } catch (err) {
    status.textContent = `Couldn't read that PDF: ${err.message}`;
  }
};

$("btn-parse").onclick = () => {
  const text = $("text-input").value;
  if (!text.trim()) { $("input-status").textContent = "Add some questions first."; return; }
  state.questions = MCQParser.parse(text);
  if (!state.questions.length) { $("input-status").textContent = "No questions found."; return; }
  renderReview();
  show("review");
};

// ---------- Review ----------

function renderReview() {
  const list = $("review-list");
  list.replaceChildren();
  state.questions.forEach((q, qi) => list.append(reviewCard(q, qi)));
  updateReviewSummary();
}

function reviewCard(q, qi) {
  const card = el("div", { class: "card review-card" });

  const refresh = () => {
    MCQParser.validate(q);
    card.replaceWith(reviewCard(q, qi));
    updateReviewSummary();
  };

  const head = el("div", { class: "review-head" },
    el("strong", {}, `Q${qi + 1}`),
    el("button", { class: "ghost small", onclick: () => {
      state.questions.splice(qi, 1);
      renderReview();
    } }, "Remove"));

  const qText = el("textarea", { rows: "2", "aria-label": `Question ${qi + 1} text` });
  qText.value = q.question;
  qText.onchange = () => { q.question = qText.value; refresh(); };

  const opts = el("div", { class: "review-options" });
  q.options.forEach((opt, oi) => {
    const radio = el("input", { type: "radio", name: `ans-${qi}`, title: "Mark as correct" });
    radio.checked = q.answer === oi;
    radio.onchange = () => { q.answer = oi; refresh(); };
    const input = el("input", { type: "text", "aria-label": `Option ${LETTERS[oi]}` });
    input.value = opt;
    input.onchange = () => { q.options[oi] = input.value; refresh(); };
    const del = el("button", { class: "ghost small", title: "Remove option", onclick: () => {
      q.options.splice(oi, 1);
      if (q.answer === oi) q.answer = null;
      else if (q.answer > oi) q.answer--;
      refresh();
    } }, "✕");
    opts.append(el("label", { class: "review-option" }, radio, el("span", { class: "letter" }, LETTERS[oi]), input, del));
  });
  if (q.options.length < LETTERS.length) {
    opts.append(el("button", { class: "ghost small", onclick: () => { q.options.push(""); refresh(); } }, "+ Add option"));
  }

  card.append(head, qText, opts);
  if (q.issues.length) {
    card.classList.add("has-issues");
    card.append(el("ul", { class: "issues" }, ...q.issues.map((i) => el("li", {}, "⚠ " + i))));
  }
  if (q.notes?.length) {
    card.append(el("ul", { class: "notes" }, ...q.notes.map((n) => el("li", {}, n))));
  }
  return card;
}

function updateReviewSummary() {
  const total = state.questions.length;
  const flagged = state.questions.filter((q) => q.issues.length).length;
  $("review-summary").textContent = flagged
    ? `${total} question(s) found. ${flagged} need your attention before you can start.`
    : `${total} question(s) ready. Pick the correct answer with the circle next to each option.`;
  $("btn-start").disabled = flagged > 0 || total === 0;
}

$("btn-back").onclick = () => show("input");

$("btn-start").onclick = () => {
  const shuffle = document.querySelector('input[name="order"]:checked').value === "shuffle";
  state.order = state.questions.map((_, i) => i);
  if (shuffle) {
    for (let i = state.order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [state.order[i], state.order[j]] = [state.order[j], state.order[i]];
    }
  }
  state.current = 0;
  state.responses = {};
  renderQuiz();
  show("quiz");
};

// ---------- Quiz ----------

function renderQuiz() {
  const total = state.order.length;
  const qi = state.order[state.current];
  const q = state.questions[qi];
  const chosen = state.responses[qi];

  $("quiz-position").textContent = `Question ${state.current + 1} of ${total}`;
  $("progress-bar").style.width = `${((state.current + 1) / total) * 100}%`;
  $("quiz-question").textContent = q.question;

  const options = $("quiz-options");
  options.replaceChildren();
  q.options.forEach((opt, oi) => {
    let cls = "option";
    if (chosen !== undefined) {
      if (oi === q.answer) cls += " correct";
      else if (oi === chosen) cls += " wrong";
    }
    options.append(el("button", {
      class: cls,
      onclick: () => {
        if (state.responses[qi] !== undefined) return; // one attempt per question
        state.responses[qi] = oi;
        renderQuiz();
      },
    }, el("span", { class: "letter" }, LETTERS[oi]), el("span", {}, opt)));
  });

  $("btn-prev").disabled = state.current === 0;
  $("btn-next").textContent = state.current === total - 1 ? "Finish" : "Next →";

  const palette = $("palette");
  palette.replaceChildren();
  state.order.forEach((qIdx, pos) => {
    const r = state.responses[qIdx];
    let cls = "pal";
    if (r !== undefined) cls += r === state.questions[qIdx].answer ? " correct" : " wrong";
    if (pos === state.current) cls += " current";
    palette.append(el("button", { class: cls, onclick: () => { state.current = pos; renderQuiz(); } }, String(pos + 1)));
  });
}

$("btn-prev").onclick = () => { if (state.current > 0) { state.current--; renderQuiz(); } };
$("btn-next").onclick = () => {
  if (state.current < state.order.length - 1) { state.current++; renderQuiz(); }
  else finish();
};
$("btn-finish").onclick = finish;

function finish() {
  const total = state.order.length;
  const answered = Object.keys(state.responses).length;
  const correct = Object.entries(state.responses)
    .filter(([qi, r]) => state.questions[qi].answer === r).length;
  $("result-text").textContent = `${correct} correct out of ${answered} attempted (${total} total)`;
  show("result");
}

$("btn-restart").onclick = () => $("btn-start").click();
$("btn-review-again").onclick = () => { renderReview(); show("review"); };
