"""Fast, resumable OCR pass used to locate translation exercises in a scanned book.

This deliberately uses the same RapidOCR models installed for Docling, but skips the
heavier layout model.  Docling is then used on only the matching page ranges.
"""

from __future__ import annotations

import argparse
import re
from pathlib import Path

import numpy as np
import pymupdf
from rapidocr import RapidOCR
from rapidocr.inference_engine.base import EngineType


MATCH_RE = re.compile(r"(?:e|c)?xercise|translate", re.IGNORECASE)


def make_ocr() -> RapidOCR:
    return RapidOCR(
        params={
            "Det.engine_type": EngineType.TORCH,
            "Cls.engine_type": EngineType.TORCH,
            "Rec.engine_type": EngineType.TORCH,
            "Global.use_cls": False,
        }
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--book", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--start", type=int, default=1)
    parser.add_argument("--end", type=int)
    parser.add_argument("--scale", type=float, default=1.0)
    args = parser.parse_args()

    args.output.mkdir(parents=True, exist_ok=True)
    document = pymupdf.open(args.book)
    last_page = min(args.end or len(document), len(document))
    first_page = max(args.start, 1)
    ocr = make_ocr()
    hits: list[str] = []

    for page_number in range(first_page, last_page + 1):
        text_file = args.output / f"page-{page_number:04}.txt"
        if text_file.exists():
            text = text_file.read_text(encoding="utf-8")
        else:
            page = document[page_number - 1]
            image = page.get_pixmap(
                matrix=pymupdf.Matrix(args.scale, args.scale), colorspace=pymupdf.csGRAY
            )
            array = np.frombuffer(image.samples, np.uint8).reshape(
                image.height, image.width, image.n
            )
            result = ocr(array)
            text = "\n".join(result.txts or ())
            text_file.write_text(text, encoding="utf-8")

        if MATCH_RE.search(text):
            hits.append(f"{page_number}: {text.replace(chr(10), ' ')[:260]}")
            print(hits[-1], flush=True)
        elif page_number % 10 == 0:
            print(f"checked page {page_number}/{last_page}", flush=True)

    (args.output / f"hits-{first_page:04}-{last_page:04}.txt").write_text(
        "\n".join(hits), encoding="utf-8"
    )


if __name__ == "__main__":
    main()
