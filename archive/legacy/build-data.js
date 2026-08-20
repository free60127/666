const fs = require('fs');
const path = require('path');

function readModule(file) {
  const text = fs.readFileSync(file, 'utf8');
  return JSON.parse(text.replace(/^\s*module\.exports\s*=\s*/, '').replace(/;\s*$/, ''));
}

const root = path.resolve(__dirname, '..', '..');
const output = path.join(__dirname, 'data.js');
const imported = readModule(path.join(root, 'pages', 'question-banks.js'));
const mao = readModule(path.join(root, 'data.js'));

const byKey = key => imported.find(bank => bank.key === key);
// Cleanup is intentionally performed while generating data.js, so an
// accidental damaged run in a source document cannot reappear in the H5.
const GARBLED = /[釤呛俨匀谔鱉调硯錦渗呙铉們欤谦鸪饺竞荡赚輒坛買凍]/g;
const cleanText = value => typeof value === 'string' ? value.replace(GARBLED, '') : value;
const cleanQuestion = question => ({...question, title: cleanText(question.title), hint: cleanText(question.hint), answer: cleanText(question.answer), options: (question.options || []).map(cleanText)});
function repairEthicsQuestions(bank) {
  const questions = bank.questions.map(cleanQuestion);
  const fix = (id, patch) => { const question = questions.find(item => item.type === 'multi' && item.id === id); if (question) Object.assign(question, patch); };
  const fixShort = (id, answer) => {
    const question = questions.find(item => item.type === 'short' && item.id === id);
    if (question) question.answer = answer;
  };
  const congFei = {title: '深圳青年歌手丛飞在8年时间内，捐资上百万元资助很多贫困山区的失学儿童，而自己却身患癌症，负债17万元。有人这样评价他：“丛飞能够从帮助别人的过程中得到快乐。”丛飞的行为表明。', options: ['人的价值不包含个人的价值选择和目标设计等主观方面', '人的价值的大小取决于对社会的贡献', '人的价值不仅表现在物质方面，更表现在精神方面', '社会价值的实现总是以个人价值的牺牲为代价'], answer: 'BC'};
  [4, 21, 93].forEach(id => fix(id, congFei));
  const lawSupremacy = {title: '法律至上是指在国家或社会的所有规范中，法律是地位最高、效力最广、强制力最大的规范。法律至上具体表现为。', options: ['普遍适用性', '适当适用性', '优先适用性', '不可违抗性'], answer: 'ACD'};
  [15, 76].forEach(id => fix(id, lawSupremacy));
  // Restore point labels that disappeared when the Word source was extracted.
  fixShort(25, '网络生活中的道德要求，是人们在网络生活中为了维护正常的网络公共秩序需要共同遵守的基本道德准则，是社会公德在网络空间的运用和扩展。（1分）（1）正确使用网络工具。大学生要提高信息获取能力，加强信息辨识能力，增进信息应用能力，使网络成为开阔视野、提高能力的重要工具。（1分）（2）加强网络文明自律。大学生要文明上网，尊德守法、文明互动、理性表达，远离不良网站，防止沉迷网络，自觉维护良好网络秩序。（1分）（3）营造良好网络道德环境。大学生要反对网络暴力行为，维护网络道德秩序。应当带头引导网络舆论，对模糊认识要及时廓清，对怨气怨言要及时化解，对错误看法要及时纠正，促进网络空间日益清朗。（2分）');
  fixShort(31, '（1）建立完备的法律规范体系。是指以宪法为核心，由部门齐全、结构严谨、内部协调、体例科学、调整有效的法律及其配套法规所构成的法律规范系统。（1分）（2）高效的法治实施体系。是指执法、司法、守法等各个环节有效衔接、协调高效运转、持续共同发力。（1分）（3）严密的法治监督体系。是指以规范和约束公权力为重点建立的有效的法治化权力监督网络。（1分）（4）有力的法治保障体系。是指在法律制定、实施和监督过程中形成的结构完整、机制健全、资源充分、富有成效的保障系统。（1分）（5）完善的党内法规体系。是指内容科学、程序严密、配套完备、运行有效的党内制度及其运行、保障体系。（1分）');
  fixShort(32, '（1）社会主义核心价值观具有超越以往一切社会核心价值观的先进性，它集中体现了社会主义的本质属性，扎根于中华优秀传统文化的土壤，吸收借鉴了一切人类优秀文化的先进价值，是反映人类社会发展进步的价值理念。（2分）（2）社会主义核心价值观坚持人民历史主体地位，代表最广大人民的根本利益，反映最广大人民的价值诉求，引导最广大人民为实现美好社会理想而奋斗。人民性是社会主义核心价值观的根本特性。（2分）（3）社会主义核心价值观不仅真正地与社会主义制度相契合，与保障人民的根本利益相一致，而且因其真实可信而具有强大的道义力量。（1分）');
  return {...bank, questions};
}
function repairHistoryQuestions(bank) {
  const questions = bank.questions.map(cleanQuestion);
  const broken = questions.find(question => question.type === 'short' && question.id === 18 && question.title === '简述19世纪末，维新派对封建主义妥协的主要表现？');
  if (!broken) return {...bank, questions};
  broken.answer = '（1）政治上，不敢根本否定封建君主制度，幻想通过合法手段实现君主立宪。（2分）（2）经济上，没有触及封建主义经济基础——封建土地所有制。（2分）（3）思想上，虽提倡学习西方，却仍借孔子之名“托古改制”。（2分）';
  const repaired = questions.filter(question => !(question.type === 'short' && [19, 20, 21].includes(question.id) && !question.answer));
  repaired.forEach(question => { if (question.type === 'short' && question.id > 21) question.id -= 3; });
  return {...bank, questions: repaired};
}
const banks = [
  {...repairEthicsQuestions(byKey('ethics')), shortName: '大一上·思政', subtitle: '课程复习题库'},
  {...repairHistoryQuestions(byKey('history')), shortName: '大一下·近代史', subtitle: '课程复习题库'},
  {key: 'marx', name: '大二上·马克思主义基本原理', shortName: '大二上·马原', subtitle: '课程复习题库', questions: byKey('marx').questions.map(cleanQuestion)},
  {key: 'mao', name: '大二下·毛概', shortName: '大二下·毛概', subtitle: '课程复习题库', questions: mao.map(cleanQuestion)},
  {...byKey('xi'), questions: byKey('xi').questions.map(cleanQuestion), shortName: '大三上·习思', subtitle: '课程复习题库'}
];

fs.writeFileSync(output, `window.POLITICS_BANKS=${JSON.stringify(banks)};\n`, 'utf8');
console.log(`Wrote ${output}`);
