// Turns raw question text into MCQ objects. Anything it can't read cleanly is
// flagged in `issues` so the user reviews it instead of the app guessing.

(function (global) {
  const QUESTION_RE = /^\s*(?:Q(?:uestion)?\s*)?(\d+)\s*[.):]\s*(.*)$/i;
  const OPTION_RE = /^\s*(?:\(([A-Da-d1-4])\)|([A-Da-d])[).:])\s*(.*)$/;
  const ANSWER_RE = /^\s*(?:ans(?:wer)?|correct(?:\s+answer)?|key)\s*[:.\-]?\s*\(?([A-Da-d1-4])\)?/i;
  const INLINE_OPTION_SPLIT = /\s(?=\([A-Da-d1-4]\)\s)/;

  function optionIndex(label) {
    const l = label.toUpperCase();
    return /[1-4]/.test(l) ? Number(l) - 1 : l.charCodeAt(0) - 65;
  }

  // "(A) x (B) y" on one line -> separate lines
  function expandInlineOptions(line) {
    const markers = line.match(/\([A-Da-d1-4]\)\s/g);
    if (!markers || markers.length < 2) return [line];
    return line.split(INLINE_OPTION_SPLIT);
  }

  function parse(text) {
    const lines = text.replace(/\r\n?/g, "\n").split("\n")
      .flatMap(expandInlineOptions)
      .map((l) => l.trim())
      .filter(Boolean);

    const questions = [];
    let current = null;
    let lastField = null; // "question" | option index

    const start = (body) => {
      current = { question: body, options: [], answer: null, issues: [], notes: [] };
      questions.push(current);
      lastField = "question";
    };

    for (const line of lines) {
      let m;
      if ((m = line.match(ANSWER_RE)) && current) {
        current.answer = optionIndex(m[1]);
        lastField = null;
      } else if ((m = line.match(OPTION_RE)) && current) {
        const idx = optionIndex(m[1] || m[2]);
        if (current.options[idx] !== undefined) current.notes.push(`Option ${m[1] || m[2]} appeared twice in the source; the last one was kept.`);
        current.options[idx] = m[3];
        lastField = idx;
      } else if ((m = line.match(QUESTION_RE))) {
        start(m[2]);
      } else if (current && lastField === "question") {
        current.question += " " + line;
      } else if (current && typeof lastField === "number") {
        current.options[lastField] += " " + line;
      } else if (!current) {
        // Text before any numbered question: treat as an unnumbered question.
        start(line);
      }
    }

    questions.forEach(validate);
    return questions;
  }

  function validate(q) {
    q.issues = [];
    // Fill gaps (e.g. A, B, D found but no C) so they're visible in review.
    for (let i = 0; i < q.options.length; i++) {
      if (q.options[i] === undefined) q.options[i] = "";
      if (!q.options[i].trim()) q.issues.push(`Option ${String.fromCharCode(65 + i)} is empty — fill it in or remove it.`);
    }
    if (!q.question.trim()) q.issues.push("Question text is empty.");
    if (q.options.filter((o) => o.trim()).length < 2) q.issues.push("Needs at least 2 answer options.");
    if (q.answer === null) q.issues.push("Correct answer not found — please select it.");
    else if (q.answer >= q.options.length || !q.options[q.answer]?.trim())
      q.issues.push("Correct answer points to an option that doesn't exist.");
    return q;
  }

  global.MCQParser = { parse, validate };
  if (typeof module !== "undefined") module.exports = { parse, validate };
})(typeof window !== "undefined" ? window : globalThis);
