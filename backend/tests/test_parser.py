"""What the Python parser adds beyond the prototype: printed numbers, pages and answer sources."""

from prepflip.services.parser import parse_lines, parse_text


def test_records_printed_numbers_in_paper_order() -> None:
    qs = parse_text("5. Fifth\n(A) a\n(B) b\n7. Seventh\n(A) a\n(B) b\nWhat, no number?")
    assert [q.printed_number for q in qs] == [5, 7]


def test_unnumbered_question_has_no_printed_number() -> None:
    [q] = parse_text("What is 2 + 2?\n(A) 3\n(B) 4")
    assert q.printed_number is None


def test_page_comes_from_the_line_the_question_starts_on() -> None:
    qs = parse_lines([
        ("1. Starts on page 1", 1),
        ("(A) a", 1),
        ("(B) b", 2),
        ("2. Starts on page 2", 2),
        ("(A) a (B) b", 2),
    ])
    assert [(q.printed_number, q.page) for q in qs] == [(1, 1), (2, 2)]
    assert qs[1].options == ["a", "b"]


def test_inline_answer_is_marked_as_from_the_paper() -> None:
    [with_answer, without] = parse_text("1. x\n(A) a\n(B) b\nAns: B\n2. y\n(A) a\n(B) b")
    assert (with_answer.answer_index, with_answer.answer_source) == (1, "paper_inline")
    assert (without.answer_index, without.answer_source) == (None, None)


def test_text_is_kept_verbatim_including_latex() -> None:
    [q] = parse_text(r"1. Find $\frac{1}{2}mv^2$ when $v = 2\,\mathrm{m/s}$" + "\n(A) $1$\n(B) $2$")
    assert q.text == r"Find $\frac{1}{2}mv^2$ when $v = 2\,\mathrm{m/s}$"
