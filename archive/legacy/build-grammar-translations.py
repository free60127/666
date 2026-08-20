"""Build structured English translation exercises from the sixth-edition grammar book.

Run this only after Docling is installed.  It writes intermediate files outside the
published site, so the source PDFs and OCR output are never shipped to visitors.
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

from docling.datamodel.base_models import InputFormat
from docling.datamodel.pipeline_options import PdfPipelineOptions, RapidOcrOptions
from docling.document_converter import DocumentConverter, PdfFormatOption
from pypdf import PdfReader


HEADING_RE = re.compile(r"(?:E?XERCISE|ECERCISE)\s*(\d+)\s*([A-Z])\b", re.IGNORECASE)
TRANSLATE_RE = re.compile(r"^\s*Translate\s+the\s+following(?:\s+sentences)?\s+into\s+English\b", re.IGNORECASE)
KEY_RE = re.compile(r"^\s*KEY(?:S|\s*\d+\s*[A-Z])?\b", re.IGNORECASE)
ITEM_RE = re.compile(r"^\s*(\d{1,3})\s*[\.、)]\s*(.*)$")


def normalise_lines(text: str) -> list[str]:
    """Keep meaningful lines while fixing common PDF/OCR spacing."""
    return [re.sub(r"\s+", " ", line).strip() for line in text.replace("\r", "").split("\n")]


def read_answer_pdf(path: Path) -> str:
    reader = PdfReader(str(path))
    return "\n".join(page.extract_text() or "" for page in reader.pages)


def get_heading_before(lines: list[str], index: int) -> str | None:
    for previous in range(index, max(-1, index - 32), -1):
        match = HEADING_RE.search(lines[previous])
        if match:
            return f"{match.group(1)}{match.group(2).upper()}"
    return None


def parse_numbered_block(lines: list[str], start: int) -> tuple[list[str], int]:
    """Return numbered items and the index at the start of the next block."""
    items: list[str] = []
    current: str | None = None
    index = start
    while index < len(lines):
        line = lines[index]
        if HEADING_RE.search(line) or (items and KEY_RE.match(line)):
            break
        item = ITEM_RE.match(line)
        if item:
            if current:
                items.append(current.strip())
            current = item.group(2).strip()
        elif current and line:
            current += " " + line
        index += 1
    if current:
        items.append(current.strip())
    return items, index


def parse_answer_sections(answer_text: str) -> dict[str, list[str]]:
    lines = normalise_lines(answer_text)
    sections: dict[str, list[str]] = {}
    for index, line in enumerate(lines):
        if not TRANSLATE_RE.search(line):
            continue
        title = get_heading_before(lines, index)
        if not title:
            continue
        keys_at = next((cursor for cursor in range(index + 1, min(len(lines), index + 180)) if KEY_RE.match(lines[cursor])), None)
        if keys_at is None:
            continue
        answers, _ = parse_numbered_block(lines, keys_at + 1)
        if answers:
            sections[title] = answers
    return sections


def parse_book_sections(markdown: str) -> dict[str, list[str]]:
    lines = normalise_lines(markdown)
    sections: dict[str, list[str]] = {}
    for index, line in enumerate(lines):
        if not TRANSLATE_RE.search(line):
            continue
        title = get_heading_before(lines, index)
        if not title:
            continue
        questions, _ = parse_numbered_block(lines, index + 1)
        if questions:
            sections[title] = questions
    return sections


def make_payload(book_sections: dict[str, list[str]], answer_sections: dict[str, list[str]]) -> dict:
    sections = []
    for title, questions in book_sections.items():
        answers = answer_sections.get(title, [])
        items = []
        for number, question in enumerate(questions, start=1):
            answer = answers[number - 1] if number <= len(answers) else ""
            items.append({"number": number, "question": question, "answer": answer})
        sections.append({"title": title, "items": items})
    return {
        "source": "《新编英语语法教程 学生用书 第6版》及配套课后练习答案",
        "sections": sections,
        "unmatchedAnswers": sorted(set(answer_sections) - set(book_sections)),
    }


def make_converter() -> DocumentConverter:
    """Use Chinese+English OCR but avoid the optional orientation model.

    Some network environments intermittently block the orientation-model CDN.  The
    book pages are upright, so that model adds no value here and is deliberately
    disabled.  Tables are also unnecessary for numbered translation exercises.
    """
    pipeline = PdfPipelineOptions()
    pipeline.do_table_structure = False
    # Windows machines without the Visual C++ toolchain cannot use torch.compile.
    # It is only a speed optimization and is not needed for correct extraction.
    pipeline.layout_options.engine_options.compile_model = False
    pipeline.ocr_options = RapidOcrOptions(
        backend="torch",
        lang=["ch"],
        force_full_page_ocr=True,
        use_cls=False,
    )
    return DocumentConverter(
        format_options={InputFormat.PDF: PdfFormatOption(pipeline_options=pipeline)}
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--book", type=Path, required=True)
    parser.add_argument("--answers", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--page-start", type=int, help="First 1-based page to convert (verification only).")
    parser.add_argument("--page-end", type=int, help="Last 1-based page to convert (verification only).")
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)

    convert_options = {}
    if args.page_start or args.page_end:
        if not (args.page_start and args.page_end):
            parser.error("--page-start and --page-end must be used together")
        convert_options["page_range"] = (args.page_start, args.page_end)
    converted = make_converter().convert(str(args.book), **convert_options)
    markdown = converted.document.export_to_markdown()
    (args.output / "book-docling.md").write_text(markdown, encoding="utf-8")
    answer_text = read_answer_pdf(args.answers)
    (args.output / "answers-extracted.txt").write_text(answer_text, encoding="utf-8")

    payload = make_payload(parse_book_sections(markdown), parse_answer_sections(answer_text))
    (args.output / "translation-data.json").write_text(
        json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"sections={len(payload['sections'])}")
    print(f"questions={sum(len(section['items']) for section in payload['sections'])}")
    print(f"unmatched_answers={','.join(payload['unmatchedAnswers']) or 'none'}")


if __name__ == "__main__":
    main()
