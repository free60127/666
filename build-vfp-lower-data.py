"""Build the verified VFP lower-review bank from the skill-extracted Word text."""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "计算机系列" / "data.js"
EXTRACT = Path(r"C:\Users\23674\AppData\Local\Temp\codex-vfp-lower-extract\extracted_content.md")

SECTIONS = [
    "数据库的基本操作练习",
    "字段的有效性规则和记录的有效性规则",
    "程序文件基本练习",
    "input、accept、wait命令；单分支if语句",
    "双分支if语句、if语句的嵌套、多分支do case 语句",
    "循环语句练习",
    "过程与自定义函数练习",
]

# Answer keys were manually checked against Visual FoxPro command semantics.
KEYS = {
    SECTIONS[0]: list("DCACDBDCDDC A".replace(" ", "")),
    SECTIONS[2]: list("D D D B D B C C A B C C C".replace(" ", "")) + [
        "a=5，b=3，p=11。",
    ],
    SECTIONS[3]: list("DCACCBDBDB"),
    SECTIONS[4]: list("DCD") + ["当 X=-2 时 Y=-3；当 X=5 时 Y=26；当 X=30 时 Y=91。"],
    SECTIONS[5]: list("CDDDDACDACDCDCDD") + [
        "循环执行次数分别为 4 次、3 次、2 次。",
        "依次输出：!!!、$$$、$$$、!!!、$$$、$$$、!!!、$$$。",
        "1）S=S+X*X；X=X+1。\n2）GO BOTTOM；NOT BOF()；SKIP -1。\n3）DISPLAY NEXT 3；SKIP -4；DISPLAY NEXT 5。",
    ],
    SECTIONS[6]: list("BBDDCDCCCADCADB"),
}


def normalise(text: str) -> str:
    text = text.replace("\r", "").replace("\n[PAGE 2]\n", "\n")
    text = text.replace("\n[PAGE 1]\n", "\n")
    text = re.sub(r"[“”]", '"', text)
    text = re.sub(r"(?<!\n)\s+([A-D])[）．.]", r"\n\1）", text)
    return text.strip()


def section_blocks(markdown: str):
    heading = re.compile(r"^\*\*(.+?)：?\*\*$", re.M)
    matches = list(heading.finditer(markdown))
    for i, match in enumerate(matches):
        name = match.group(1).strip().rstrip("：")
        end = matches[i + 1].start() if i + 1 < len(matches) else len(markdown)
        if name in SECTIONS:
            yield name, markdown[match.end():end]


QUESTION_START = re.compile(r"(?m)^(?=(?:\d+[（(][）)]\d+[．.]|[（(][）)]\d+[．.]))")
OPTION = re.compile(r"(?ms)^([A-D])[）．.]\s*(.*?)(?=^[A-D][）．.]|\Z)")


def parse_questions(section: str, body: str):
    starts = list(QUESTION_START.finditer(body))
    chunks = [body[m.start():starts[i + 1].start() if i + 1 < len(starts) else len(body)] for i, m in enumerate(starts)]
    result = []
    for number, chunk in enumerate(chunks, 1):
        chunk = normalise(re.sub(r"^(?:\d+[（(][）)]|[（(][）)])\d+[．.]\s*", "", chunk))
        options = []
        first_option = re.search(r"(?m)^A[）．.]", chunk)
        title = chunk[:first_option.start()].strip() if first_option else chunk
        if first_option:
            options = [normalise(value).replace("\\*", "*") for _, value in OPTION.findall(chunk[first_option.start():])]
        result.append((number, normalise(title).replace("\\*", "*"), options))
    return result


markdown = EXTRACT.read_text(encoding="utf-8")
questions = []
for section, body in section_blocks(markdown):
    if section == SECTIONS[1]:
        continue  # The red heading has no question in the source Word file.
    parsed = parse_questions(section, body)
    answers = KEYS[section]
    if len(parsed) != len(answers):
        raise RuntimeError(f"{section}: parsed {len(parsed)} questions, expected {len(answers)}")
    for display_number, (title, options), answer in zip(range(1, len(parsed) + 1), [(x[1], x[2]) for x in parsed], answers):
        questions.append({
            "type": "single" if options else "theory",
            "title": title,
            "hint": section,
            "options": options,
            "answer": answer,
            "id": len(questions) + 1,
            "section": section,
            "displayNumber": display_number,
            **({"beforeSections": [SECTIONS[1]]} if section == SECTIONS[2] and display_number == 1 else {}),
        })

bank = {
    "key": "computer-vfp-lower-review",
    "name": "计算机 · VFP复习下（精简）",
    "shortName": "VFP复习下",
    "subtitle": "按原 Word 红色小标题分组；每组题号从 1 开始",
    "questions": questions,
}

prefix = "window.POLITICS_BANKS="
raw = DATA.read_text(encoding="utf-8")
banks = json.loads(raw[len(prefix):].rstrip()[:-1])
banks = [item for item in banks if item.get("key") != bank["key"]]
for item in banks:
    if item.get("key") == "computer-vfp2-review":
        q9 = next(question for question in item["questions"] if question["id"] == 9)
        q9.update({
            "type": "single",
            "title": "9．有如下命令序列，执行后 Z 的值是什么？\nSTORE \"456 \" TO X\nSTORE \"123 \"+X TO Y\nSTORE Y-\"789\" TO Z",
            "hint": "VFP 字符串运算",
            "options": ["\"\"", "\" 789\"", "\"123 \"", "\"  \""],
            "answer": "B",
        })
        break
else:
    raise RuntimeError("VFP2 bank not found")
banks.append(bank)
DATA.write_text(prefix + json.dumps(banks, ensure_ascii=False, separators=(",", ":")) + ";\n", encoding="utf-8")
print(f"Wrote {len(questions)} VFP lower-review questions.")
