"""Create a verified translation-question dataset from the answer book."""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

import numpy as np
import pymupdf
from pypdf import PdfReader
from rapidocr_onnxruntime import RapidOCR


TITLE_RE = re.compile(r"(?:EXERCISE|ECERCISE|EAERCISE)\s*(\d+)\s*([A-Z])", re.I)
TRANSLATE_RE = re.compile(
    r"Translate\s+the\s+following(?:\s+sentences)?\s+into\s+English", re.I
)
KEY_RE = re.compile(r"^\s*KEY(?:S|\s*\d+\s*[A-Z])?\b", re.I)
NUMBER_RE = re.compile(r"^\s*(\d{1,3})\.\s*(.*)$")
ANSWER_NUMBER_RE = re.compile(r"^\s*(\d{1,3})[.]?\s+(.*)$")


def compact_lines(text: str) -> list[str]:
    return [re.sub(r"\s+", " ", line).strip() for line in text.splitlines()]


def title_at_or_before(page_texts: list[str], page_index: int) -> tuple[str, int] | None:
    page_text = page_texts[page_index]
    translate = TRANSLATE_RE.search(page_text)
    before = page_text[: translate.start()] if translate else page_text
    matches = list(TITLE_RE.finditer(before))
    if matches:
        match = matches[-1]
        return f"{match.group(1)}{match.group(2).upper()}", match.start()
    for previous in range(page_index - 1, max(-1, page_index - 3), -1):
        matches = list(TITLE_RE.finditer(page_texts[previous]))
        if matches:
            match = matches[-1]
            return f"{match.group(1)}{match.group(2).upper()}", match.start()
    return None


def answers_for_section(document_text: str, heading_offset: int) -> list[str]:
    heading = TITLE_RE.search(document_text, heading_offset)
    if not heading or heading.start() != heading_offset:
        raise ValueError(f"Cannot resolve heading at offset {heading_offset}")
    following = TITLE_RE.search(document_text, heading.end())
    section = document_text[heading.end() : following.start() if following else len(document_text)]
    lines = compact_lines(section)
    translate_at = next(index for index, line in enumerate(lines) if "translate" in line.lower())
    key_at = next(index for index in range(translate_at + 1, len(lines)) if KEY_RE.match(lines[index]))
    answers: list[str] = []
    current = ""
    key_line = lines[key_at]
    first_answer = re.search(r"\b(\d{1,3})[.]?\s+(.+)$", key_line)
    if first_answer:
        current = first_answer.group(2).strip()
    for line in lines[key_at + 1 :]:
        match = ANSWER_NUMBER_RE.match(line)
        if match:
            if current and "It is expected that the President" in current and "The President is expected" in match.group(2):
                current += " / " + match.group(2).strip()
                continue
            if current:
                answers.append(current)
            current = match.group(2).strip()
        elif current and line:
            current += " " + line
    if current:
        answers.append(current)
    return answers


def ocr_page(document: pymupdf.Document, page_number: int, ocr: RapidOCR) -> list[str]:
    page = document[page_number - 1]
    pixmap = page.get_pixmap(matrix=pymupdf.Matrix(1.7, 1.7), colorspace=pymupdf.csGRAY)
    image = np.frombuffer(pixmap.samples, np.uint8).reshape(pixmap.height, pixmap.width, pixmap.n)
    result, _ = ocr(image)
    return [entry[1].strip() for entry in (result or []) if entry[1].strip()]


def questions_from_pages(page_lines: list[list[str]]) -> tuple[list[str], list[str]]:
    lines = [line for page in page_lines for line in page]
    translate_at = next(
        (index for index, line in enumerate(lines) if "translate" in line.lower() and "english" in line.lower()),
        None,
    )
    if translate_at is None:
        return [], lines
    questions: list[str] = []
    current = ""
    for line in lines[translate_at + 1 :]:
        line = re.sub(r"^[sS](?=\.)", "8", line)
        if KEY_RE.match(line) or ("EXERCISE" in line.upper() and current):
            break
        match = NUMBER_RE.match(line)
        if match:
            if current:
                questions.append(current)
            current = match.group(2).strip()
        elif current:
            current += " " + line
    if current:
        questions.append(current)
    return questions, lines


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--answers", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    args.output.parent.mkdir(parents=True, exist_ok=True)

    reader = PdfReader(str(args.answers))
    page_texts = [page.extract_text() or "" for page in reader.pages]
    offsets: list[int] = []
    cursor = 0
    for page_text in page_texts:
        offsets.append(cursor)
        cursor += len(page_text) + 1
    document_text = "\n".join(page_texts)
    image_document = pymupdf.open(args.answers)
    ocr = RapidOCR()
    sections: list[dict] = []

    for index, page_text in enumerate(page_texts):
        if not TRANSLATE_RE.search(page_text):
            continue
        located = title_at_or_before(page_texts, index)
        if not located:
            print(f"Skipped unlabelled translation page {index + 1}", flush=True)
            continue
        title, local_heading_offset = located
        heading_page = index
        if not list(TITLE_RE.finditer(page_text[: TRANSLATE_RE.search(page_text).start()])):
            for previous in range(index - 1, max(-1, index - 3), -1):
                if list(TITLE_RE.finditer(page_texts[previous])):
                    heading_page = previous
                    break
        answers = answers_for_section(document_text, offsets[heading_page] + local_heading_offset)
        ocr_pages = [ocr_page(image_document, page_number, ocr) for page_number in range(index + 1, min(index + 4, len(page_texts)) + 1)]
        questions, raw_lines = questions_from_pages(ocr_pages)
        items = [
            {"number": number, "question": question, "answer": answers[number - 1]}
            for number, question in enumerate(questions, start=1)
            if number <= len(answers)
        ]
        verified = len(questions) == len(answers) and len(questions) > 0
        sections.append(
            {
                "title": title,
                "page": index + 1,
                "items": items,
                "expectedAnswerCount": len(answers),
                "ocrQuestionCount": len(questions),
                "verified": verified,
                "ocrLines": raw_lines,
            }
        )
        print(f"{title}: OCR {len(questions)} / KEYS {len(answers)} / verified={verified}", flush=True)

    args.output.write_text(
        json.dumps(
            {
                "source": "《新编英语语法教程》第6版课后练习答案（官方 KEYS）",
                "sections": sections,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
