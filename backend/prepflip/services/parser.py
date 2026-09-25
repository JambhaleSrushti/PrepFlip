"""Turns question text into extracted MCQs.

Ported from the prototype's legacy/parser.js; tests/test_parser_parity.py checks
that both give the same result. Anything unclear is left for the validator to
flag. The parser never guesses an answer.
"""

import re
from dataclasses import dataclass, field

from prepflip.models import AnswerSource

QUESTION_RE = re.compile(r"^\s*(?:Q(?:uestion)?\s*)?(\d+)\s*[.):]\s*(.*)$", re.IGNORECASE)
OPTION_RE = re.compile(r"^\s*(?:\(([A-Da-d1-4])\)|([A-Da-d])[).:])\s*(.*)$")
# The trailing look-ahead stops lines like "Answer all questions" reading as "answer A"
# (the prototype had that bug).
ANSWER_RE = re.compile(
    r"^\s*(?:ans(?:wer)?|correct(?:\s+answer)?|key)\s*[:.\-]?\s*\(?([A-Da-d1-4])\)?(?![A-Za-z0-9])",
    re.IGNORECASE,
)
INLINE_OPTION_MARKER = re.compile(r"\([A-Da-d1-4]\)\s")
INLINE_OPTION_SPLIT = re.compile(r"\s(?=\([A-Da-d1-4]\)\s)")


@dataclass
class ExtractedQuestion:
    text: str
    options: list[str]
    printed_number: int | None = None
    page: int | None = None
    # May point past the options; the importer drops it then and the validator flags the gap.
    answer_index: int | None = None
    answer_source: AnswerSource | None = None
    # Things worth telling the student that aren't problems, e.g. a repeated option letter.
    notes: list[str] = field(default_factory=list)


def option_index(label: str) -> int:
    label = label.upper()
    return int(label) - 1 if label.isdigit() else ord(label) - ord("A")


def _expand_inline_options(line: str) -> list[str]:
    """ "(A) x (B) y" on one line becomes one line per option."""
    if len(INLINE_OPTION_MARKER.findall(line)) < 2:
        return [line]
    return INLINE_OPTION_SPLIT.split(line)


def parse_text(text: str) -> list[ExtractedQuestion]:
    return parse_lines([(line, None) for line in text.replace("\r\n", "\n").replace("\r", "\n").split("\n")])


def parse_lines(raw_lines: list[tuple[str, int | None]]) -> list[ExtractedQuestion]:
    """Parse (line, page number) pairs in reading order."""
    lines = [
        (part.strip(), page)
        for raw, page in raw_lines
        for part in _expand_inline_options(raw)
        if part.strip()
    ]

    questions: list[ExtractedQuestion] = []
    current: dict | None = None
    last_field: str | int | None = None  # "question", an option index, or None after an answer line

    def start(body: str, number: int | None, page: int | None) -> dict:
        q = {"text": body, "options": {}, "number": number, "page": page, "answer": None, "notes": []}
        questions.append(q)
        return q

    for line, page in lines:
        if current and (m := ANSWER_RE.match(line)):
            current["answer"] = option_index(m.group(1))
            last_field = None
        elif current and (m := OPTION_RE.match(line)):
            label = m.group(1) or m.group(2)
            idx = option_index(label)
            if idx in current["options"]:
                current["notes"].append(f"Option {label} appeared twice in the source; the last one was kept.")
            current["options"][idx] = m.group(3)
            last_field = idx
        elif m := QUESTION_RE.match(line):
            current = start(m.group(2), int(m.group(1)), page)
            last_field = "question"
        elif current and last_field == "question":
            current["text"] += " " + line
        elif current and isinstance(last_field, int):
            current["options"][last_field] += " " + line
        elif not current:
            # Text before any numbered question: treat it as an unnumbered question.
            current = start(line, None, page)
            last_field = "question"
        # Otherwise (a line after an answer line, before the next question) it's dropped:
        # usually a header, footer or instruction.

    return [_finish(q) for q in questions]


def _finish(q: dict) -> ExtractedQuestion:
    count = max(q["options"], default=-1) + 1
    # Missing letters (A, B, D but no C) become empty options so the review screen shows the gap.
    options = [q["options"].get(i, "") for i in range(count)]
    return ExtractedQuestion(
        text=q["text"],
        options=options,
        printed_number=q["number"],
        page=q["page"],
        answer_index=q["answer"],
        answer_source="paper_inline" if q["answer"] is not None else None,
        notes=q["notes"],
    )
