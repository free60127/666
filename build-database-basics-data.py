"""Import the verified database-basics Word bank into the computer page."""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "计算机系列" / "data.js"
EXTRACT = Path(r"C:\Users\23674\AppData\Local\Temp\Review - codex-database-basics\extracted_content.md")

# One answer per source question.  Q82 is intentionally converted to a theory
# item below because its original answer grid is damaged in the Word document.
ANSWERS = list(
    "CABACBDCCB"
    "CBDDABBDCD"
    "DDAADDBBAD"
    "CBACDBCDCB"
    "CDCBCCDCCB"
    "CBCBCCCCBD"
    "BDACBDACCA"
    "ADCACDDDDC"
    "BAABBCBCDD"
    "BDCDDBCDCD"
    "CDBBACDBC"
)


def normalise(text: str) -> str:
    text = text.replace("\r", "").replace("\n[PAGE 1]\n", "\n").replace("\n[PAGE 2]\n", "\n")
    text = text.replace("\\*", "*").replace("？", "?")
    text = re.sub(r"[“”]", '"', text)
    # Some Word options share one line; make every A-D marker a real boundary.
    text = re.sub(r"(?<!\n)(?<!^)(?=\s*[A-D][）．.、])", "\n", text)
    return text.strip()


QUESTION = re.compile(r"(?m)^(?=[（(][）)]\s*\d+[．.])")
OPTION = re.compile(r"(?ms)^([A-D])[）．.、]\s*(.*?)(?=^[A-D][）．.、]|\Z)")


source = normalise(EXTRACT.read_text(encoding="utf-8"))
starts = list(QUESTION.finditer(source))
chunks = [source[m.start():starts[i + 1].start() if i + 1 < len(starts) else len(source)] for i, m in enumerate(starts)]
if len(chunks) != 109 or len(ANSWERS) != 109:
    raise RuntimeError(f"Expected 109 questions and answers, found {len(chunks)} and {len(ANSWERS)}")

questions = []
for number, chunk in enumerate(chunks, 1):
    chunk = re.sub(r"^[（(][）)]\s*\d+[．.]\s*", "", chunk)
    first = re.search(r"(?m)^A[）．.、]", chunk)
    title = normalise(chunk[:first.start()] if first else chunk)
    options = [normalise(value) for _, value in OPTION.findall(chunk[first.start():])] if first else []
    questions.append({
        "type": "single",
        "title": title,
        "hint": "数据库与 Visual FoxPro 基础",
        "options": options,
        "answer": ANSWERS[number - 1],
        "id": number,
    })

q82 = questions[90]
q82.update({
    "type": "theory",
    "options": [],
    "answer": "依次输出：44、19、2。原 Word 的四组选项在转换时表格错位，无法可靠保留，因此按程序分析题展示。",
})

for question in questions:
    if question["type"] == "single" and len(question["options"]) < 3:
        raise RuntimeError(f"Question {question['id']} has too few options: {question['options']}")

bank = {
    "key": "computer-database-basics",
    "name": "计算机 · 数据库基础知识",
    "shortName": "数据库基础",
    "subtitle": "数据库与 Visual FoxPro 基础练习（已核对答案）",
    "questions": questions,
}

prefix = "window.POLITICS_BANKS="
raw = DATA.read_text(encoding="utf-8")
if not raw.startswith(prefix) or not raw.rstrip().endswith(";"):
    raise RuntimeError("Unexpected data.js format")
banks = json.loads(raw[len(prefix):].rstrip()[:-1])
banks = [item for item in banks if item.get("key") != bank["key"]]
banks.append(bank)
DATA.write_text(prefix + json.dumps(banks, ensure_ascii=False, separators=(",", ":")) + ";\n", encoding="utf-8")
print(f"Wrote {len(questions)} database-basics questions.")
