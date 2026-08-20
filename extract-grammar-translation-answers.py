"""Extract translation exercises from the answer book, not the 533-page textbook.

The answer book includes the Chinese prompts and the official KEYS on the same
exercise pages.  Its English text layer locates the relevant pages precisely, while
ONNX OCR recovers the Chinese prompts faithfully from the page image.
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

import numpy as np
import pymupdf
from pypdf import PdfReader
from rapidocr_onnxruntime import RapidOCR


TITLE_RE = re.compile(r"(?:EXERCISE|ECERCISE)\s*([0-9]+)\s*([A-Z])", re.I)
TRANSLATE_RE = re.compile(r"Translate[ ]+the[ ]+following(?:[ ]+sentences)?[ ]+into[ ]+English", re.I)
KEY_RE = re.compile(r"^\s*KEY(?:S|[ ]*[0-9]+[ ]*[A-Z])?\b", re.I)
NUMBER_RE = re.compile(r"^\s*([0-9]{1,3})[.、)]\s*(.*)$")


def parse_official_answers(document_text: str, heading_start: int) -> list[str]:
    """Read KEYS across page breaks, stopping only at the following exercise."""
    heading = TITLE_RE.search(document_text, heading_start)
    if not heading or heading.start() != heading_start:
        raise ValueError(f"No exercise heading at offset {heading_start}")
    following_heading = TITLE_RE.search(document_text, heading.end())
    start = heading.end()
    end = following_heading.start() if following_heading else len(document_text)
    section_text = document_text[start:end]
    lines = [re.sub(r"\s+", " ", line).strip() for line in section_text.splitlines()]
    translate_index = next(index for index, line in enumerate(lines) if "Translate" in line)
    key_index = next(index for index in range(translate_index + 1, len(lines)) if KEY_RE.match(lines[index]))
    answers: list[str] = []
    current = ""
    for line in lines[key_index + 1 :]:
        item = NUMBER_RE.match(line)
        if item:
            if current:
                answers.append(current)
            current = item.group(2).strip()
        elif current and line:
            current += " " + line
    if current:
        answers.append(current)
    return answers


def ocr_lines(document: pymupdf.Document, page_number: int, ocr: RapidOCR) -> list[str]:
    page = document[page_number - 1]
    image = page.get_pixmap(
        matrix=pymupdf.Matrix(1.7, 1.7), colorspace=pymupdf.csGRAY
    )
    array = np.frombuffer(image.samples, np.uint8).reshape(image.height, image.width, image.n)
    result, _ = ocr(array)
    return [item[1].strip() for item in (result or []) if item[1].strip()]


def parse_questions(lines: list[str]) -> list[str]:
    translate_at = next(
        (index for index, line in enumerate(lines) if "translate" in line.lower() and "english" in line.lower()),
        None,
    )
    if translate_at is None:
        return []
    questions: list[str] = []
    current = ""
    for line in lines[translate_at + 1 :]:
        if KEY_RE.match(line):
            break
        item = NUMBER_RE.match(line)
        if item:
            if current:
                questions.append(current)
            current = item.group(2).strip()
        elif current:
            current += " " + line
    if current:
        questions.append(current)
    return questions


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--answers", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    args.output.parent.mkdir(parents=True, exist_ok=True)

    reader = PdfReader(str(args.answers))
    document = pymupdf.open(args.answers)
    ocr = RapidOCR()
    page_texts = [page.extract_text() or "" for page in reader.pages]
    page_offsets: list[int] = []
    cursor = 0
    for page_text in page_texts:
        page_offsets.append(cursor)
        cursor += len(page_text) + 1
    document_text = "\n".join(page_texts)
    sections: list[dict] = []

    for page_number, page_text in enumerate(page_texts, start=1):
        if not TRANSLATE_RE.search(page_text):
            continue
        translate_match = TRANSLATE_RE.search(page_text)
        title_matches = list(TITLE_RE.finditer(page_text[: translate_match.start()]))
        title_match = title_matches[-1] if title_matches else None
        if not title_match:
            continue
        title = f"{title_match.group(1)}{title_match.group(2).upper()}"
        raw_lines = ocr_lines(document, page_number, ocr)
        questions = parse_questions(raw_lines)
        answers = parse_official_answers(document_text, page_offsets[page_number - 1] + title_match.start())
        items = [
            {
                "number": number,
                "question": question,
                "answer": answers[number - 1] if number <= len(answers) else "",
            }
            for number, question in enumerate(questions, start=1)
        ]
        sections.append(
            {
                "title": title,
                "page": page_number,
                "items": items,
                "expectedAnswerCount": len(answers),
                "ocrQuestionCount": len(questions),
                "ocrLines": raw_lines,
            }
        )
        print(f"{title}: OCR {len(questions)} / KEYS {len(answers)} (page {page_number})", flush=True)

    payload = {
        "source": "《新编英语语法教程》配套课后练习答案 PDF（题干与 KEYS 同页）",
        "sections": sections,
    }
    args.output.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
