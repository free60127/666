import json
import re
from pathlib import Path

from docx import Document

SOURCE = Path(r"D:\study\学校课程开源项目\上学期入库试题.docx")
OUTPUT = Path(__file__).parent / "计算机系列" / "data.js"


def compact(text):
    return re.sub(r"\s+", " ", text or "").strip()


def parse_questions(lines):
    # Original question lines use forms such as “【C】1、题干”.
    question_start = re.compile(r"^[【\[（(]\s*([A-D])\s*[】\]）)]\s*(\d+)\s*[、.．]?\s*(.*)$", re.I)
    option_start = re.compile(r"^([A-D])\s*[、.．)）]\s*(.*)$", re.I)
    questions, current, option = [], None, None

    def finish():
        nonlocal current
        if not current:
            return
        current["title"] = compact(current["title"])
        current["options"] = [compact(item) for item in current["options"]]
        if current["title"] and len(current["options"]) >= 2:
            current["id"] = len(questions) + 1
            questions.append(current)
        current = None

    for raw in lines:
        text = compact(raw)
        if not text:
            continue
        matched = question_start.match(text)
        if matched:
            finish()
            current = {"type": "single", "title": matched.group(3), "hint": "", "options": [], "answer": matched.group(1).upper()}
            option = None
            continue
        if not current:
            continue
        matched = option_start.match(text)
        if matched and matched.group(1).upper() == chr(ord("A") + len(current["options"])):
            current["options"].append(matched.group(2))
            option = len(current["options"]) - 1
        elif option is None:
            current["title"] += " " + text
        else:
            current["options"][option] += " " + text
    finish()
    return questions


document = Document(SOURCE)
questions = parse_questions([paragraph.text for paragraph in document.paragraphs])
if len(questions) < 100:
    raise RuntimeError(f"Only parsed {len(questions)} questions; source format needs review.")

bank = [{
    "key": "computer-first-semester",
    "name": "计算机 · 上学期入库试题",
    "shortName": "上学期入库试题",
    "subtitle": "计算机基础与 Visual FoxPro 题库",
    "questions": questions,
}]
OUTPUT.write_text("window.POLITICS_BANKS=" + json.dumps(bank, ensure_ascii=False, separators=(",", ":")) + ";\n", encoding="utf-8")
print(f"Wrote {OUTPUT} with {len(questions)} questions")
