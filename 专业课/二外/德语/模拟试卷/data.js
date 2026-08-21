// 《新编大学德语》第一册 · 模拟试卷数据
// 题型参考期末试卷：I 选择 / II 填空 / III 改写 / IV 阅读 / V 翻译，每套 100 分
window.CONTENT_BOOKS = {
  books: [
    {
      key: 'exam-1',
      name: '模拟试卷一 · 第 1-3 单元',
      units: [
        {
          key: 'exam-1-I', kind: 'choice', kindLabel: '选择', name: 'I. Wortschatz und Grammatik（20 分）',
          modules: ['词汇与语法'], instruction: 'Wählen Sie die richtige Lösung! 选出正确答案，每题 1 分。',
          questions: [
            { index: '1', q: 'Guten Tag! Wie ___ Sie?', options: ['heißt', 'heißen', 'heiße'], answer: 'B', type: 'choice', module: '词汇与语法' },
            { index: '2', q: 'Ich ___ Student.', options: ['bin', 'bist', 'ist'], answer: 'A', type: 'choice', module: '词汇与语法' },
            { index: '3', q: 'Woher ___ du, Peter?', options: ['kommen', 'kommst', 'kommt'], answer: 'B', type: 'choice', module: '词汇与语法' },
            { index: '4', q: 'Das ist Frau Johnson. ___ kommt aus England.', options: ['Er', 'Sie', 'Es'], answer: 'B', type: 'choice', module: '词汇与语法' },
            { index: '5', q: 'Das ist Herr Wang. ___ ist Student.', options: ['Er', 'Sie', 'Es'], answer: 'A', type: 'choice', module: '词汇与语法' },
            { index: '6', q: 'Wir ___ jetzt Deutsch.', options: ['lernt', 'lerne', 'lernen'], answer: 'C', type: 'choice', module: '词汇与语法' },
            { index: '7', q: '___ du Chinesisch?', options: ['Sprichst', 'Sprechst', 'Sprecht'], answer: 'A', type: 'choice', module: '词汇与语法' },
            { index: '8', q: 'Ich ___ gern Sport.', options: ['treibst', 'treibe', 'treibt'], answer: 'B', type: 'choice', module: '词汇与语法' },
            { index: '9', q: 'Er ___ eine Vorlesung.', options: ['besucht', 'besuche', 'besuchst'], answer: 'A', type: 'choice', module: '词汇与语法' },
            { index: '10', q: 'Ich habe ___ Computer.', options: ['ein', 'einen', 'eine'], answer: 'B', type: 'choice', module: '词汇与语法' },
            { index: '11', q: 'Er hat ___ Schwester.', options: ['ein', 'einen', 'eine'], answer: 'C', type: 'choice', module: '词汇与语法' },
            { index: '12', q: 'Wir kaufen ___ Buch.', options: ['ein', 'einen', 'eine'], answer: 'A', type: 'choice', module: '词汇与语法' },
            { index: '13', q: 'Um wie viel Uhr ___ du auf?', options: ['stehst', 'steht', 'stehe'], answer: 'A', type: 'choice', module: '词汇与语法' },
            { index: '14', q: 'Wann ___ der Unterricht?', options: ['beginnt', 'beginnst', 'beginnen'], answer: 'A', type: 'choice', module: '词汇与语法' },
            { index: '15', q: '___ acht Uhr haben wir Unterricht.', options: ['Um', 'Vor', 'Nach'], answer: 'A', type: 'choice', module: '词汇与语法' },
            { index: '16', q: 'Wie spät ist es? Es ist fünf ___ zwölf.（11:55）', options: ['nach', 'vor', 'um'], answer: 'B', type: 'choice', module: '词汇与语法' },
            { index: '17', q: 'Heute ist Montag. Morgen ist ___.', options: ['Dienstag', 'Sonntag', 'Freitag'], answer: 'A', type: 'choice', module: '词汇与语法' },
            { index: '18', q: '___ machen Sie in Ihrer Freizeit?', options: ['Wer', 'Was', 'Wie'], answer: 'B', type: 'choice', module: '词汇与语法' },
            { index: '19', q: 'Hast du ___ Unterricht?', options: ['täglich', 'gern', 'hier'], answer: 'A', type: 'choice', module: '词汇与语法' },
            { index: '20', q: 'Du liest und liest. ___ du eigentlich noch?', options: ['Schläfst', 'Schlafst', 'Schlafen'], answer: 'A', type: 'choice', module: '词汇与语法' }
          ]
        },
        {
          key: 'exam-1-IIa', kind: 'fill', kindLabel: '填空', name: 'II. Lückenfüllen a · Verbformen（10 分）',
          modules: ['动词变位'], instruction: 'Ergänzen Sie die Verben in der richtigen Form! 用括号中动词的正确形式填空，每空 1 分。',
          questions: [
            { index: '1', q: 'Ich ___ (heißen) Karin Beckmann.', answer: 'heiße', type: 'text', module: '动词变位' },
            { index: '2', q: 'Woher ___ (kommen) Sie?', answer: 'kommen', type: 'text', module: '动词变位' },
            { index: '3', q: 'Er ___ (lernen) jetzt Deutsch.', answer: 'lernt', type: 'text', module: '动词变位' },
            { index: '4', q: 'Wir ___ (machen) gerade Pause.', answer: 'machen', type: 'text', module: '动词变位' },
            { index: '5', q: '___ (sprechen) du Chinesisch?', answer: 'Sprichst', type: 'text', module: '动词变位' },
            { index: '6', q: 'Ihr ___ (studieren) in Beijing.', answer: 'studiert', type: 'text', module: '动词变位' },
            { index: '7', q: 'Sie ___ (sein) aus England.', answer: 'ist', type: 'text', module: '动词变位' },
            { index: '8', q: 'Was ___ (machen) ihr hier?', answer: 'macht', type: 'text', module: '动词变位' },
            { index: '9', q: 'Er ___ (haben) täglich Unterricht.', answer: 'hat', type: 'text', module: '动词变位' },
            { index: '10', q: '___ (lesen) Sie bitte den Text!', answer: 'Lesen', type: 'text', module: '动词变位' }
          ]
        },
        {
          key: 'exam-1-IIb', kind: 'fill', kindLabel: '填空', name: 'II. Lückenfüllen b · Dialog（10 分）',
          modules: ['补全对话'], instruction: 'Ergänzen Sie den Dialog! 补全下列对话，每空 1 分。',
          questions: [
            { index: '1', q: 'A: Guten Tag! Wie ___ (1) Sie?', answer: 'heißen', type: 'text', module: '补全对话' },
            { index: '2', q: 'B: Ich ___ (2) Monika. Und Sie?', answer: 'heiße', type: 'text', module: '补全对话' },
            { index: '3', q: 'A: Mein Name ___ (3) Wang Hongliang. Woher ___ (4) Sie?', answer: 'ist', type: 'text', module: '补全对话' },
            { index: '4', q: 'B: Ich ___ (5) aus England.', answer: 'komme', type: 'text', module: '补全对话' },
            { index: '5', q: 'A: Was ___ (6) Sie hier?', answer: 'machen', type: 'text', module: '补全对话' },
            { index: '6', q: 'B: Ich ___ (7) jetzt Deutsch.', answer: 'lerne', type: 'text', module: '补全对话' },
            { index: '7', q: 'A: ___ (8) Sie täglich Unterricht?', answer: 'Haben', type: 'text', module: '补全对话' },
            { index: '8', q: 'B: Ja, immer ___ (9) Vormittag.', answer: 'am', type: 'text', module: '补全对话' },
            { index: '9', q: 'A: Danke. ___ (10) Wiedersehen!', answer: 'Auf', type: 'text', module: '补全对话' },
            { index: '10', q: 'B: Auf Wiedersehen!', answer: 'Wiedersehen', type: 'text', module: '补全对话' }
          ]
        },
        {
          key: 'exam-1-IIc', kind: 'fill', kindLabel: '填空', name: 'II. Lückenfüllen c · Artikel（10 分）',
          modules: ['冠词填空'], instruction: 'Ergänzen Sie die Artikel! 填入正确的冠词（der/das/die/ein/eine/einen/den），每空 1 分。',
          questions: [
            { index: '1', q: 'Das ist ___ Buch.', answer: 'ein', type: 'text', module: '冠词填空' },
            { index: '2', q: 'Ich habe ___ Computer.', answer: 'einen', type: 'text', module: '冠词填空' },
            { index: '3', q: 'Sie hat ___ Schwester.', answer: 'eine', type: 'text', module: '冠词填空' },
            { index: '4', q: '___ Lehrerin heißt Frau Beckmann.', answer: 'Die', type: 'text', module: '冠词填空' },
            { index: '5', q: 'Er liest ___ Text.', answer: 'den', type: 'text', module: '冠词填空' },
            { index: '6', q: 'Wir öffnen ___ Bücher.', answer: 'die', type: 'text', module: '冠词填空' },
            { index: '7', q: 'Das ist ___ Student.', answer: 'ein', type: 'text', module: '冠词填空' },
            { index: '8', q: 'Ich kaufe ___ Zeitung.', answer: 'eine', type: 'text', module: '冠词填空' },
            { index: '9', q: '___ Seminar beginnt um acht Uhr.', answer: 'Das', type: 'text', module: '冠词填空' },
            { index: '10', q: 'Er besucht ___ Vorlesung.', answer: 'eine', type: 'text', module: '冠词填空' }
          ]
        },
        {
          key: 'exam-1-IIIa', kind: 'translation', kindLabel: '改写', name: 'III. Umformen a · Bilden Sie Sätze（10 分）',
          modules: ['组句'], instruction: 'Bilden Sie Sätze aus den gegebenen Wörtern! 用所给词语连成句子，每题 2 分。',
          questions: [
            { index: '1', q: 'ich / Student / sein', answer: 'Ich bin Student.', type: 'text', module: '组句' },
            { index: '2', q: 'du / aus China / kommen', answer: 'Du kommst aus China.', type: 'text', module: '组句' },
            { index: '3', q: 'er / Deutsch / lernen', answer: 'Er lernt Deutsch.', type: 'text', module: '组句' },
            { index: '4', q: 'wir / jetzt / Pause / machen', answer: 'Wir machen jetzt Pause.', type: 'text', module: '组句' },
            { index: '5', q: 'ihr / am Vormittag / Unterricht / haben', answer: 'Ihr habt am Vormittag Unterricht.', type: 'text', module: '组句' }
          ]
        },
        {
          key: 'exam-1-IIIb', kind: 'translation', kindLabel: '改写', name: 'III. Umformen b · Imperativ（10 分）',
          modules: ['祈使句'], instruction: 'Bilden Sie Imperativsätze! 将下列句子改成祈使句（Sie/du 形式），每题 2 分。',
          questions: [
            { index: '1', q: 'Sie öffnen die Bücher.', answer: 'Öffnen Sie die Bücher!', type: 'text', module: '祈使句' },
            { index: '2', q: 'du liest den Text.', answer: 'Lies den Text!', type: 'text', module: '祈使句' },
            { index: '3', q: 'Sie sprechen bitte langsam.', answer: 'Sprechen Sie bitte langsam!', type: 'text', module: '祈使句' },
            { index: '4', q: 'du machst die Übungen.', answer: 'Mach die Übungen!', type: 'text', module: '祈使句' },
            { index: '5', q: 'Sie antworten auf Deutsch.', answer: 'Antworten Sie auf Deutsch!', type: 'text', module: '祈使句' }
          ]
        },
        {
          key: 'exam-1-IV', kind: 'choice', kindLabel: '阅读', name: 'IV. Leseverständnis（10 分）',
          modules: ['阅读理解'], instruction: 'Lesen Sie den Text und kreuzen Sie an: Richtig oder Falsch? 读短文，判断正误，每题 2 分。',
          questions: [
            { index: '0', q: '【短文】Das ist unsere Klasse. Die Lehrerin heißt Karin Beckmann. Sie kommt aus Deutschland. Die Studenten kommen aus verschiedenen Ländern: Mary kommt aus England, Wang Hongliang kommt aus China. Wang lernt jetzt Deutsch. Er hat täglich am Vormittag Unterricht. Er steht um Viertel nach sechs auf und treibt Sport. Am Donnerstag schreiben die Studenten eine Prüfung.', options: ['（短文，无需作答）'], answer: 'A', type: 'choice', module: '阅读理解' },
            { index: '1', q: '1) Die Lehrerin kommt aus England.', options: ['Richtig', 'Falsch'], answer: 'B', type: 'choice', module: '阅读理解' },
            { index: '2', q: '2) Wang Hongliang kommt aus China.', options: ['Richtig', 'Falsch'], answer: 'A', type: 'choice', module: '阅读理解' },
            { index: '3', q: '3) Wang lernt jetzt Deutsch.', options: ['Richtig', 'Falsch'], answer: 'A', type: 'choice', module: '阅读理解' },
            { index: '4', q: '4) Wang hat am Nachmittag Unterricht.', options: ['Richtig', 'Falsch'], answer: 'B', type: 'choice', module: '阅读理解' },
            { index: '5', q: '5) Am Donnerstag schreiben die Studenten eine Prüfung.', options: ['Richtig', 'Falsch'], answer: 'A', type: 'choice', module: '阅读理解' }
          ]
        },
        {
          key: 'exam-1-Va', kind: 'translation', kindLabel: '翻译', name: 'V. Übersetzen a · Chinesisch-Deutsch（10 分）',
          modules: ['汉译德'], instruction: 'Übersetzen Sie ins Deutsche! 把下列句子译成德语，每题 2 分。',
          questions: [
            { index: '1', q: '你好！我叫王洪亮。', answer: 'Guten Tag! Ich heiße Wang Hongliang.', type: 'text', module: '汉译德' },
            { index: '2', q: '您从哪里来？', answer: 'Woher kommen Sie?', type: 'text', module: '汉译德' },
            { index: '3', q: '我每天上午都有课。', answer: 'Ich habe täglich am Vormittag Unterricht.', type: 'text', module: '汉译德' },
            { index: '4', q: '你什么时候起床？', answer: 'Wann stehst du auf?', type: 'text', module: '汉译德' },
            { index: '5', q: '请打开书！', answer: 'Öffnen Sie die Bücher!', type: 'text', module: '汉译德' }
          ]
        },
        {
          key: 'exam-1-Vb', kind: 'translation', kindLabel: '翻译', name: 'V. Übersetzen b · Deutsch-Chinesisch（10 分）',
          modules: ['德译汉'], instruction: 'Übersetzen Sie ins Chinesische! 把下列句子译成中文，每题 2 分。',
          questions: [
            { index: '1', q: 'Wie bitte?', answer: '您说什么？', type: 'text', module: '德译汉' },
            { index: '2', q: 'Es ist fünf vor elf.', answer: '现在是十一点差五分。', type: 'text', module: '德译汉' },
            { index: '3', q: 'Ich verstehe sie immer besser.', answer: '我越来越能听懂她的话了。', type: 'text', module: '德译汉' },
            { index: '4', q: 'Morgenstunde hat Gold im Munde.', answer: '一日之计在于晨。', type: 'text', module: '德译汉' },
            { index: '5', q: 'Freut mich!', answer: '认识您（你）我很高兴！', type: 'text', module: '德译汉' }
          ]
        }
      ]
    },
    {
      key: 'exam-2',
      name: '模拟试卷二 · 第 4-6 单元',
      units: [
        {
          key: 'exam-2-I', kind: 'choice', kindLabel: '选择', name: 'I. Wortschatz und Grammatik（20 分）',
          modules: ['词汇与语法'], instruction: 'Wählen Sie die richtige Lösung! 选出正确答案，每题 1 分。',
          questions: [
            { index: '1', q: 'Meine Oma ___ 60 Jahre alt.', options: ['hat', 'ist', 'wird'], answer: 'B', type: 'choice', module: '词汇与语法' },
            { index: '2', q: 'Sie steht früh ___.', options: ['an', 'aus', 'auf'], answer: 'C', type: 'choice', module: '词汇与语法' },
            { index: '3', q: 'Er raucht nicht und trinkt ___ Alkohol.', options: ['kein', 'keinen', 'nicht'], answer: 'B', type: 'choice', module: '词汇与语法' },
            { index: '4', q: 'Wir machen eine Feier ___ dich.', options: ['für', 'mit', 'von'], answer: 'A', type: 'choice', module: '词汇与语法' },
            { index: '5', q: '___ fährst du in den Ferien?', options: ['Wohin', 'Wo', 'Wer'], answer: 'A', type: 'choice', module: '词汇与语法' },
            { index: '6', q: 'Ich möchte gern ___ Apfelsaft.', options: ['einen', 'ein', 'eine'], answer: 'A', type: 'choice', module: '词汇与语法' },
            { index: '7', q: 'Das schmeckt mir ___.', options: ['gutes', 'gut', 'guten'], answer: 'B', type: 'choice', module: '词汇与语法' },
            { index: '8', q: 'Er hilft ___ Oma.', options: ['seinen', 'seiner', 'seinem'], answer: 'B', type: 'choice', module: '词汇与语法' },
            { index: '9', q: 'Das Buch gehört ___ Vater.', options: ['dem', 'den', 'der'], answer: 'A', type: 'choice', module: '词汇与语法' },
            { index: '10', q: 'Wir dürfen hier nicht ___.', options: ['rauchen', 'raucht', 'rauchst'], answer: 'A', type: 'choice', module: '词汇与语法' },
            { index: '11', q: 'Du ___ die Hausordnung einhalten.', options: ['muss', 'musst', 'müsst'], answer: 'B', type: 'choice', module: '词汇与语法' },
            { index: '12', q: 'Sie ___ keine Haustiere halten.', options: ['darf', 'dürfen', 'dürft'], answer: 'B', type: 'choice', module: '词汇与语法' },
            { index: '13', q: 'Ich ___ gern ein Bier.', options: ['möchte', 'magst', 'mögen'], answer: 'A', type: 'choice', module: '词汇与语法' },
            { index: '14', q: '___ Sie die Wohnung besichtigen?', options: ['Möchten', 'Möchtest', 'Möchtet'], answer: 'A', type: 'choice', module: '词汇与语法' },
            { index: '15', q: 'Er wohnt in ___ Studentenwohnheim.', options: ['dem', 'das', 'den'], answer: 'A', type: 'choice', module: '词汇与语法' },
            { index: '16', q: 'Das Wohnzimmer ist hell, ___ es gibt zwei Fenster.', options: ['weil', 'denn', 'aber'], answer: 'B', type: 'choice', module: '词汇与语法' },
            { index: '17', q: 'Die Miete ist 380 Euro, ___.', options: ['warm', 'kalt', 'heiß'], answer: 'A', type: 'choice', module: '词汇与语法' },
            { index: '18', q: 'Vor dem Haus ist ___ Parkplatz.', options: ['ein', 'eine', 'einen'], answer: 'A', type: 'choice', module: '词汇与语法' },
            { index: '19', q: 'Ich muss ___ eine Wohnung mieten.', options: ['langsam', 'dringend', 'gern'], answer: 'B', type: 'choice', module: '词汇与语法' },
            { index: '20', q: 'Die Küche ist renoviert, ___ ziemlich klein.', options: ['denn', 'aber', 'und'], answer: 'B', type: 'choice', module: '词汇与语法' }
          ]
        },
        {
          key: 'exam-2-IIa', kind: 'fill', kindLabel: '填空', name: 'II. Lückenfüllen a · Modalverben（10 分）',
          modules: ['情态动词'], instruction: 'Ergänzen Sie die Modalverben in der richtigen Form! 用括号中情态动词的正确形式填空，每空 1 分。',
          questions: [
            { index: '1', q: 'Ich ___ (müssen) dringend eine Wohnung mieten.', answer: 'muss', type: 'text', module: '情态动词' },
            { index: '2', q: '___ (dürfen) ich hereinkommen?', answer: 'Darf', type: 'text', module: '情态动词' },
            { index: '3', q: 'Du ___ (sollen) die Hausordnung einhalten.', answer: 'sollst', type: 'text', module: '情态动词' },
            { index: '4', q: 'Wir ___ (möchten) gern zwei Bier.', answer: 'möchten', type: 'text', module: '情态动词' },
            { index: '5', q: 'Er ___ (können) gut Deutsch sprechen.', answer: 'kann', type: 'text', module: '情态动词' },
            { index: '6', q: '___ (wollen) du ein Geschenk kaufen?', answer: 'Willst', type: 'text', module: '情态动词' },
            { index: '7', q: 'Ihr ___ (müssen) die Bücher schließen.', answer: 'müsst', type: 'text', module: '情态动词' },
            { index: '8', q: 'Sie ___ (dürfen) keine Haustiere halten.', answer: 'dürfen', type: 'text', module: '情态动词' },
            { index: '9', q: 'Ich ___ (mögen) Eis nicht.', answer: 'mag', type: 'text', module: '情态动词' },
            { index: '10', q: '___ (wollen) Sie die Wohnung besichtigen?', answer: 'Wollen', type: 'text', module: '情态动词' }
          ]
        },
        {
          key: 'exam-2-IIb', kind: 'fill', kindLabel: '填空', name: 'II. Lückenfüllen b · Dialog（10 分）',
          modules: ['补全对话'], instruction: 'Ergänzen Sie den Dialog! 补全下列对话，每空 1 分。',
          questions: [
            { index: '1', q: 'Wang: Guten Tag! Mein Name ___ (1) Wang Hongliang.', answer: 'ist', type: 'text', module: '补全对话' },
            { index: '2', q: 'Ich habe Ihre Telefonnummer von der ___ (2)-Anzeige aus dem Internet.', answer: 'Wohnungs', type: 'text', module: '补全对话' },
            { index: '3', q: 'Vermieterin: Möchten Sie die Wohnung ___ (3)?', answer: 'besichtigen', type: 'text', module: '补全对话' },
            { index: '4', q: 'Wang: Ja, gerne. Wann ___ (4) ich kommen?', answer: 'darf', type: 'text', module: '补全对话' },
            { index: '5', q: 'Vermieterin: Jetzt bin ich noch zu ___ (5).', answer: 'Hause', type: 'text', module: '补全对话' },
            { index: '6', q: 'Wang: Ich fahre sofort zu ___ (6).', answer: 'Ihnen', type: 'text', module: '补全对话' },
            { index: '7', q: 'Vermieterin: Gut. Dann bis ___ (7)!', answer: 'gleich', type: 'text', module: '补全对话' },
            { index: '8', q: 'Wang: Soll ich die Schuhe ___ (8)?', answer: 'ausziehen', type: 'text', module: '补全对话' },
            { index: '9', q: 'Vermieterin: Nein, nicht ___. (9)', answer: 'nötig', type: 'text', module: '补全对话' },
            { index: '10', q: 'Wang: Wie hoch ist die ___ (10) im Monat?', answer: 'Miete', type: 'text', module: '补全对话' }
          ]
        },
        {
          key: 'exam-2-IIc', kind: 'fill', kindLabel: '填空', name: 'II. Lückenfüllen c · kein / nicht（10 分）',
          modules: ['否定词'], instruction: 'Ergänzen Sie „kein / keine / keinen“ oder „nicht“! 用 kein（keine/keinen）或 nicht 填空，每空 1 分。',
          questions: [
            { index: '1', q: 'Das ist ___ Buch, das ist ein Heft.', answer: 'kein', type: 'text', module: '否定词' },
            { index: '2', q: 'Ich trinke ___ Alkohol.', answer: 'keinen', type: 'text', module: '否定词' },
            { index: '3', q: 'Er raucht ___.', answer: 'nicht', type: 'text', module: '否定词' },
            { index: '4', q: 'Sie hat ___ Schwester.', answer: 'keine', type: 'text', module: '否定词' },
            { index: '5', q: 'Das ist ___ Computer, das ist ein Fernseher.', answer: 'kein', type: 'text', module: '否定词' },
            { index: '6', q: 'Wir haben heute ___ Unterricht.', answer: 'keinen', type: 'text', module: '否定词' },
            { index: '7', q: 'Ich komme heute ___.', answer: 'nicht', type: 'text', module: '否定词' },
            { index: '8', q: 'Das ist ___ Zimmer, das ist eine Küche.', answer: 'kein', type: 'text', module: '否定词' },
            { index: '9', q: 'Er spricht ___ Deutsch.', answer: 'kein', type: 'text', module: '否定词' },
            { index: '10', q: 'Sie arbeitet heute ___.', answer: 'nicht', type: 'text', module: '否定词' }
          ]
        },
        {
          key: 'exam-2-IIIa', kind: 'translation', kindLabel: '改写', name: 'III. Umformen a · Bilden Sie Sätze（10 分）',
          modules: ['组句'], instruction: 'Bilden Sie Sätze aus den gegebenen Wörtern! 用所给词语连成句子，每题 2 分。',
          questions: [
            { index: '1', q: 'die Oma / 60 Jahre alt / sein', answer: 'Die Oma ist 60 Jahre alt.', type: 'text', module: '组句' },
            { index: '2', q: 'ich / gern / ein Bier / möchten', answer: 'Ich möchte gern ein Bier.', type: 'text', module: '组句' },
            { index: '3', q: 'du / die Hausordnung / einhalten / müssen', answer: 'Du musst die Hausordnung einhalten.', type: 'text', module: '组句' },
            { index: '4', q: 'wir / am Samstag / eine Party / machen', answer: 'Wir machen am Samstag eine Party.', type: 'text', module: '组句' },
            { index: '5', q: 'er / seiner Freundin / eine Mütze / schenken', answer: 'Er schenkt seiner Freundin eine Mütze.', type: 'text', module: '组句' }
          ]
        },
        {
          key: 'exam-2-IIIb', kind: 'translation', kindLabel: '改写', name: 'III. Umformen b · Imperativ（10 分）',
          modules: ['祈使句'], instruction: 'Bilden Sie Imperativsätze mit du / ihr! 用 du / ihr 形式改写祈使句，每题 2 分。',
          questions: [
            { index: '1', q: 'Du trinkst ein Bier. →', answer: 'Trink ein Bier!', type: 'text', module: '祈使句' },
            { index: '2', q: 'Ihr öffnet die Bücher. →', answer: 'Öffnet die Bücher!', type: 'text', module: '祈使句' },
            { index: '3', q: 'Du kommst herein. →', answer: 'Komm herein!', type: 'text', module: '祈使句' },
            { index: '4', q: 'Ihr macht die Übungen. →', answer: 'Macht die Übungen!', type: 'text', module: '祈使句' },
            { index: '5', q: 'Du fährst nach Hause. →', answer: 'Fahr nach Hause!', type: 'text', module: '祈使句' }
          ]
        },
        {
          key: 'exam-2-IV', kind: 'choice', kindLabel: '阅读', name: 'IV. Leseverständnis（10 分）',
          modules: ['阅读理解'], instruction: 'Lesen Sie den Text und kreuzen Sie an: Richtig oder Falsch? 读短文，判断正误，每题 2 分。',
          questions: [
            { index: '0', q: '【短文】Frau Lehmann sucht eine Wohnung. Sie findet eine Anzeige im Internet. Die Wohnung hat ein Wohnzimmer, ein Schlafzimmer und eine Küche. Die Miete ist 450 Euro, warm. Frau Lehmann ruft die Vermieterin an und besichtigt die Wohnung. Sie gefällt ihr sehr gut. Sie nimmt die Wohnung.', options: ['（短文，无需作答）'], answer: 'A', type: 'choice', module: '阅读理解' },
            { index: '1', q: '1) Frau Lehmann sucht ein Haus.', options: ['Richtig', 'Falsch'], answer: 'B', type: 'choice', module: '阅读理解' },
            { index: '2', q: '2) Die Anzeige steht im Internet.', options: ['Richtig', 'Falsch'], answer: 'A', type: 'choice', module: '阅读理解' },
            { index: '3', q: '3) Die Wohnung hat zwei Schlafzimmer.', options: ['Richtig', 'Falsch'], answer: 'B', type: 'choice', module: '阅读理解' },
            { index: '4', q: '4) Die Miete ist 450 Euro.', options: ['Richtig', 'Falsch'], answer: 'A', type: 'choice', module: '阅读理解' },
            { index: '5', q: '5) Frau Lehmann nimmt die Wohnung.', options: ['Richtig', 'Falsch'], answer: 'A', type: 'choice', module: '阅读理解' }
          ]
        },
        {
          key: 'exam-2-Va', kind: 'translation', kindLabel: '翻译', name: 'V. Übersetzen a · Chinesisch-Deutsch（10 分）',
          modules: ['汉译德'], instruction: 'Übersetzen Sie ins Deutsche! 把下列句子译成德语，每题 2 分。',
          questions: [
            { index: '1', q: '我奶奶 60 岁了。', answer: 'Meine Oma ist 60 Jahre alt.', type: 'text', module: '汉译德' },
            { index: '2', q: '你想喝点什么？', answer: 'Was möchtest du trinken?', type: 'text', module: '汉译德' },
            { index: '3', q: '我急需租一套房子。', answer: 'Ich muss dringend eine Wohnung mieten.', type: 'text', module: '汉译德' },
            { index: '4', q: '您喜欢这套房子吗？', answer: 'Gefällt Ihnen die Wohnung?', type: 'text', module: '汉译德' },
            { index: '5', q: '祝你生日快乐！', answer: 'Herzlichen Glückwunsch zum Geburtstag!', type: 'text', module: '汉译德' }
          ]
        },
        {
          key: 'exam-2-Vb', kind: 'translation', kindLabel: '翻译', name: 'V. Übersetzen b · Deutsch-Chinesisch（10 分）',
          modules: ['德译汉'], instruction: 'Übersetzen Sie ins Chinesische! 把下列句子译成中文，每题 2 分。',
          questions: [
            { index: '1', q: 'Sie lebt sehr gesund.', answer: '她生活得很健康。', type: 'text', module: '德译汉' },
            { index: '2', q: 'Guten Appetit!', answer: '祝好胃口！', type: 'text', module: '德译汉' },
            { index: '3', q: 'Sie dürfen keine Haustiere halten.', answer: '您不可以养宠物。', type: 'text', module: '德译汉' },
            { index: '4', q: 'Die Wohnung ist hell.', answer: '这套房子很明亮。', type: 'text', module: '德译汉' },
            { index: '5', q: 'Nimm die schwarze Mütze!', answer: '拿那顶黑色的帽子吧！', type: 'text', module: '德译汉' }
          ]
        }
      ]
    },
    {
      key: 'exam-3',
      name: '模拟试卷三 · 第 7-9 单元',
      units: [
        {
          key: 'exam-3-I', kind: 'choice', kindLabel: '选择', name: 'I. Wortschatz und Grammatik（20 分）',
          modules: ['词汇与语法'], instruction: 'Wählen Sie die richtige Lösung! 选出正确答案，每题 1 分。',
          questions: [
            { index: '1', q: 'Was kann ich ihr ___ schenken?', options: ['bald', 'bloß', 'oft'], answer: 'B', type: 'choice', module: '词汇与语法' },
            { index: '2', q: 'Die Mütze kostet nur 15 Euro. Sie ist ___.', options: ['billig', 'teuer', 'neu'], answer: 'A', type: 'choice', module: '词汇与语法' },
            { index: '3', q: 'Rot ___ meiner Freundin nicht.', options: ['steht', 'stehst', 'stehe'], answer: 'A', type: 'choice', module: '词汇与语法' },
            { index: '4', q: 'Sie hat ___ Praktikum bei Siemens absolviert.', options: ['ein', 'einen', 'eine'], answer: 'A', type: 'choice', module: '词汇与语法' },
            { index: '5', q: 'Ich habe in der Abteilung viel ___.', options: ['lernt', 'gelernt', 'lernst'], answer: 'B', type: 'choice', module: '词汇与语法' },
            { index: '6', q: 'Wir sind am Wochenende an die Ostsee ___.', options: ['gefahren', 'fahren', 'fährt'], answer: 'A', type: 'choice', module: '词汇与语法' },
            { index: '7', q: 'Hast du am Wochenende einen Ausflug ___?', options: ['macht', 'gemacht', 'machen'], answer: 'B', type: 'choice', module: '词汇与语法' },
            { index: '8', q: 'Er hat einen Monat auf dem Land ___.', options: ['verbracht', 'verbringt', 'verbringen'], answer: 'A', type: 'choice', module: '词汇与语法' },
            { index: '9', q: 'Ich habe im Meer ___.', options: ['bade', 'gebadet', 'baden'], answer: 'B', type: 'choice', module: '词汇与语法' },
            { index: '10', q: 'Wann hast du Geburtstag? Ich habe ___ 22. September Geburtstag.', options: ['im', 'am', 'um'], answer: 'B', type: 'choice', module: '词汇与语法' },
            { index: '11', q: 'Das ist das Buch ___ Vaters.', options: ['meines', 'meinem', 'meinen'], answer: 'A', type: 'choice', module: '词汇与语法' },
            { index: '12', q: 'Das Auto gehört ___ Bruder.', options: ['meinen', 'meines', 'meinem'], answer: 'C', type: 'choice', module: '词汇与语法' },
            { index: '13', q: 'Ich freue mich ___ meinen Urlaub.', options: ['auf', 'über', 'für'], answer: 'A', type: 'choice', module: '词汇与语法' },
            { index: '14', q: 'Er interessiert sich ___ Musik.', options: ['für', 'auf', 'um'], answer: 'A', type: 'choice', module: '词汇与语法' },
            { index: '15', q: 'Sie wäscht ___.', options: ['sich', 'ihm', 'mich'], answer: 'A', type: 'choice', module: '词汇与语法' },
            { index: '16', q: 'Ich weiß nicht, ob er heute ___.', options: ['kommt', 'kommen', 'kommst'], answer: 'A', type: 'choice', module: '词汇与语法' },
            { index: '17', q: 'Der Arzt sagt, dass ich ___ Bett bleiben soll.', options: ['im', 'ins', 'in den'], answer: 'A', type: 'choice', module: '词汇与语法' },
            { index: '18', q: 'Ich habe ___.', options: ['Kopfschmerz', 'Kopfschmerzen', 'Kopfschmerze'], answer: 'B', type: 'choice', module: '词汇与语法' },
            { index: '19', q: 'Sie soll zwei Wochen im Bett ___.', options: ['bleiben', 'bleibt', 'bleibst'], answer: 'A', type: 'choice', module: '词汇与语法' },
            { index: '20', q: 'Mein Hals tut mir schrecklich ___.', options: ['weh', 'gut', 'gern'], answer: 'A', type: 'choice', module: '词汇与语法' }
          ]
        },
        {
          key: 'exam-3-IIa', kind: 'fill', kindLabel: '填空', name: 'II. Lückenfüllen a · Modalverben（10 分）',
          modules: ['情态动词'], instruction: 'Ergänzen Sie die Modalverben in der richtigen Form! 用括号中情态动词的正确形式填空，每空 1 分。',
          questions: [
            { index: '1', q: 'Er ___ (können) gut schwimmen.', answer: 'kann', type: 'text', module: '情态动词' },
            { index: '2', q: 'Ich ___ (wollen) ein Geschenk kaufen.', answer: 'will', type: 'text', module: '情态动词' },
            { index: '3', q: '___ (sollen) ich die Schuhe ausziehen?', answer: 'Soll', type: 'text', module: '情态动词' },
            { index: '4', q: 'Wir ___ (können) in den Ferien etwas Praktisches lernen.', answer: 'können', type: 'text', module: '情态动词' },
            { index: '5', q: 'Sie ___ (wollen) in fünf Tagen nach China fliegen.', answer: 'wollen', type: 'text', module: '情态动词' },
            { index: '6', q: 'Du ___ (sollen) dich ausruhen.', answer: 'sollst', type: 'text', module: '情态动词' },
            { index: '7', q: 'Hier ___ (dürfen) man nicht rauchen.', answer: 'darf', type: 'text', module: '情态动词' },
            { index: '8', q: '___ (können) du mir helfen?', answer: 'Kannst', type: 'text', module: '情态动词' },
            { index: '9', q: 'Ihr ___ (können) die Bilder später sehen.', answer: 'könnt', type: 'text', module: '情态动词' },
            { index: '10', q: 'Sie ___ (sollen) einen Termin machen.', answer: 'sollen', type: 'text', module: '情态动词' }
          ]
        },
        {
          key: 'exam-3-IIb', kind: 'fill', kindLabel: '填空', name: 'II. Lückenfüllen b · Dialog（10 分）',
          modules: ['补全对话'], instruction: 'Ergänzen Sie den Dialog! 补全下列对话，每空 1 分。',
          questions: [
            { index: '1', q: 'Arzt: Guten Tag! Was ___ (1) Ihnen?', answer: 'fehlt', type: 'text', module: '补全对话' },
            { index: '2', q: 'Patient: Guten Tag. Ich habe mich ___ (2).', answer: 'erkältet', type: 'text', module: '补全对话' },
            { index: '3', q: 'Mein Hals tut mir sehr ___ (3).', answer: 'weh', type: 'text', module: '补全对话' },
            { index: '4', q: 'Arzt: Haben Sie ___ (4)?', answer: 'Fieber', type: 'text', module: '补全对话' },
            { index: '5', q: 'Patient: Ja, heute Morgen hatte ich 38 ___ (5).', answer: 'Grad', type: 'text', module: '补全对话' },
            { index: '6', q: 'Arzt: Seit wann haben Sie die ___ (6)?', answer: 'Beschwerden', type: 'text', module: '补全对话' },
            { index: '7', q: 'Patient: Seit ___ (7).', answer: 'Sonntag', type: 'text', module: '补全对话' },
            { index: '8', q: 'Arzt: Haben Sie ___ (8) genommen?', answer: 'Medikamente', type: 'text', module: '补全对话' },
            { index: '9', q: 'Patient: Ja, aber sie haben nicht ___ (9).', answer: 'geholfen', type: 'text', module: '补全对话' },
            { index: '10', q: 'Arzt: Sie haben eine ___ (10).', answer: 'Grippe', type: 'text', module: '补全对话' }
          ]
        },
        {
          key: 'exam-3-IIc', kind: 'fill', kindLabel: '填空', name: 'II. Lückenfüllen c · Perfekt（10 分）',
          modules: ['现在完成时'], instruction: 'Ergänzen Sie „haben / sein“ in der richtigen Form! 用 haben 或 sein 的正确形式填空，每空 1 分。',
          questions: [
            { index: '1', q: 'Ich ___ am Wochenende einen Ausflug gemacht.', answer: 'habe', type: 'text', module: '现在完成时' },
            { index: '2', q: 'Er ___ an die Ostsee gefahren.', answer: 'ist', type: 'text', module: '现在完成时' },
            { index: '3', q: 'Wir ___ auf der Insel viel fotografiert.', answer: 'haben', type: 'text', module: '现在完成时' },
            { index: '4', q: 'Sie ___ in der Sonne gelegen.', answer: 'hat', type: 'text', module: '现在完成时' },
            { index: '5', q: '___ du gestern gearbeitet?', answer: 'Hast', type: 'text', module: '现在完成时' },
            { index: '6', q: 'Ich ___ gestern zu Hause geblieben.', answer: 'bin', type: 'text', module: '现在完成时' },
            { index: '7', q: 'Sie ___ ein Praktikum absolviert.', answer: 'hat', type: 'text', module: '现在完成时' },
            { index: '8', q: 'Wir ___ im Meer gebadet.', answer: 'haben', type: 'text', module: '现在完成时' },
            { index: '9', q: '___ ihr die Fotos gesehen?', answer: 'Habt', type: 'text', module: '现在完成时' },
            { index: '10', q: 'Er ___ heute früh aufgestanden.', answer: 'ist', type: 'text', module: '现在完成时' }
          ]
        },
        {
          key: 'exam-3-IIIa', kind: 'translation', kindLabel: '改写', name: 'III. Umformen a · Bilden Sie Sätze（10 分）',
          modules: ['组句'], instruction: 'Bilden Sie Sätze aus den gegebenen Wörtern! 用所给词语连成句子，每题 2 分。',
          questions: [
            { index: '1', q: 'ich / dir / die Bilder / zeigen', answer: 'Ich zeige dir die Bilder.', type: 'text', module: '组句' },
            { index: '2', q: 'er / am Wochenende / einen Ausflug / machen', answer: 'Er macht am Wochenende einen Ausflug. / Er hat am Wochenende einen Ausflug gemacht.', type: 'text', module: '组句' },
            { index: '3', q: 'sie / ein Praktikum / bei Siemens / absolvieren', answer: 'Sie hat ein Praktikum bei Siemens absolviert.', type: 'text', module: '组句' },
            { index: '4', q: 'du / dich / erkälten', answer: 'Du hast dich erkältet.', type: 'text', module: '组句' },
            { index: '5', q: 'der Arzt / mir / ein Medikament / verschreiben', answer: 'Der Arzt verschreibt mir ein Medikament.', type: 'text', module: '组句' }
          ]
        },
        {
          key: 'exam-3-IIIb', kind: 'translation', kindLabel: '改写', name: 'III. Umformen b · Perfekt（10 分）',
          modules: ['改写'], instruction: 'Formen Sie die Sätze ins Perfekt um! 将下列句子改写为现在完成时，每题 2 分。',
          questions: [
            { index: '1', q: 'Er macht einen Ausflug.', answer: 'Er hat einen Ausflug gemacht.', type: 'text', module: '改写' },
            { index: '2', q: 'Wir fahren an die Ostsee.', answer: 'Wir sind an die Ostsee gefahren.', type: 'text', module: '改写' },
            { index: '3', q: 'Sie übersetzt Prospekte.', answer: 'Sie hat Prospekte übersetzt.', type: 'text', module: '改写' },
            { index: '4', q: 'Ich bleibe zu Hause.', answer: 'Ich bin zu Hause geblieben.', type: 'text', module: '改写' },
            { index: '5', q: 'Er steht früh auf.', answer: 'Er ist früh aufgestanden.', type: 'text', module: '改写' }
          ]
        },
        {
          key: 'exam-3-IV', kind: 'choice', kindLabel: '阅读', name: 'IV. Leseverständnis（10 分）',
          modules: ['阅读理解'], instruction: 'Lesen Sie den Text und kreuzen Sie an: Richtig oder Falsch? 读短文，判断正误，每题 2 分。',
          questions: [
            { index: '0', q: '【短文】Moritz hat in den Ferien ein Praktikum bei der Firma Siemens absolviert. Er hat Prospekte vom Deutschen ins Englische übersetzt. Dabei hat es ihm viel Spaß gemacht. Er hat auch in der Abteilung für Qualitätsmanagement viel gelernt. Das ist sehr nützlich für seine Abschlussarbeit. Günther hat einen Monat im Biergarten als Kellner gearbeitet und viel Geld verdient.', options: ['（短文，无需作答）'], answer: 'A', type: 'choice', module: '阅读理解' },
            { index: '1', q: '1) Moritz hat ein Praktikum bei Siemens gemacht.', options: ['Richtig', 'Falsch'], answer: 'A', type: 'choice', module: '阅读理解' },
            { index: '2', q: '2) Moritz hat Prospekte vom Englischen ins Deutsche übersetzt.', options: ['Richtig', 'Falsch'], answer: 'B', type: 'choice', module: '阅读理解' },
            { index: '3', q: '3) Günther hat im Biergarten als Kellner gearbeitet.', options: ['Richtig', 'Falsch'], answer: 'A', type: 'choice', module: '阅读理解' },
            { index: '4', q: '4) Moritz hat in der Abteilung für Qualitätsmanagement viel gelernt.', options: ['Richtig', 'Falsch'], answer: 'A', type: 'choice', module: '阅读理解' },
            { index: '5', q: '5) Das Praktikum ist nicht nützlich für die Abschlussarbeit.', options: ['Richtig', 'Falsch'], answer: 'B', type: 'choice', module: '阅读理解' }
          ]
        },
        {
          key: 'exam-3-Va', kind: 'translation', kindLabel: '翻译', name: 'V. Übersetzen a · Chinesisch-Deutsch（10 分）',
          modules: ['汉译德'], instruction: 'Übersetzen Sie ins Deutsche! 把下列句子译成德语，每题 2 分。',
          questions: [
            { index: '1', q: '我女朋友快过生日了。', answer: 'Meine Freundin hat bald Geburtstag.', type: 'text', module: '汉译德' },
            { index: '2', q: '你周末做了什么？', answer: 'Was hast du am Wochenende gemacht?', type: 'text', module: '汉译德' },
            { index: '3', q: '我在西门子公司完成了实习。', answer: 'Ich habe ein Praktikum bei der Firma Siemens absolviert.', type: 'text', module: '汉译德' },
            { index: '4', q: '您哪里不舒服？', answer: 'Was fehlt Ihnen?', type: 'text', module: '汉译德' },
            { index: '5', q: '请深呼吸！', answer: 'Atmen Sie bitte tief ein!', type: 'text', module: '汉译德' }
          ]
        },
        {
          key: 'exam-3-Vb', kind: 'translation', kindLabel: '翻译', name: 'V. Übersetzen b · Deutsch-Chinesisch（10 分）',
          modules: ['德译汉'], instruction: 'Übersetzen Sie ins Chinesische! 把下列句子译成中文，每题 2 分。',
          questions: [
            { index: '1', q: 'Wie wär’s mit einer Mütze?', answer: '送一顶帽子怎么样？', type: 'text', module: '德译汉' },
            { index: '2', q: 'Ich will unbedingt mal auf die Insel!', answer: '我一定要去一次那座岛！', type: 'text', module: '德译汉' },
            { index: '3', q: 'Gute Besserung!', answer: '祝早日康复！', type: 'text', module: '德译汉' },
            { index: '4', q: 'Das ist sehr nützlich für meine Abschlussarbeit.', answer: '这对我的毕业论文非常有用。', type: 'text', module: '德译汉' },
            { index: '5', q: 'Sie sollten sich eigentlich ausruhen.', answer: '您其实应该休息一下。', type: 'text', module: '德译汉' }
          ]
        }
      ]
    },
    {
      key: 'exam-4',
      name: '模拟试卷四 · 第 10 单元与综合复习',
      units: [
        {
          key: 'exam-4-I', kind: 'choice', kindLabel: '选择', name: 'I. Wortschatz und Grammatik（20 分）',
          modules: ['词汇与语法'], instruction: 'Wählen Sie die richtige Lösung! 选出正确答案，每题 1 分。',
          questions: [
            { index: '1', q: 'Entschuldigen Sie, wie komme ich ___ Stadtbibliothek?', options: ['in der', 'zur', 'an die'], answer: 'B', type: 'choice', module: '词汇与语法' },
            { index: '2', q: 'Wissen Sie, wo die Bibliothek ___?', options: ['ist', 'sind', 'bist'], answer: 'A', type: 'choice', module: '词汇与语法' },
            { index: '3', q: 'Biegen Sie hier rechts ___.', options: ['auf', 'aus', 'ab'], answer: 'C', type: 'choice', module: '词汇与语法' },
            { index: '4', q: 'Gehen Sie die Straße ___.', options: ['entlang', 'über', 'durch'], answer: 'A', type: 'choice', module: '词汇与语法' },
            { index: '5', q: 'Die Haltestelle ist gleich ___ der Post.', options: ['nach', 'vor', 'hinter'], answer: 'B', type: 'choice', module: '词汇与语法' },
            { index: '6', q: 'Sie müssen ___ Hauptbahnhof umsteigen.', options: ['am', 'um', 'auf'], answer: 'A', type: 'choice', module: '词汇与语法' },
            { index: '7', q: 'Fahren Sie bis ___ Karlsplatz.', options: ['zur', 'zum', 'ins'], answer: 'B', type: 'choice', module: '词汇与语法' },
            { index: '8', q: 'Die Ampel ist jetzt ___.', options: ['rot', 'grün', 'blau'], answer: 'A', type: 'choice', module: '词汇与语法' },
            { index: '9', q: 'Ich bin nicht ___.', options: ['aus hier', 'von hier', 'in hier'], answer: 'B', type: 'choice', module: '词汇与语法' },
            { index: '10', q: 'Gehen Sie um die Kirche, dann ___ Sie die Bibliothek.', options: ['seht', 'siehst', 'sehen'], answer: 'C', type: 'choice', module: '词汇与语法' },
            { index: '11', q: 'Wie lange muss ich ___?', options: ['gehen', 'gehe', 'geht'], answer: 'A', type: 'choice', module: '词汇与语法' },
            { index: '12', q: 'Ist es weit ___ hier?', options: ['von', 'aus', 'bei'], answer: 'A', type: 'choice', module: '词汇与语法' },
            { index: '13', q: 'Ich kann Sie ein Stück ___.', options: ['begleiten', 'begleite', 'begleitet'], answer: 'A', type: 'choice', module: '词汇与语法' },
            { index: '14', q: 'Wo ist die nächste ___?', options: ['Bushaltestelle', 'Bushaltstelle', 'Bushaltestell'], answer: 'A', type: 'choice', module: '词汇与语法' },
            { index: '15', q: 'Rechts, links, ___.', options: ['gerade', 'geradeaus', 'grad'], answer: 'B', type: 'choice', module: '词汇与语法' },
            { index: '16', q: 'Die S6 fährt ___ Rathaus.', options: ['bis zur', 'bis zum', 'bis ins'], answer: 'B', type: 'choice', module: '词汇与语法' },
            { index: '17', q: 'Er wohnt ___ Berlin.', options: ['in', 'nach', 'zu'], answer: 'A', type: 'choice', module: '词汇与语法' },
            { index: '18', q: 'Sie fährt ___ Deutschland.', options: ['nach', 'in', 'zu'], answer: 'A', type: 'choice', module: '词汇与语法' },
            { index: '19', q: 'Das ist die Insel mit den ___.', options: ['Kreidefelsen', 'Kreidefels', 'Kreidefelsen'], answer: 'A', type: 'choice', module: '词汇与语法' },
            { index: '20', q: '___ geht’s denn lang?', options: ['Wie', 'Wo', 'Wer'], answer: 'B', type: 'choice', module: '词汇与语法' }
          ]
        },
        {
          key: 'exam-4-IIa', kind: 'fill', kindLabel: '填空', name: 'II. Lückenfüllen a · Präpositionen（10 分）',
          modules: ['介词'], instruction: 'Ergänzen Sie die Präpositionen! 填入正确的介词（über / durch / um / entlang / gegenüber / vor / bis），每空 1 分。',
          questions: [
            { index: '1', q: 'Gehen Sie die Straße ___.', answer: 'entlang', type: 'text', module: '介词' },
            { index: '2', q: 'Zuerst gehen wir ___ eine Brücke.', answer: 'über', type: 'text', module: '介词' },
            { index: '3', q: 'Dann gehen wir ___ das Stadttor.', answer: 'durch', type: 'text', module: '介词' },
            { index: '4', q: 'Biegen Sie ___ die Ecke.', answer: 'um', type: 'text', module: '介词' },
            { index: '5', q: '___ dem Theater ist eine Post.', answer: 'Gegenüber', type: 'text', module: '介词' },
            { index: '6', q: 'Die Haltestelle ist gleich ___ der Post.', answer: 'vor', type: 'text', module: '介词' },
            { index: '7', q: 'Fahren Sie ___ zum Karlsplatz.', answer: 'bis', type: 'text', module: '介词' },
            { index: '8', q: 'Das Wohnzimmer hat einen Balkon ___ Süden.', answer: 'nach', type: 'text', module: '介词' },
            { index: '9', q: 'Er wohnt ___ Hamburg.', answer: 'in', type: 'text', module: '介词' },
            { index: '10', q: 'Wir fahren ___ China.', answer: 'nach', type: 'text', module: '介词' }
          ]
        },
        {
          key: 'exam-4-IIb', kind: 'fill', kindLabel: '填空', name: 'II. Lückenfüllen b · Modalverben（10 分）',
          modules: ['情态动词'], instruction: 'Ergänzen Sie die Modalverben in der richtigen Form! 用括号中情态动词的正确形式填空，每空 1 分。',
          questions: [
            { index: '1', q: 'Ich ___ (müssen) mich beeilen.', answer: 'muss', type: 'text', module: '情态动词' },
            { index: '2', q: '___ (können) Sie mir helfen?', answer: 'Können', type: 'text', module: '情态动词' },
            { index: '3', q: 'Du ___ (sollen) hier rechts abbiegen.', answer: 'sollst', type: 'text', module: '情态动词' },
            { index: '4', q: 'Wir ___ (wollen) zum Bahnhof.', answer: 'wollen', type: 'text', module: '情态动词' },
            { index: '5', q: 'Er ___ (dürfen) heute nicht arbeiten.', answer: 'darf', type: 'text', module: '情态动词' },
            { index: '6', q: 'Ich ___ (möchten) ein Ticket kaufen.', answer: 'möchte', type: 'text', module: '情态动词' },
            { index: '7', q: '___ (mögen) Sie Kaffee?', answer: 'Mögen', type: 'text', module: '情态动词' },
            { index: '8', q: 'Ihr ___ (können) hier warten.', answer: 'könnt', type: 'text', module: '情态动词' },
            { index: '9', q: 'Sie ___ (müssen) am Bahnhof umsteigen.', answer: 'müssen', type: 'text', module: '情态动词' },
            { index: '10', q: 'Hier ___ (dürfen) man nicht parken.', answer: 'darf', type: 'text', module: '情态动词' }
          ]
        },
        {
          key: 'exam-4-IIc', kind: 'fill', kindLabel: '填空', name: 'II. Lückenfüllen c · Perfekt（10 分）',
          modules: ['现在完成时'], instruction: 'Ergänzen Sie „haben / sein“ in der richtigen Form! 用 haben 或 sein 的正确形式填空，每空 1 分。',
          questions: [
            { index: '1', q: 'Wohin ___ du den Ausflug gemacht?', answer: 'hast', type: 'text', module: '现在完成时' },
            { index: '2', q: 'Er ___ an die Ostsee gefahren.', answer: 'ist', type: 'text', module: '现在完成时' },
            { index: '3', q: 'Wir ___ im Restaurant gegessen.', answer: 'haben', type: 'text', module: '现在完成时' },
            { index: '4', q: '___ ihr die Hausaufgaben gemacht?', answer: 'Habt', type: 'text', module: '现在完成时' },
            { index: '5', q: 'Ich ___ einen Brief geschrieben.', answer: 'habe', type: 'text', module: '现在完成时' },
            { index: '6', q: 'Er ___ um acht Uhr aufgestanden.', answer: 'ist', type: 'text', module: '现在完成时' },
            { index: '7', q: '___ du das Buch gelesen?', answer: 'Hast', type: 'text', module: '现在完成时' },
            { index: '8', q: 'Sie ___ eine Wohnung gemietet.', answer: 'hat', type: 'text', module: '现在完成时' },
            { index: '9', q: 'Wir ___ am Strand spazieren gegangen.', answer: 'sind', type: 'text', module: '现在完成时' },
            { index: '10', q: 'Das Kind ___ ein Eis gegessen.', answer: 'hat', type: 'text', module: '现在完成时' }
          ]
        },
        {
          key: 'exam-4-IIIa', kind: 'translation', kindLabel: '改写', name: 'III. Umformen a · Bilden Sie Sätze（10 分）',
          modules: ['组句'], instruction: 'Bilden Sie Sätze aus den gegebenen Wörtern! 用所给词语连成句子，每题 2 分。',
          questions: [
            { index: '1', q: 'Sie / an der Kreuzung / rechts / abbiegen', answer: 'Biegen Sie an der Kreuzung rechts ab!', type: 'text', module: '组句' },
            { index: '2', q: 'ich / zur Staatsbibliothek / wie / kommen', answer: 'Wie komme ich zur Staatsbibliothek?', type: 'text', module: '组句' },
            { index: '3', q: 'du / die Straße / entlang / gehen', answer: 'Geh die Straße entlang!', type: 'text', module: '组句' },
            { index: '4', q: 'er / am Karlsplatz / umsteigen', answer: 'Er steigt am Karlsplatz um.', type: 'text', module: '组句' },
            { index: '5', q: 'wir / uns / beeilen / müssen', answer: 'Wir müssen uns beeilen.', type: 'text', module: '组句' }
          ]
        },
        {
          key: 'exam-4-IIIb', kind: 'translation', kindLabel: '改写', name: 'III. Umformen b · Perfekt（10 分）',
          modules: ['改写'], instruction: 'Formen Sie die Sätze ins Perfekt um! 将下列句子改写为现在完成时，每题 2 分。',
          questions: [
            { index: '1', q: 'Er fährt nach Hause.', answer: 'Er ist nach Hause gefahren.', type: 'text', module: '改写' },
            { index: '2', q: 'Wir gehen in die Stadt.', answer: 'Wir sind in die Stadt gegangen.', type: 'text', module: '改写' },
            { index: '3', q: 'Sie steigt am Bahnhof um.', answer: 'Sie ist am Bahnhof umgestiegen.', type: 'text', module: '改写' },
            { index: '4', q: 'Der Bus kommt.', answer: 'Der Bus ist gekommen.', type: 'text', module: '改写' },
            { index: '5', q: 'Du liest das Buch.', answer: 'Du hast das Buch gelesen.', type: 'text', module: '改写' }
          ]
        },
        {
          key: 'exam-4-IV', kind: 'choice', kindLabel: '阅读', name: 'IV. Leseverständnis（10 分）',
          modules: ['阅读理解'], instruction: 'Lesen Sie den Text und kreuzen Sie an: Richtig oder Falsch? 读短文，判断正误，每题 2 分。',
          questions: [
            { index: '0', q: '【短文】Herr Ma ist neu in Hamburg. Er möchte zur Staatsbibliothek. Er fragt einen Passanten: „Entschuldigen Sie, wie komme ich zur Staatsbibliothek?“ Der Passant sagt: „Nehmen Sie zuerst den Bus Linie 16, dann die S6 bis zum Rathaus. Dort steigen Sie in die U2 um und fahren bis zum Karlsplatz. Die Bibliothek liegt direkt am Karlsplatz.“ Herr Ma bedankt sich und geht zur Bushaltestelle.', options: ['（短文，无需作答）'], answer: 'A', type: 'choice', module: '阅读理解' },
            { index: '1', q: '1) Herr Ma ist neu in Hamburg.', options: ['Richtig', 'Falsch'], answer: 'A', type: 'choice', module: '阅读理解' },
            { index: '2', q: '2) Er möchte zum Hauptbahnhof.', options: ['Richtig', 'Falsch'], answer: 'B', type: 'choice', module: '阅读理解' },
            { index: '3', q: '3) Er muss zuerst den Bus Linie 16 nehmen.', options: ['Richtig', 'Falsch'], answer: 'A', type: 'choice', module: '阅读理解' },
            { index: '4', q: '4) Die S6 fährt direkt bis zum Karlsplatz.', options: ['Richtig', 'Falsch'], answer: 'B', type: 'choice', module: '阅读理解' },
            { index: '5', q: '5) Die Bibliothek liegt am Karlsplatz.', options: ['Richtig', 'Falsch'], answer: 'A', type: 'choice', module: '阅读理解' }
          ]
        },
        {
          key: 'exam-4-Va', kind: 'translation', kindLabel: '翻译', name: 'V. Übersetzen a · Chinesisch-Deutsch（10 分）',
          modules: ['汉译德'], instruction: 'Übersetzen Sie ins Deutsche! 把下列句子译成德语，每题 2 分。',
          questions: [
            { index: '1', q: '打扰一下，请问去市图书馆怎么走？', answer: 'Entschuldigen Sie, wie komme ich zur Stadtbibliothek?', type: 'text', module: '汉译德' },
            { index: '2', q: '您必须在这里换乘。', answer: 'Sie müssen hier umsteigen.', type: 'text', module: '汉译德' },
            { index: '3', q: '我现在必须赶紧了。', answer: 'Ich muss mich jetzt beeilen.', type: 'text', module: '汉译德' },
            { index: '4', q: '您能陪我走一段吗？', answer: 'Können Sie mich ein Stück begleiten?', type: 'text', module: '汉译德' },
            { index: '5', q: '非常感谢您的帮助。', answer: 'Vielen Dank für Ihre Hilfe.', type: 'text', module: '汉译德' }
          ]
        },
        {
          key: 'exam-4-Vb', kind: 'translation', kindLabel: '翻译', name: 'V. Übersetzen b · Deutsch-Chinesisch（10 分）',
          modules: ['德译汉'], instruction: 'Übersetzen Sie ins Chinesische! 把下列句子译成中文，每题 2 分。',
          questions: [
            { index: '1', q: 'Ich bin nicht von hier.', answer: '我不是本地人。', type: 'text', module: '德译汉' },
            { index: '2', q: 'Die Ampel ist jetzt rot.', answer: '现在是红灯。', type: 'text', module: '德译汉' },
            { index: '3', q: 'Die Haltestelle ist gleich vor der Post.', answer: '车站就在邮局前面。', type: 'text', module: '德译汉' },
            { index: '4', q: 'Das ist aber sehr nett von Ihnen.', answer: '您真是太好了。', type: 'text', module: '德译汉' },
            { index: '5', q: 'Rechts, links, geradeaus.', answer: '右转、左转、直走。', type: 'text', module: '德译汉' }
          ]
        }
      ]
    }
  ]
};

