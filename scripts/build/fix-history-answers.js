// 依据《大一下近代史.docx》修正 history 题库答案（2026-08-20）
// 运行：node scripts/build/fix-history-answers.js
const fs = require('fs');
const path = require('path');
const root = 'D:/study/sb/study platform';
const file = path.join(root, 'source/politics.json');
const politics = JSON.parse(fs.readFileSync(file, 'utf8'));
const history = politics.find(b => b.key === 'history');

const find = (type, id) => history.questions.find(q => q.type === type && q.id === id);
let n = 0;
const log = msg => { console.log(msg); n++; };

// ---- single：文档 4 选项补全（原题选项残缺） ----
// id 32/116/192「1956年中共八大主要任务」：文档答案 D=把我国从落后的农业国变为先进的工业国
const baDaOpts = ['争取国家财政经济状况的根本好转', '完成社会主义改造', '正确处理人民内部矛盾', '把我国从落后的农业国变为先进的工业国'];
for (const id of [32, 116, 192]) {
  const q = find('single', id);
  if (!q) { console.log('skip single ' + id); continue; }
  q.options = baDaOpts.slice();
  q.answer = 'D';
  log('single#' + id + ' options 补全为文档 4 项，答案 → D');
}
// id 78/96「1947年宣言口号」：题干内嵌选项文本清除，options 替换为文档 4 项，答案 B
const sloganTitle = '1947年10月10日，中国人民解放军总部发表宣言提出的口号是 。';
const sloganOpts = ['和平、民主、团结', '打倒蒋介石，解放全中国', '将革命进行到底', '巩固国内和平，实现民主改革'];
for (const id of [78, 96]) {
  const q = find('single', id);
  if (!q) { console.log('skip single ' + id); continue; }
  q.title = sloganTitle;
  q.options = sloganOpts.slice();
  q.answer = 'B';
  log('single#' + id + ' 题干去内嵌选项，options 替换为文档 4 项，答案 → B');
}
// id 25/109/169「1935年事变」：题干错字「大对华侵略」→「为扩大对华侵略」（文档原文）
for (const id of [25, 109, 169]) {
  const q = find('single', id);
  if (!q) { console.log('skip single ' + id); continue; }
  q.title = '1935年，日本帝国主义为扩大对华侵略而发动的事变是 。';
  log('single#' + id + ' 题干修正为「为扩大对华侵略」');
}

// ---- single：答案字母修正（选项文本与文档一致，仅答案标错） ----
const singleFix = {
  168: 'C', // 全面深化改革总目标 → 现代化
  170: 'D', // 戊戌维新不正确 → 推翻清政府
  171: 'A', // 第一个资产阶级革命政党 → 同盟会
  172: 'B', // 第一部资产阶级共和国宪法 → 临时约法
  173: 'A', // 1913年发动 → 二次革命
  174: 'D', // 五四前新文化运动 → 资产阶级民主主义
  176: 'B', // 反帝反封建纲领会议 → 中共二大
  177: 'A', // 大革命转变关键会议 → 八七会议
  178: 'C', // 八七会议总方针 → 土地革命和武装反抗国民党
  180: 'B', // 1938年3月正面战场大捷 → 台儿庄
  188: 'A', // 一五计划集中力量 → 重工业
  189: 'D', // 新时代主要矛盾 → 不平衡不充分
  190: 'C', // 党的中心任务 → 中国式现代化
  191: 'C', // 经济阶段 → 高速增长 高质量发展
  193: 'A', // 三个主体三个补充 → 陈云
  194: 'C', // 四个现代化会议 → 三届全国人大
  195: 'D', // 十六届四中全会 → 构建社会主义和谐社会
};
for (const [id, ans] of Object.entries(singleFix)) {
  const q = find('single', +id);
  if (!q) { console.log('skip single ' + id); continue; }
  q.answer = ans;
  log('single#' + id + ' 答案 → ' + ans);
}

// ---- multi ----
// id 15「进京赶考」：题干重构（去除与 options[0] 的粘连），options 对齐文档 5 项（文档顺序 C=防止骄傲麻痹 D=防止享乐腐化）
{
  const q = find('multi', 15);
  if (q) {
    q.title = '1949年3月中共中央离开西柏坡迁往北平。毛泽东说，今天是进京赶考的日子，我们决不当李自成，我们希望考个好成绩。这句话的意思是 。';
    q.options = ['避免农民战争中的流寇主义', '克服农民阶级的私有观念', '防止产生骄傲麻痹思想', '防止干部中出现享乐腐化作风', '克服大汉族主义'];
    q.answer = 'CD'; // 按新选项顺序：C=防止骄傲麻痹、D=防止享乐腐化，与文档答案 CD 一致
    log('multi#15 题干重构，options 对齐文档 5 项，答案 → CD');
  }
}
const multiFix = {
  37: 'ACD', // 大革命作用（缺 C 人民群众主要发动者和组织者）
  38: 'AB',  // 主要矛盾（八大正确表述，文档组8/10=AB）
  39: 'ABCD',// 民主党派社会基础
  40: 'AB',  // 民族资产阶级两面性
  41: 'BC',  // 真理标准讨论意义
  58: 'AD',  // 主观主义表现形式（教条主义+经验主义）
  59: 'ACD', // 同 37 重复版
  60: 'AB',  // 同 38 重复版
  61: 'ACD', // 五四运动显著区别
};
for (const [id, ans] of Object.entries(multiFix)) {
  const q = find('multi', +id);
  if (!q) { console.log('skip multi ' + id); continue; }
  q.answer = ans;
  log('multi#' + id + ' 答案 → ' + ans);
}

fs.writeFileSync(file, JSON.stringify(politics, null, 2), 'utf8');
console.log('\n完成，共修改 ' + n + ' 题 → ' + file);
