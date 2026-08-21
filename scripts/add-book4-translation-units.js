// 新增基英4缺失的 6 个 translation 单元（U5 死亡观/U6 笛卡尔/U10 哈耶克/U11 伯林/U13 历史定义/U15 亨廷顿）
// 题干 = 教材学生用书题3段落断句（scripts/s4-missing.json 提取）
// 译文 = AI 辅助生成的参考译文（instruction 中标注，供课堂版本替换）
const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '..', 'source', 'basic-english.json');
fs.copyFileSync(file, file + '.bak-b4trans');
const data = JSON.parse(fs.readFileSync(file, 'utf8'));
const book4 = data.books.find(b => b.key === 'book-4');
const NOTE = 'AI 辅助参考译文：本单元译文由 AI 辅助生成供学习参考，若与课堂老师提供的参考译文不一致，请以课堂版本为准。';
const mk = (unit, sentences) => ({
  key: `book-4-translation-unit-${unit}`,
  name: `Unit ${unit}`,
  kind: 'translation',
  instruction: NOTE,
  questions: sentences.map(([q, answer], i) => ({ index: String(i + 1), q, answer, type: 'text', module: '' }))
});
const units = [
  mk(5, [
    ['死亡是人类面临的共同命运（common fate）。', 'Death is a common fate faced by all human beings.'],
    ['然而，尽管世人皆有一死，在努力理解与掌控死亡的过程中，不同的人和社会却形成了迥然各异的死亡观（approaches to mortality），这些不同的观点反映出这些人和社会的爱憎好恶。', 'Yet although all mortals must die, different people and societies have developed strikingly different approaches to mortality in their efforts to understand and control death, and these divergent views reflect the likes and dislikes of those people and societies.'],
    ['正如一位历史学家所言，死亡对传统中国社会来说并非像在西方社会早期那样重要。', 'As one historian has observed, death was never as important to traditional Chinese society as it was in the early West.'],
    ['例如，中国没有宏大叙事（grand narratives）讲述悲剧英雄在生命无可挽回的悲壮尽头（violent and inevitable end）如何找到真正的自我，展现其至高美德（highest virtue）。', 'For example, China has no grand narratives telling of how a tragic hero, at the violent and inevitable end of his life, finds his true self and displays his highest virtue.'],
    ['在中国早期，死亡并非什么了不起的事，而是更多被看作生命的一个自然特征。', 'In early China, death was not regarded as anything extraordinary; rather, it was seen more as a natural feature of life.'],
    ['中国死亡观的这些独特之处对中国死亡观的研究颇具意义，因为它们不仅揭示了中国文化的特性，更对探究人类死亡观的一般性理论具有启示意义。', 'These distinctive features of the Chinese view of death are highly significant for the study of Chinese attitudes toward death, for they not only reveal the distinctive character of Chinese culture but also shed light on general theories concerning human views of death.']
  ]),
  mk(6, [
    ['勒内·笛卡尔常被誉为现代哲学之父。', 'René Descartes is often hailed as the father of modern philosophy.'],
    ['这个头衔可谓实至名归，因为正是笛卡尔破除了当时盛行的传统经院哲学（traditional scholastic philosophy），并发展和弘扬了新的机械论科学（mechanistic sciences）。', 'The title is well deserved, for it was Descartes who broke with the prevailing traditional scholastic philosophy of his day and developed and championed the new mechanistic sciences.'],
    ['笛卡尔怀疑方法的基本策略是，将那些哪怕只有些许可疑之处的理念都视为假。', 'The basic strategy of Descartes\u2019 method of doubt is to treat as false any idea that admits of even the slightest doubt.'],
    ['这种\u201c夸张的怀疑\u201d（hyperbolic doubt）为笛卡尔客观地探究真理扫清了道路。', 'This \u201chyperbolic doubt\u201d cleared the way for Descartes to inquire into truth objectively.'],
    ['由此，笛卡尔开始探寻真正不容置疑（beyond all doubt）之物。', 'From there, Descartes set out to seek something truly beyond all doubt.'],
    ['他最终发现，\u201c我存在\u201d是无论如何也不容置疑的，因此也是绝对确定的。', 'He finally discovered that \u201cI exist\u201d is beyond doubt under any circumstances, and is therefore absolutely certain.'],
    ['正是从这点出发，笛卡尔进一步推演（demonstrate）了上帝的存在，进而证明了万物的确定性（certainty）。', 'It was from this point that Descartes went on to demonstrate the existence of God, and thereby the certainty of all things.'],
    ['该结论一旦确立，笛卡尔便可以在此绝对确定的基础（absolutely certain foundation）上重建此前被置于怀疑之下的理念体系，包括外在于心的（external to the mind）物质世界之存在，物质的身体（material body）与非物质的心灵（immaterial mind）之间的二元区别（dualistic distinction），以及几何学（geometry）基础上的物理学机械论模型（mechanistic model of physics）等。', 'Once this conclusion was established, Descartes could rebuild, on this absolutely certain foundation, the whole system of ideas that had previously been cast into doubt, including the existence of the material world external to the mind, the dualistic distinction between the material body and the immaterial mind, and the mechanistic model of physics grounded in geometry.']
  ]),
  mk(10, [
    ['弗里德里希·哈耶克是20世纪最负盛名的经济学家和政治哲学家（political philosopher）。', 'Friedrich Hayek was one of the most renowned economists and political philosophers of the twentieth century.'],
    ['与其他现代思想家相比，他最为详尽地阐释了自由市场经济（free market economy）的理论基础，是20世纪主流政治右派（mainstream political right）最具影响力的思想家。', 'Compared with other modern thinkers, he expounded the theoretical foundations of the free market economy most thoroughly, and was the most influential thinker of the mainstream political right in the twentieth century.'],
    ['21世纪初期资本主义在全球大行其道，哈耶克对决策者和公知领袖（shapers of public opinion）的影响功不可没。', 'As capitalism swept the globe in the early twenty-first century, Hayek\u2019s influence on policymakers and shapers of public opinion was indispensable.'],
    ['他的著作《通往奴役之路》（The Road to Serfdom）对新右派运动（the New Right）的兴起发挥了关键性作用——正是在该运动的影响下，撒切尔夫人、里根和乔治·沃克·布什才得以成功当选国家元首。', 'His book The Road to Serfdom played a crucial role in the rise of the New Right movement; it was under the influence of this movement that Margaret Thatcher, Ronald Reagan and George W. Bush were successfully elected heads of state.'],
    ['其他政治哲学家尽管在学术领域中比哈耶克更受推崇，但在对现实政治（practical politics）的影响方面却难以望其项背。', 'Other political philosophers, though held in higher esteem in academic circles than Hayek, cannot match him in their influence on practical politics.']
  ]),
  mk(11, [
    ['以赛亚·伯林是英国哲学家、思想史学家（historian of ideas）、政治理论家、教育家和论说文作家（essayist）。', 'Isaiah Berlin was a British philosopher, historian of ideas, political theorist, educator and essayist.'],
    ['纵观其一生，其娓娓道来的精妙（conversational brilliance）、对自由主义的捍卫、对政治极端主义（political extremism）的批判以及关于思想史的著述都令世人称道。', 'Throughout his life, he was admired for his conversational brilliance, his defense of liberalism, his critique of political extremism, and his writings on the history of ideas.'],
    ['伯林的文章《两种自由概念》重新燃起了英语世界对政治理论的兴趣，直到今天仍是该领域最权威、讨论最多的文献（text）之一。', 'Berlin\u2019s essay \u201cTwo Concepts of Liberty\u201d rekindled the English-speaking world\u2019s interest in political theory and remains to this day one of the most authoritative and most discussed texts in the field.'],
    ['无论其拥护者还是反对者，大家公认的事实是，任何关于政治自由的意义与价值的理论探讨都必须以伯林对积极自由和消极自由的区分为基本起点。', 'Among both his supporters and his critics, it is a generally acknowledged fact that any theoretical discussion of the meaning and value of political liberty must take as its starting point Berlin\u2019s distinction between positive and negative liberty.'],
    ['年老后，伯林撰写的大量文章被广泛传播，这更引起学术界对其研究，尤其是价值多元论（value pluralism）思想的研究兴趣。', 'In his later years, the wide circulation of Berlin\u2019s numerous essays further stimulated scholarly interest in his work, especially in his idea of value pluralism.']
  ]),
  mk(13, [
    ['历史的通常定义（common definition）是指过往之事，是不可更改之事的集合（collection）。', 'The common definition of history refers to past events \u2014 the collection of things that cannot be changed.'],
    ['但对历史学家而言，历史的定义要窄得多：历史是一个艺术术语，指对有文字记载的历史的研究。', 'For historians, however, the definition of history is much narrower: history is an art term referring to the study of recorded history.'],
    ['尽管历史学家也会借鉴考古学（archeology）或物理学的相关证据，但历史研究的重点仍是历史著述（historical writings）。', 'Although historians may also draw on evidence from archeology or the physical sciences, the focus of historical research remains historical writings.'],
    ['通常定义下的历史可以告诉我们过去发生了哪些事，但无法解释这些事为何以及如何对当前之事产生重要影响。', 'History in the common sense can tell us what happened in the past, but it cannot explain why and how these events have a significant impact on the present.'],
    ['在历史学家手中，历史成为一种文学形式，同时具有主观性（subjectivity）与客观性（objectivity）。', 'In the hands of historians, history becomes a literary form that is at once subjective and objective.'],
    ['在历史学家那里，研究与记录历史其实是在尝试解读我们的过去、现在与未来。', 'For historians, researching and recording history is in fact an attempt to interpret our past, present and future.'],
    ['好的历史学家会厘清（get...right）事实，并从中提炼出指导性原则（guiding principles）和普适性理念（universal concepts）。', 'A good historian gets the facts right and distills from them guiding principles and universal concepts.'],
    ['通过详实的细节和普适性理念，历史学家使我们了解其人、其地、其时。', 'Through concrete details and universal concepts, historians help us understand the people, the places, and the times.'],
    ['如此一来，好的历史学家使我们与过去之间建立起个人层面的联系（personal relationship），并让我们从中学习，获得成长。', 'In this way, a good historian establishes for us a personal relationship with the past, enabling us to learn from it and grow.']
  ]),
  mk(15, [
    ['后冷战时期，对西方尤其是美国的决策者们（policymakers）影响最为深远的首推塞缪尔·亨廷顿1993年发表的《文明的冲突？》。', 'In the post-Cold War era, no work had a more profound influence on Western, especially American, policymakers than Samuel P. Huntington\u2019s \u201cThe Clash of Civilizations?\u201d published in 1993.'],
    ['该文提出，世界将重回文明主导之模式，未来纷争将主要发端于文明间的冲突。', 'The article argued that the world would return to a pattern dominated by civilizations, and that future conflicts would arise primarily from clashes between civilizations.'],
    ['该文面世于冷战初歇、亟待全新视角（prism）解读国际关系之际，一经推出即备受瞩目。', 'Appearing at a time when the Cold War had just ended and a fresh prism was urgently needed to interpret international relations, the article attracted enormous attention as soon as it was published.'],
    ['该文现在广受诟病，批评者指出，该文过于化繁就简（oversimplification），也并未料中其出版后十年间的情况。', 'The article has since come under wide criticism; critics point out that it is an oversimplification and that it failed to foresee the developments of the decade following its publication.'],
    ['首先，他未能充分考虑各种本土文化（indigenous cultures），虽然这些文化的确共同构成一种独立的文明。', 'First, he failed to take full account of various indigenous cultures, which together do constitute a distinctive civilization.'],
    ['该文还预测，未来纷争将主要源于非西方文明对西方文明的影响力和价值观（power and values）作出的反应，并忽视了另外一种同样可能的情形，即西方国家利用其军事优势（military superiority）维持其优势地位。', 'The article also predicted that future conflicts would arise mainly from the responses of non-Western civilizations to the influence and values of the West, while overlooking another equally possible scenario: Western nations using their military superiority to maintain their dominant position.'],
    ['亨廷顿为应对未来可能的威胁给出了政策建议（policy prescriptions），其本质无异于（equate to）强调加强西方的力量来预防（forestall）任何对西方优势的减损。', 'To counter possible future threats, Huntington offered policy prescriptions that in essence amount to strengthening the West\u2019s power so as to forestall any erosion of Western primacy.']
  ])
];
for (const u of units) {
  if (book4.units.some(x => x.key === u.key)) { console.log(`${u.key} 已存在，跳过`); continue; }
  book4.units.push(u);
  console.log(`新增 ${u.key}（${u.questions.length} 题）`);
}
book4.units.sort((a, b) => a.key.localeCompare(b.key, 'en'));
fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n', 'utf8');
console.log('写入完成，book-4 units 总数:', book4.units.length);
