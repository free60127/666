import json
from pathlib import Path


OUTPUT = Path(__file__).parent / "计算机系列" / "data.js"
KEY = "computer-vfp2-review"


def question(source_id, title, options, answer, hint="VFP 数据类型与表达式"):
    return {
        "type": "single",
        "title": f"{source_id}．{title}",
        "hint": hint,
        "options": options,
        "answer": answer,
    }


def theory_question(source_id, title, answer, hint="VFP 程序分析"):
    return {
        "type": "theory",
        "title": f"{source_id}．{title}",
        "hint": hint,
        "options": [],
        "answer": answer,
    }


# 题目由图片型 Word OCR 后，再用文字版 Word 对照校正；答案依据 VFP 命令、
# 数据类型和函数语义人工核对。
QUESTIONS = [
    question(1, "在 Visual FoxPro 数据库管理系统中，下列数据属于常量的是（）。", ["02/07/97", "T", ".Y.", "TOP"], "C"),
    question(2, "将逻辑真值赋给内存变量 LZ 的正确方法是（）。", ["LZ=\".T.\"", "STORE \"T\" TO LZ", "LZ=TURE", "STORE .T. TO LZ"], "D"),
    question(3, "在 Visual FoxPro 的命令窗口中，执行下列命令后的显示结果是（）。\nX=CTOD(\"07/27/98\")\nY=CTOD(\"07/17/98\")\n? Y-X", ["10", "11", "-10", "错误"], "C"),
    question(4, "在下列 Visual FoxPro 表达式中，结果为日期类型的正确表达式是（）。", ["DATE()+TIME()", "DATE()+30", "DATE()-CTOD(\"01/01/98\")", "356-DATE()"], "B"),
    question(5, "在下列 Visual FoxPro 表达式中，结果为真（.T.）的是（）。", ["\"112\">\"85\"", "[李明]=[ 李明]", "CTOD(\"03/21/98\")>CTOD(\"03/12/98\")", "\"男\"$性别"], "C"),
    question(6, "假定 X=2，执行命令 ? X=X+1 后，其结果是（）。", ["3", "2", ".T.", ".F."], "D"),
    question(7, "在下列 Visual FoxPro 表达式中，运算结果为字符串的是（）。", ["\"1234\"-\"43\"", "\"ABCD\"+\"XYZ\"=\"ABCDXYZ\"", "CTOD(DATE())>\"04/05/97\"", "CTOD(\"04/05/97\")"], "A"),
    question(8, "在下列关于内存变量的叙述中，错误的一条是（）。", ["一个数组中的各元素的数据类型必相同", "内存变量的类型取决于其值的类型", "内存变量的类型可以改变", "数组在使用之前要用 DIMENSION 或 DECLARE 语句进行定义"], "A"),
    theory_question(9, "有如下命令序列，执行后 Z 的值是什么？\nSTORE \"456 \" TO X\nSTORE \"123 \"+X TO Y\nSTORE Y-\"789\" TO Z", "Z 的值为 \"123 456789 \"。在 VFP 中，字符 “-” 运算会把左操作数 Y 的尾随空格移到右操作数 \"789\" 的末尾；因此 “123” 与 “456” 间保留一个空格，末尾也保留一个空格。原 Word 的 A-D 选项无法表达这一正确结果，故按程序分析题展示。", "VFP 字符串运算"),
    question(10, "下列选项中，不能用作 Visual FoxPro 变量名的是（）。", ["8ABCS", "A_001_BC", "S0000", "xyz"], "A"),
    question(11, "下列表达式中，不是字符型表达式的是（）。", ["\"9\"+\"5\"", "[7]-\"1\"", "3+6", "[0]"], "C"),
    question(12, "用 DIMENSION 命令定义数组后，各数组元素在没赋值之前的数据类型是（）。", ["逻辑型", "数值型", "字符型", "未定义"], "A"),
    question(13, "Visual FoxPro 数据库文件中的字段是一种（）。", ["常量", "变量", "函数", "运算符"], "B"),
    question(14, "Visual FoxPro 中的变量有两类，它们分别是（）。", ["内存变量和字段变量", "局部变量和全局变量", "逻辑变量和日期变量", "字符型变量和数值型变量"], "A"),
    question(15, "用 DIMENSION Q(3,5) 命令定义一个数组 Q，该数组的下标变量数目是（）。", ["15", "24", "8", "10"], "A"),
    question(16, "在 Visual FoxPro 中，下述字符串表示方法中正确的是（）。", ["\"计算机\" 水平 \"考试\"", "[计算机 \"水平\" 考试]", "{计算机 \"水平\" 考试}", "[计算机[水平]考试]"], "B"),
    question(17, "在 Visual FoxPro 中，数据类型比较说法不正确的是（）。", ["\"56\">\"234\"", "\"bcd\">\"abc\"", ".T.>.F.", "{^2007/12/12}>{^2008/12/12}"], "D"),
    question(18, "有以下命令序列，执行后屏幕显示的值是（）。\nSTORE 15 TO X\nSTORE 21 TO Y\n? (Y=X) OR (X<Y)", [".T.", ".F.", "1", "0"], "A"),
    question(19, "在下列关于 Visual FoxPro 数组的叙述中，错误的一条是（）。", ["用 DIMENSION 和 DECLARE 命令都可以定义数组", "Visual FoxPro 支持一维数组、二维数组、三维数组", "一个数组中各数组元素的数据类型可以不相同", "新定义数组的各个数组元素的初始值为 .F."], "B"),
    question(20, "在 Visual FoxPro 中，可以在同类数据之间进行“-”运算的数据类型是（）。", ["数值型、字符型、逻辑型", "数值型、字符型、日期型", "数值型、日期型、逻辑型", "逻辑型、字符型、日期型"], "B"),
    question(21, "以下赋值语句正确的是（）。", ["STORE 8 TO X,Y", "STORE 8,9 TO X,Y", "X=8,Y=9", "X=Y=8"], "A"),
    question(22, "数据库系统的核心是（）。", ["数据库", "操作系统", "数据", "数据库管理系统"], "D"),
    question(23, "将 1998 年 12 月 27 日存入日期型变量 RQ 的正确方法是（）。", ["STORE 12/27/98 TO RQ", "STORE DTOC(\"12/27/98\") TO RQ", "STORE CTOD(\"12/27/98\") TO RQ", "STORE \"12/27/98\" TO RQ"], "C"),
    question(24, "如果内存变量与字段变量均有变量名“姓名”，引用内存变量的正确方法是（）。", ["M.姓名", "M=>姓名", "姓名", "不能引用"], "A"),
    question(25, "设 A=[6*8-2]，B=6*8-2，C=\"6*8-2\"，在下列表示形式中，属于合法的表达式有（）。", ["A+B", "B+C", "C-A", "C-B"], "C"),
    question(26, "在下列 Visual FoxPro 表达式中，运算结果一定是逻辑值的是（）。", ["字符表达式", "算术表达式", "关系表达式", "日期运算表达式"], "C"),
    question(27, "在下列表达式中不符合 Visual FoxPro 语法要求的是（）。", ["04/05/97", "T+t", "1234", "2X>15"], "D"),
    question(28, "设 X 为数值型变量，Y 为字符型变量，下列符合 Visual FoxPro 语法要求的表达式是（）。", ["NOT .T.", "Y*5", "X.25", "2X>15"], "A"),
    question(29, "在 Visual FoxPro 中，命令 ? 与命令 ?? 的区别是（）。", ["? 在当前光标位置输出表达式结果；?? 在下一行开始输出", "与 A 相反", "? 可以输出一个常量、变量或表达式；?? 可以输出若干个常量、变量或表达式", "? 在显示器上输出；?? 在打印机上输出"], "B"),
    question(30, "假定已经执行了命令 M=[28+2]，再执行命令 ? M，屏幕将显示（）。", ["30", "28+2", "[28+2]", "30.00"], "B"),
    question(31, "关系数据库管理系统能够实现的三种基本关系操作是（）。", ["排序、查找、索引", "选择、投影、连接", "建库、录入、复制", "显示、统计、排序"], "B"),
    question(32, "设 A=\"123\"、B=\"234\"，下列表达式中，其运算结果为逻辑假的是（）。", ["NOT(A=B OR B$(\"13579\"))", "NOT A$\"ABC\" AND (A<>B)", "NOT(A<>B)", "NOT(A>=B)"], "C"),
    question(33, "下列表达式，不是 Visual FoxPro 数值型表达式的是（）。", ["185+2", "-32", "0-0", "[185+2]"], "D"),
    question(34, "设当前数据库文件中有一个字段名为 ABC，记录指针指向记录的该字段值是 123；同时有一个内存变量 ABC，其值为 -123。执行命令 ?ABC 后，屏幕显示的信息是（）。", ["123", "-123", "123 -123", "错误信息"], "A"),
    question(35, "在 Visual FoxPro 中，正确的日期型常数是（）。", ["08/26/2006", "\"08/26/2006\"", "2006.08.26", "{^2006-08-26}"], "D"),
    question(36, "数据库文件中有日期型字段“出生日期”，假设今天是 1998 年 9 月 23 日，判断小于 20 岁的表达式是（）。", ["出生日期<CTOD(\"09/23/78\")", "出生日期>DTOC(\"06/23/78\")", "出生日期<DTOC(\"09/23/78\")", "出生日期>CTOD(\"09/23/78\")"], "D"),
    question(37, "顺序执行下列命令后，下列选项中合法的表达式只有（）。\nX=\"50\"\nY=6*8\nZ=LEFT(\"VISUAL FOXPRO\",3)", ["X+Y", "Y+Z", "X-Z+Y", "&X+Y"], "D"),
    question(38, "函数 ABS(-78.5) 返回的结果是（）。", ["-78.5", "78.5", "78", "79"], "B"),
    question(39, "在下列表达式中，其结果为字符型数据的是（）。", ["\"125\"-\"100\"", "\"ABC\"+\"XYZ\"=\"ABCXYZ\"", "CTOD(\"09/05/06\")", "DTOC(DATE())>\"09/05/06\""], "A"),
    question(40, "函数 INT(-117.65) 返回的结果是（）。", ["-117", "-118", "117", "118"], "A", "VFP 函数"),
    question(41, "函数 MAX(1,-90) 返回的结果是（）。", ["-90", "-89", "89", "1"], "D", "VFP 函数"),
    question(42, "函数 STR(2781.5785,7,2) 返回的结果是（）。", ["2781", "2781.58", "2781.579", "81.5785"], "B", "VFP 函数"),
    question(43, "已知内存变量 X=5，函数 IIF(X=LEN(SPACE(5)),1,-1) 的值是（）。", [".T.", ".F.", "-1", "1"], "D", "VFP 函数"),
    question(44, "函数 LEN(SPACE(3)-SPACE(2)) 返回的值是（）。", ["1", "2", "3", "5"], "D", "VFP 函数"),
    question(45, "表达式 CTOD(\"12/30/2006\")-CTOD(\"12/10/2006\") 运算结果的数据类型是（）。", ["逻辑型", "字符型", "数值型", "日期型"], "C", "VFP 函数"),
]


def load_existing_banks():
    source = OUTPUT.read_text(encoding="utf-8").strip()
    prefix = "window.POLITICS_BANKS="
    if not source.startswith(prefix) or not source.endswith(";"):
        raise RuntimeError("Existing data.js has an unexpected format.")
    return json.loads(source[len(prefix):-1])


banks = [bank for bank in load_existing_banks() if bank.get("key") != KEY]
for index, item in enumerate(QUESTIONS, 1):
    item["id"] = index
banks.append({
    "key": KEY,
    "name": "计算机 · VFP2复习",
    "shortName": "VFP2复习",
    "subtitle": "Visual FoxPro 数据类型、表达式与函数练习（图片 OCR 后人工核对）",
    "questions": QUESTIONS,
})
OUTPUT.write_text("window.POLITICS_BANKS=" + json.dumps(banks, ensure_ascii=False, separators=(",", ":")) + ";\n", encoding="utf-8")
print(f"Wrote {OUTPUT} with {len(QUESTIONS)} VFP2 questions.")
