"""Build the sentence-rewrite exercise data from the supplied answer book PDF.

Only sentence-level "Combine" and "Rewrite" exercises are published.  Every
published question is paired with exactly one official answer; sections that
cannot pass this one-to-one check are deliberately withheld.
"""

from __future__ import annotations

import json
import re
import sys
import unicodedata
from pathlib import Path

from pypdf import PdfReader


SOURCE_PDF = Path(r"D:\study\sb\《新编英语语法教程 学生用书 》第6版课后练习答案.pdf")
# 2026-08-21 管线统一：产物一律由 scripts/build/build.js 从 source/*.json 生成，
# 本脚本只负责把 PDF 解析结果写入 source/rewrite-sentences.json。
OUTPUT_DIR = Path(__file__).parent / "source"
OUTPUT_FILE = OUTPUT_DIR / "rewrite-sentences.json"


def compact(text: str) -> str:
    """Flatten PDF line wraps while retaining readable numbered sub-parts."""
    # The PDF text layer encodes Chinese glossary notes with incompatible glyphs.
    # They do not belong to the English exercise itself, so omit only those
    # parenthetical annotations and keep ordinary English parentheses intact.
    def clean_parenthetical(match: re.Match[str]) -> str:
        return "" if any(ord(char) > 0x024F for char in match.group(0)) else match.group(0)

    text = re.sub(r"\([^()]*\)", clean_parenthetical, text)
    text = re.sub(r"（[^（）]*）", clean_parenthetical, text)
    text = "".join(char for char in text if unicodedata.category(char) != "Mn")
    lines = [line.strip() for line in text.replace("\r", "").splitlines()]
    lines = [line for line in lines if line and not line.startswith("@@PAGE")]
    return " ".join(lines).replace("  ", " ").strip()


def split_questions(text: str) -> list[dict[str, str]]:
    # A few PDF lines glue two question numbers together, e.g. "...plan.24.".
    # Restore the new line before splitting, and accept OCR's occasional "36,".
    text = re.sub(r"(?<=[.!?])(\d{1,2})[.,]\s*", r"\n\1. ", text)
    text = re.sub(r"(?m)^(\s*\d{1,2}),\s*", r"\1. ", text)
    text = re.sub(r"(?m)^(\s*\d{1,2})\s+\.\s*", r"\1. ", text)
    text = re.sub(r"(?m)^(\s*\d{1,2})\s+(?=[A-Z])", r"\1. ", text)
    starts = list(re.finditer(r"(?m)^\s*(\d{1,2})\.\s*", text))
    questions: list[dict[str, str]] = []
    for index, match in enumerate(starts):
        end = starts[index + 1].start() if index + 1 < len(starts) else len(text)
        question = compact(text[match.end() : end])
        if question:
            questions.append({"number": match.group(1), "text": question})
    return questions


def split_key_block(segment: str) -> tuple[str, str]:
    """Split normal and slightly corrupted KEYS headings from the PDF text."""
    match = re.search(r"(?im)^\s*keys?.*$", segment)
    if match:
        return segment[: match.start()], segment[match.end() :]

    # Exercise 16D has no KEYS label: its official answers restart at "1." on
    # the following page.  A second first-question marker is a safe delimiter.
    first_numbers = list(re.finditer(r"(?m)^\s*1[.,]\s*", segment))
    if len(first_numbers) >= 2:
        marker = first_numbers[1]
        return segment[: marker.start()], segment[marker.start() :]
    return segment, ""


def add_paired_exercise(
    exercises: list[dict[str, object]],
    withheld: list[dict[str, str]],
    exercise_id: str,
    title: str,
    kind: str,
    instruction: str,
    questions: list[dict[str, str]],
    answers: list[dict[str, str]],
) -> None:
    question_numbers = [item["number"] for item in questions]
    answer_numbers = [item["number"] for item in answers]
    if not answers or question_numbers != answer_numbers:
        withheld.append(
            {
                "title": title,
                "reason": f"题号 {','.join(question_numbers)}；答案号 {','.join(answer_numbers)}，无法安全一一对应。",
            }
        )
        return
    exercises.append(
        {
            "id": exercise_id,
            "title": title,
            "kind": kind,
            "instruction": instruction,
            "questions": [
                {"number": question["number"], "text": question["text"], "answer": answer["text"]}
                for question, answer in zip(questions, answers)
            ],
        }
    )


def renumber_from_one(items: list[dict[str, str]]) -> list[dict[str, str]]:
    """Display each independently published exercise group from 1 again."""
    return [{"number": str(index), "text": item["text"]} for index, item in enumerate(items, start=1)]


