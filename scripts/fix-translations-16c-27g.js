// 数据修复：翻译 16C / 27G 题号粘连+答案错位（旧站提取时 #8/#2 被粘进前题，答案整体错位 1）。
// 依据：答案书 PDF 页 70-72（16C）、页 140-141（27G）OCR 与 pdf-keys.json 交叉核对，共 20 题。
// 用法：node scripts/fix-translations-16c-27g.js（执行前自动备份 .bak-ocr；幂等：已 20 题且题目匹配则跳过）
const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'source', 'translations.json');
const data = JSON.parse(fs.readFileSync(file, 'utf8'));

const SECTIONS = {
  '16C': {
    questions: [
      '据说，她能说几种外语。',
      '据悉，地震后许多人无家可归（homeless）。',
      '不言而喻，这是最近谈判（recent negotiations）的结果。',
      '大家认为她已经康复。',
      '估计总统即将发表声明。',
      '这个问题明天上午讨论吗？',
      '这件事马上可以做。',
      '这项动议（motion）通过了吗？',
      '这水库将提前完工。',
      '现在广播里正在教唱新歌。',
      '首先一定要保证质量。',
      '浦东又办了一所大学。',
      '有人建议会议推迟到下星期四举行。',
      '必须承认中国还是一个发展中国家。',
      '必须指出台湾问题是中国的内政。',
      '这个英语读本很畅销。',
      '瓷槽（porcelain sink）容易洗净。',
      '这抽屉锁不上。',
      '牛奶容易变质。',
      '这条鱼能放到明天吗？'
    ],
    answers: [
      'It is said that she can speak several foreign languages. / She is said to be able to speak several foreign languages.',
      'It is known that many people are homeless after the Earthquake. / Many people are known to be homeless after the earthquake.',
      'It is understood that this is the result of recent negotiations. / This is understood to be the result of recent negotiations.',
      'It is thought that she has recovered. / She is thought to have recovered.',
      'It is expected that the President will make an announcement. / The President is expected to make an announcement.',
      'Will this question be discussed tomorrow morning?',
      'It can be done right away.',
      'Has this motion been adopted?',
      'The reservoir is going to be completed ahead of schedule.',
      'Some new songs are being taught now over the radio.',
      'Quality must be guaranteed first.',
      'Another college has been set up at Pudong.',
      'It is suggested that the meeting be put off till next Thursday.',
      'It must be recognized that China is still a developing country.',
      'It must be pointed out that Taiwan question is China\u2019s internal affairs.',
      'This English reader sells well.',
      'A porcelain sink cleans easily.',
      'This drawer won\u2019t lock.',
      'Milk spoils easily.',
      'Will this fish keep till tomorrow?'
    ]
  },
  '27G': {
    questions: [
      '他们将取道美国去南美洲。(by way of)',
      '上周抓获的那个间谍受雇于一个外国特务机关。(in the pay of)',
      '我紧跟在向导的后面，爬呀，爬呀，终于爬到了山顶。(in the wake of)',
      'Ted 因病没有出席会议。(on the score of)',
      '金融危机使千百万人民濒于饥饿。(on the verge of)',
      '一个民族必须掌握自己的命运，而不应任凭命运的摆布。(at the mercy of)',
      '我们不应以损坏环境为代价来发展经济。(at the expense of)',
      '我们学校的大门向所有的人敞开，不管什么种族，肤色和信仰。(irrespective of)',
      '不管花多少钱，她都要买一辆豪华车。(regardless of)',
      '我们必须秉承自力更生的原则来发展经济。(in line with)',
      '我们不可以借口发展工业而污染环境。(on/under the pretence of)',
      '我的邻居老汤姆孑身独处，只有一条名叫 Boris 的大黑狗和一只名叫 Blackie 的大黑猫和他做伴。(apart from)',
      '在 1937 年卢沟桥事变发生以前，中国的东北三省已被日本占领了 6 年。(previous to)',
      '那将军相信他所做的一切都是为了中国人民的利益。(in the interests of)',
      '我们必须随时提防敌人的破坏活动。(on the watch for)',
      '在警察方面仍然心存疑虑。(on the part of)',
      '由于金融危机，该国的经济已处于破产的边缘。(on the brink of)',
      '如果发生金融危机，一般老百姓将饱尝失业和通胀之苦。(in the event of)',
      '那船正顶着狂风全速行驶。(in the teeth of)',
      '他由于身体不好决定提前退休。(on the ground of)'
    ],
    answers: [
      'They are to go South America by way of the United States.',
      'The spy caught last week was in the pay of a foreign secret agency.',
      'In the wake of the guide, I climbed and climbed and finally got to the top of the mountain.',
      'Ted was absent from the meeting on the score of illness.',
      'Owing to the financial crisis, millions of people were living on the verge of starvation.',
      'A nation must be masters of themselves instead of living at the mercy of fate.',
      'We shouldn\u2019t promote economic growth at the expense of the environment.',
      'Our schools are open to all irrespective of race, color or creed.',
      'She is bent on buying an expensive car regardless of the cost.',
      'We must develop our economy in the line with the principle of self-reliance.',
      'We must not contaminate the environment on the pretence of developing industry.',
      'My neighbor Old Tom lived entirely alone, apart from a big black cat named Blackie and a big black dog called Boris.',
      'Previous to the Lugou Bridge Incident in 1937, China\u2019s three northeastern provinces had been under the Japanese occupation for 6 years.',
      'The general believed that all he did was in the interests of the Chinese people.',
      'We must always be on the watch for the enemy\u2019s subversive activities.',
      'There were still doubts on the part of the police.',
      'Owing to the financial crisis, that country\u2019s economy was on the brink of bankruptcy.',
      'In the event of a financial crisis, the common people will suffer from inflation and unemployment.',
      'The ship was sailing full steam in the teeth of a strong wind.',
      'He decided to retire ahead of time on the ground of ill health.'
    ]
  }
};

const clean = s => String(s).replace(/\s+/g, ' ').trim();
let fixedSections = 0;
for (const sec of data.sections) {
  const id = sec.id || sec.title || '';
  const patch = SECTIONS[id];
  if (!patch) continue;
  const items = sec.items || [];
  const already = items.length === 20 && items.every((it, i) => clean(it.question) === clean(patch.questions[i]));
  if (already) { console.log(id + ': 已修复，跳过'); continue; }
  fs.writeFileSync(file.replace(/\.json$/, '.bak-ocr'), JSON.stringify(data, null, 2) + '\n', 'utf8');
  sec.items = patch.questions.map((q, i) => ({ number: i + 1, question: q, answer: patch.answers[i] }));
  sec.expectedAnswerCount = 20;
  fixedSections++;
}
fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n', 'utf8');
console.log(fixedSections ? `已修复 ${fixedSections} 节（16C/27G → 各 20 题）` : '无改动');
