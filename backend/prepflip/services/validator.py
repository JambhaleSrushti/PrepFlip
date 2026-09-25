"""The single place that decides which issues a question has.

Every extractor's output and every student edit goes through `validate_set`, so
the review screen, the "ready" status and the tests all agree.
"""

import re
import string

from prepflip.models import BLOCKING_CODES, Issue, IssueCode, Question

# Replacement char, private-use glyphs (custom PDF fonts) and stray control characters.
UNREADABLE_RE = re.compile("[�-\x00-\x08\x0b\x0c\x0e-\x1f]")


def letter(index: int) -> str:
    return string.ascii_uppercase[index]


def _issue(code: IssueCode, message: str) -> Issue:
    return Issue(code=code, message=message, blocking=code in BLOCKING_CODES)


def question_issues(q: Question) -> list[Issue]:
    """Issues that can be judged from the question alone."""
    issues: list[Issue] = []
    if not q.text.strip():
        issues.append(_issue("EMPTY_QUESTION", "Question text is empty."))
    for i, option in enumerate(q.options):
        if not option.strip():
            issues.append(_issue("EMPTY_OPTION", f"Option {letter(i)} is empty. Fill it in or remove it."))
    if sum(1 for o in q.options if o.strip()) < 2:
        issues.append(_issue("FEW_OPTIONS", "Needs at least 2 answer options."))
    if q.answer_index is None:
        issues.append(_issue("MISSING_ANSWER", "Correct answer not found. Pick it, or paste the answer key."))
    if any(UNREADABLE_RE.search(t) for t in [q.text, *q.options]):
        issues.append(_issue(
            "UNREADABLE_CHARS",
            "Some symbols couldn't be read (shown as □ or �). Check them against the paper and fix them.",
        ))
    for flag in q.extraction_flags:
        issues.append(_issue(flag.code, flag.message))
    return issues


def numbering_issues(questions: list[Question]) -> dict[str, list[Issue]]:
    """Check printed numbers against the order of appearance.

    A drop back to 1 starts a new section (NEET numbering can restart between subjects).
    """
    found: dict[str, list[Issue]] = {}
    prev: int | None = None
    seen: set[int] = set()
    for q in questions:
        n = q.printed_number
        if n is None:
            continue
        issue = None
        if prev is not None:
            if n == 1 and prev != 1:
                seen = set()
            elif n in seen:
                issue = _issue("DUPLICATE_NUMBER", f"Question number {n} appears more than once.")
            elif n > prev + 1:
                missing = f"Q{prev + 1}" if n == prev + 2 else f"Q{prev + 1}–Q{n - 1}"
                issue = _issue("NUMBERING_GAP", f"{missing} missing between Q{prev} and Q{n}. Was a question dropped?")
            elif n < prev:
                issue = _issue("NUMBERING_GAP", f"Q{n} comes after Q{prev}. Check the order.")
        if issue:
            found.setdefault(q.id, []).append(issue)
        seen.add(n)
        prev = n
    return found


def validate_set(questions: list[Question]) -> list[Question]:
    """Return copies with `seq` and `issues` set. Acknowledged advisory issues are left out."""
    numbering = numbering_issues(questions)
    result = []
    for seq, q in enumerate(questions):
        issues = question_issues(q) + numbering.get(q.id, [])
        issues = [i for i in issues if i.blocking or i.code not in q.acknowledged]
        result.append(q.model_copy(update={"seq": seq, "issues": issues}))
    return result


def is_ready(questions: list[Question]) -> bool:
    return bool(questions) and all(not q.issues for q in questions)