def main() -> None:
    if not SOURCE_PDF.exists():
        raise FileNotFoundError(f"Source PDF not found: {SOURCE_PDF}")

    pages = []
    for page_number, page in enumerate(PdfReader(SOURCE_PDF).pages, start=1):
        pages.append(f"\n@@PAGE {page_number}@@\n{page.extract_text() or ''}")
    document = "".join(pages)
    # Some PDF headings continue with their instruction on the same line, e.g.
    # "EXERCISE 33A Answer the questions...".  Match the title without requiring
    # a line end so those sections still form reliable boundaries.
    heading_pattern = re.compile(r"(?im)^\s*exercise\s+(\d+\s*[a-z])(?=\s|$)")
    headings = list(heading_pattern.finditer(document))
    exercises: list[dict[str, object]] = []
    withheld: list[dict[str, str]] = []

    for index, heading in enumerate(headings):
        raw_title = re.sub(r"\s+", "", heading.group(1)).upper()
        end = headings[index + 1].start() if index + 1 < len(headings) else len(document)
        segment = document[heading.end() : end]

        # 34A contains two separately keyed groups (a: 1-10; b: 11-20),
        # with the first ten answers printed without numbers.  Preserve both
        # groups rather than guessing across the two official KEYS blocks.
        if raw_title == "34A":
            first_key = re.search(r"(?im)^\s*keys\s*:?\s*$", segment)
            if not first_key:
                withheld.append({"title": "EXERCISE 34A", "reason": "未找到第一组 KEYS。"})
                continue
            first_questions = segment[: first_key.start()]
            after_first_key = segment[first_key.end() :]
            part_b = re.search(r"(?im)^\s*b\)\s*transform.*$", after_first_key)
            if not part_b:
                withheld.append({"title": "EXERCISE 34A", "reason": "未找到 b 组题目边界。"})
                continue
            first_answer_lines = [
                compact(line)
                for line in after_first_key[: part_b.start()].splitlines()
                if line.strip() and not line.startswith("@@PAGE")
            ]
            first_lines = [line.strip() for line in first_questions.splitlines() if line.strip() and not line.startswith("@@PAGE")]
            first_start = next((i for i, line in enumerate(first_lines) if re.match(r"^1\.\s*", line)), None)
            if first_start is None:
                withheld.append({"title": "EXERCISE 34A · A", "reason": "未找到题目起点。"})
                continue
            first_instruction = compact("\n".join(first_lines[:first_start]))
            first_items = split_questions("\n".join(first_lines[first_start:]))
            first_answers = [
                {"number": question["number"], "text": answer}
                for question, answer in zip(first_items, first_answer_lines)
            ]
            add_paired_exercise(exercises, withheld, "34a-a", "EXERCISE 34A · A", "combine", first_instruction, first_items, first_answers)

            second_questions, second_answers_text = split_key_block(after_first_key[part_b.end() :])
            second_lines = [line.strip() for line in second_questions.splitlines() if line.strip() and not line.startswith("@@PAGE")]
            second_start = next((i for i, line in enumerate(second_lines) if re.match(r"^11\.\s*", line)), None)
            if second_start is None:
                withheld.append({"title": "EXERCISE 34A · B", "reason": "未找到第二组题目起点。"})
                continue
            second_instruction = compact("\n".join(second_lines[:second_start]))
            second_items = renumber_from_one(split_questions("\n".join(second_lines[second_start:])))
            second_answer_lines = [
                compact(line)
                for line in second_answers_text.splitlines()
                if line.strip() and not line.startswith("@@PAGE")
            ]
            second_answers = [
                {"number": question["number"], "text": answer}
                for question, answer in zip(second_items, second_answer_lines)
            ]
            add_paired_exercise(
                exercises,
                withheld,
                "34a-b",
                "EXERCISE 34A · B",
                "combine",
                second_instruction,
                second_items,
                second_answers,
            )
            continue

        question_part, answer_part = split_key_block(segment)
        lines = [line.strip() for line in question_part.splitlines() if line.strip() and not line.startswith("@@PAGE")]
        question_start = next((i for i, line in enumerate(lines) if re.match(r"^1\.\s*", line)), None)
        if question_start is None:
            continue
        instruction = compact("\n".join(lines[:question_start]))
        lowered_instruction = instruction.lower()
        if not (lowered_instruction.startswith("combine") or lowered_instruction.startswith("rewrite")):
            continue
        # Passage-level transformations are outside the sentence-rewrite scope.
        if "passage" in lowered_instruction:
            continue
        questions = split_questions("\n".join(lines[question_start:]))
        if not questions:
            continue
        answers = split_questions(answer_part)

        # 39B's printed KEYS have three local numbering defects: item 7 is
        # reduced to a stray character, item 36 is printed as 26, and item 37
        # has no number.  The surrounding sequence and the corresponding
        # source questions make the repairs unambiguous.
        if raw_title == "39B":
            answer_by_number = {item["number"]: item["text"] for item in answers}
            manual_answers = {
                "7": "原句即可：Not a single hotel she stayed in could please her.",
                "36": "Not even after he was seventy-five would he stop working.",
                "37": "Not even if he was threatened with expulsion from school would he waver.",
            }
            answers = [
                {
                    "number": question["number"],
                    "text": manual_answers.get(question["number"], answer_by_number.get(question["number"], "")),
                }
                for question in questions
            ]
        add_paired_exercise(
            exercises,
            withheld,
            raw_title.lower(),
            f"EXERCISE {raw_title}",
            "combine" if lowered_instruction.startswith("combine") else "rewrite",
            instruction,
            questions,
            answers,
        )

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    payload = {
        "source": "《新编英语语法教程 学生用书》第6版课后练习答案",
        "description": "多句合一与按指定方式改写句子练习，每题附对应官方参考答案。",
        "exercises": exercises,
        "withheld": withheld,
    }
    serialized = json.dumps(payload, ensure_ascii=False, indent=2)
    OUTPUT_FILE.write_text(serialized + "\n", encoding="utf-8")
    print(f"Wrote {OUTPUT_FILE} with {len(exercises)} exercises / {sum(len(item['questions']) for item in exercises)} questions (run: node scripts/build/build.js)")
    for item in exercises:
        print(f"{item['title']}: {len(item['questions'])} question-answer pairs")
    for item in withheld:
        print(f"WITHHELD {item['title']}: {item['reason']}")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"Build failed: {error}", file=sys.stderr)
        raise
