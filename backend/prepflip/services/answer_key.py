"""Pasted answer keys such as "1-3, 2-1, 3-4" or "1.(3) 2.(1)" or "1 C 2 A".

Answers are matched to questions by printed number, never by position.
"""

import re
from dataclasses import dataclass, field

from prepflip.models import Question
from prepflip.services.parser import option_index

ENTRY_RE = re.compile(
    r"(?<!\d)(\d{1,3})"  # question number
    r"\s*(?:[-.:)\]=]\s*|\s+|(?=\())"  # separator: - . : ) ] = or a space, or straight into "("
    r"\(?\s*([A-Da-d1-4])\s*\)?"  # answer: A-D or 1-4, optionally in brackets
    r"(?![A-Za-z0-9])"
)


@dataclass
class KeyResult:
    applied: int = 0
    # Numbers in the key with no matching question.
    unmatched: list[int] = field(default_factory=list)
    # Numbers shared by several questions (numbering restarts between sections).
    ambiguous: list[int] = field(default_factory=list)
    # The key's answer is beyond that question's options.
    invalid: list[int] = field(default_factory=list)


def parse_answer_key(text: str) -> dict[int, tuple[int, str]]:
    """Map question number to (option index, the answer as written). Later entries win."""
    return {int(m.group(1)): (option_index(m.group(2)), m.group(2)) for m in ENTRY_RE.finditer(text)}


def apply_answer_key(questions: list[Question], text: str) -> tuple[list[Question], KeyResult]:
    key = parse_answer_key(text)
    by_number: dict[int, list[int]] = {}
    for i, q in enumerate(questions):
        if q.printed_number is not None:
            by_number.setdefault(q.printed_number, []).append(i)

    updated = list(questions)
    result = KeyResult()
    for number, (answer, written) in key.items():
        matches = by_number.get(number, [])
        if not matches:
            result.unmatched.append(number)
        elif len(matches) > 1:
            result.ambiguous.append(number)
        elif answer >= len(questions[matches[0]].options):
            result.invalid.append(number)
        else:
            i = matches[0]
            updated[i] = updated[i].model_copy(update={
                "answer_index": answer,
                "answer_source": "paper_key",
                "answer_evidence": f"Pasted answer key: {number} ({written})",
            })
            result.applied += 1
    return updated, result
