import json
import re
from pathlib import Path

from docx import Document


SOURCE_CANDIDATES = (
    Path(r"D:\study\学校课程开源项目\vfp1复习.docx"),
    Path(r"C:\Users\23674\AppData\Local\Temp\codex-vfp1-review.docx"),
)
OUTPUT = Path(__file__).parent / "计算机系列" / "data.js"
KEY = "computer-vfp1-review"

# These answers were independently checked from the VFP command semantics and
# by tracing each program.  Items 4, 12 and 13 are deliberately excluded: the
# original Word source has damaged content or multiple incompatible choices.
SINGLE_ANSWERS = {
    1: "D", 2: "D", 3: "D", 5: "C", 6: "B", 7: "C", 8: "D", 9: "A", 10: "B", 11: "A",
    15: "D", 16: "C", 17: "B", 18: "C", 19: "C", 20: "B", 21: "D", 22: "B", 23: "D",
    24: "B", 25: "D", 26: "C", 27: "D", 29: "C", 30: "D", 31: "D", 32: "D", 33: "D",
    35: "C", 36: "D", 37: "A", 38: "C", 39: "D", 40: "C", 41: "D", 42: "C", 43: "D",
    44: "D",
}

THEORY_ANSWERS = {
    14: "输入 2、3 后，a=5，b=3，p=11。",
    28: "输入 -2、5、30 时，Y 分别为 -3、26、91。",
    34: "LOOP。它跳过本次循环余下语句，回到循环开始继续下一次循环。",
    45: "当 X 初值为 8、9、10 时，循环分别执行 4 次、3 次、2 次。",
    46: "依次输出：\n!!!\n$$$\n$$$\n!!!\n$$$\n$$$\n!!!\n$$$\n$$$",
    47: "1）(1) S=S+X*X；(2) X=X+1。\n2）(1) GO BOTTOM；(2) NOT BOF()；(3) SKIP -1。\n3）(1) LIST NEXT 3；(2) SKIP -4；(3) LIST NEXT 5。",
}

SECTION_HEADINGS = {
    "input、accept、wait命令；单分支if语句",
    "双分支if语句、if语句的嵌套、多分支do case 语句",
    "循环语句练习：",
}
QUESTION_START = re.compile(r"^(\d+)[（(].*?[）)]\s*\d+[．.]\s*(.*)$")
OPTION_START = re.compile(r"^([A-D])[）.．]\s*(.*)$")


def compact(text):
    return re.sub(r"\s+", " ", text or "").strip()


def parse_questions(lines):
    questions = []
    current = None
    option_index = None

    def finish():
        nonlocal current
        if current:
            questions.append(current)
        current = None

    for raw in lines:
        text = compact(raw)
        if not text:
            continue
        start = QUESTION_START.match(text)
        if start:
            finish()
            current = {"serial": int(start.group(1)), "prompt": [start.group(2)], "options": []}
            option_index = None
            continue
        if not current or text in SECTION_HEADINGS:
            continue
        option = OPTION_START.match(text)
        if option:
            current["options"].append(option.group(2))
            option_index = len(current["options"]) - 1
        elif option_index is None:
            current["prompt"].append(text)
        else:
            current["options"][option_index] += "\n" + text
    finish()
    return questions


def load_existing_banks():
    source = OUTPUT.read_text(encoding="utf-8").strip()
    prefix = "window.POLITICS_BANKS="
    if not source.startswith(prefix) or not source.endswith(";"):
        raise RuntimeError("Existing data.js has an unexpected format.")
    return json.loads(source[len(prefix):-1])


def build_vfp_bank(records):
    by_serial = {record["serial"]: record for record in records}
    expected = set(SINGLE_ANSWERS) | set(THEORY_ANSWERS)
    missing = expected - set(by_serial)
    if missing:
        raise RuntimeError(f"Could not find source questions: {sorted(missing)}")

    questions = []
    for serial in sorted(expected):
        record = by_serial[serial]
        title = "\n".join(record["prompt"])
        if serial in SINGLE_ANSWERS:
            if not 2 <= len(record["options"]) <= 4:
                raise RuntimeError(f"Question {serial} has an unexpected option count: {len(record['options'])}")
            questions.append({
                "type": "single",
                "title": title,
                "hint": "VFP 程序设计",
                "options": record["options"],
                "answer": SINGLE_ANSWERS[serial],
                "id": len(questions) + 1,
            })
        else:
            questions.append({
                "type": "theory",
                "title": title,
                "hint": "程序分析与填空",
                "options": [],
                "answer": THEORY_ANSWERS[serial],
                "id": len(questions) + 1,
            })

    return {
        "key": KEY,
        "name": "计算机 · VFP1复习",
        "shortName": "VFP1复习",
        "subtitle": "Visual FoxPro 程序设计练习（参考答案已人工核对）",
        "questions": questions,
    }


source = next((path for path in SOURCE_CANDIDATES if path.exists()), None)
if source is None:
    searched = "\n".join(str(path) for path in SOURCE_CANDIDATES)
    raise FileNotFoundError(f"Could not find vfp1复习.docx. Searched:\n{searched}")

document = Document(source)
records = parse_questions(paragraph.text for paragraph in document.paragraphs)
bank = build_vfp_bank(records)
banks = [item for item in load_existing_banks() if item.get("key") != KEY]
banks.append(bank)
OUTPUT.write_text("window.POLITICS_BANKS=" + json.dumps(banks, ensure_ascii=False, separators=(",", ":")) + ";\n", encoding="utf-8")
single_count = sum(question["type"] == "single" for question in bank["questions"])
theory_count = len(bank["questions"]) - single_count
print(f"Wrote {OUTPUT} with {single_count} single-choice and {theory_count} program-analysis questions.")
