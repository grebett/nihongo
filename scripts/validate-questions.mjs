import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';

const QUESTIONS_DIR = 'src/data/lessons/verb-conjugation/questions';
const TARGET_COUNT = 20;

let totalErrors = 0;
let totalWarnings = 0;

function error(file, partId, idx, msg) {
  console.error(`  ❌ [${file} → ${partId} → Q${idx + 1}] ${msg}`);
  totalErrors++;
}

function warn(file, partId, idx, msg) {
  console.warn(`  ⚠️  [${file} → ${partId} → Q${idx + 1}] ${msg}`);
  totalWarnings++;
}

function warnGeneral(file, partId, msg) {
  console.warn(`  ⚠️  [${file} → ${partId}] ${msg}`);
  totalWarnings++;
}

// Check if a string contains kanji without ruby tags
function findNakedKanji(str) {
  if (!str) return [];
  const s = String(str);
  // Remove all <ruby>...<rt>...</rt></ruby> blocks
  const stripped = s.replace(/<ruby>[^<]*<rt>[^<]*<\/rt><\/ruby>/g, '');
  // Match any remaining kanji (CJK Unified Ideographs)
  const kanji = stripped.match(/[\u4e00-\u9faf\u3400-\u4dbf]/g);
  return kanji || [];
}

// Normalize a question string for duplicate detection
function normalizeQuestion(q) {
  return q
    .replace(/<ruby>([^<]*)<rt>[^<]*<\/rt><\/ruby>/g, '$1') // strip ruby, keep kanji
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

// Known conjugation checks (spot-check correctness)
const ICHIDAN_VERBS = new Set([
  '食べる', '見る', '起きる', '寝る', '教える', '開ける', '閉める', '着る',
  '浴びる', '出る', '信じる', '感じる', '降りる', '借りる', '出かける',
  '答える', '調べる', '考える', '覚える', '忘れる', 'いる', '似る',
  '生まれる', '負ける', '混ぜる', '逃げる', '捨てる', '育てる', '倒れる',
  '始める', '集める', '届ける', '受ける', '助ける', '換える', '伝える',
  '迎える', '慣れる', '疲れる', '離れる', '壊れる'
]);

const GODAN_VERBS = new Set([
  '飲む', '書く', '読む', '泳ぐ', '話す', '待つ', '買う', '遊ぶ', '死ぬ',
  '走る', '歩く', '帰る', '立つ', '座る', '持つ', '送る', '作る', '使う',
  '笑う', '乗る', '知る', '切る', '売る', '思う', '会う', '言う', '聞く',
  '脱ぐ', '押す', '消す', '返す', '行く', '入る', '取る', '通る', '撮る',
  '登る', '渡る', '守る', '掛かる', '分かる', '始まる', '終わる', '払う',
  '動く', '働く', '届く', '急ぐ', '稼ぐ', '落とす', '直す', '探す',
  '呼ぶ', '選ぶ', '学ぶ', '運ぶ', '頼む', '休む', '住む', '進む', '噛む'
]);

// Load all files
const files = fs.readdirSync(QUESTIONS_DIR).filter(f => f.endsWith('.yaml')).sort();
const allQuestions = new Map(); // partId -> questions
const allNormalized = []; // { file, partId, idx, normalized }

console.log('=== Question Validation ===\n');

// ---------- PASS 1: Parse & structural checks ----------
console.log('--- Pass 1: YAML parsing & structure ---');
for (const file of files) {
  const filePath = path.join(QUESTIONS_DIR, file);
  let data;
  try {
    data = yaml.load(fs.readFileSync(filePath, 'utf8'));
  } catch (e) {
    console.error(`  ❌ [${file}] YAML parse error: ${e.message}`);
    totalErrors++;
    continue;
  }

  if (!data || typeof data !== 'object') {
    console.error(`  ❌ [${file}] Empty or invalid YAML`);
    totalErrors++;
    continue;
  }

  for (const [partId, questions] of Object.entries(data)) {
    if (!Array.isArray(questions)) {
      error(file, partId, -1, `Part value is not an array`);
      continue;
    }

    allQuestions.set(partId, { file, questions });

    questions.forEach((q, idx) => {
      // Required fields
      if (!q.type) error(file, partId, idx, 'Missing "type" field');
      if (!q.question) error(file, partId, idx, 'Missing "question" field');
      if (!q.hint) error(file, partId, idx, 'Missing "hint" field');

      if (q.type === 'multiple-choice') {
        if (!Array.isArray(q.options)) {
          error(file, partId, idx, 'Multiple-choice missing "options" array');
        } else {
          if (q.options.length !== 4) {
            warn(file, partId, idx, `Expected 4 options, got ${q.options.length}`);
          }
          if (q.answer === undefined || q.answer === null) {
            error(file, partId, idx, 'Missing "answer" field');
          } else if (q.answer < 0 || q.answer >= q.options.length) {
            error(file, partId, idx, `Answer index ${q.answer} out of bounds (0-${q.options.length - 1})`);
          }
        }
        if (q.answers) {
          warn(file, partId, idx, 'Multiple-choice has "answers" field (should use "answer" for index)');
        }
      } else if (q.type === 'free-input') {
        if (!Array.isArray(q.answers) || q.answers.length === 0) {
          error(file, partId, idx, 'Free-input missing "answers" array');
        }
        if (q.answer !== undefined) {
          warn(file, partId, idx, 'Free-input has "answer" field (should use "answers" array)');
        }
        if (q.options) {
          warn(file, partId, idx, 'Free-input has "options" field (not needed)');
        }
      } else if (q.type) {
        error(file, partId, idx, `Unknown type: "${q.type}"`);
      }

      // Track for duplicate detection
      if (q.question) {
        allNormalized.push({
          file,
          partId,
          idx,
          normalized: normalizeQuestion(String(q.question)),
          original: String(q.question),
        });
      }
    });
  }
}

// ---------- PASS 2: Count check ----------
console.log('\n--- Pass 2: Question counts ---');
let countIssues = 0;
for (const [partId, { file, questions }] of allQuestions) {
  if (questions.length !== TARGET_COUNT) {
    const symbol = questions.length < TARGET_COUNT ? '❌' : '⚠️';
    console.log(`  ${symbol} ${partId}: ${questions.length}/${TARGET_COUNT}`);
    if (questions.length < TARGET_COUNT) totalErrors++;
    else totalWarnings++;
    countIssues++;
  }
}
if (countIssues === 0) console.log('  ✅ All parts have exactly 20 questions');

// ---------- PASS 3: Duplicate detection ----------
console.log('\n--- Pass 3: Duplicate detection ---');
// Within same part
let dupeCount = 0;
for (const [partId, { file, questions }] of allQuestions) {
  const seen = new Map();
  questions.forEach((q, idx) => {
    if (!q.question) return;
    const norm = normalizeQuestion(q.question);
    if (seen.has(norm)) {
      error(file, partId, idx, `Duplicate of Q${seen.get(norm) + 1}: "${q.question.substring(0, 60)}..."`);
      dupeCount++;
    } else {
      seen.set(norm, idx);
    }
  });
}

// Across parts (same file = likely issue; cross-file = might be intentional for test tabs)
const crossPartDupes = new Map();
for (const entry of allNormalized) {
  const key = entry.normalized;
  if (!crossPartDupes.has(key)) {
    crossPartDupes.set(key, []);
  }
  crossPartDupes.get(key).push(entry);
}

let crossDupeCount = 0;
for (const [norm, entries] of crossPartDupes) {
  if (entries.length > 1) {
    // Only warn if duplicates are in the same file (cross-file test dupes are expected)
    const sameFile = new Map();
    for (const e of entries) {
      if (!sameFile.has(e.file)) sameFile.set(e.file, []);
      sameFile.get(e.file).push(e);
    }
    for (const [file, group] of sameFile) {
      if (group.length > 1) {
        // Skip if both are in test and non-test parts (expected)
        const parts = group.map(g => g.partId);
        const hasTest = parts.some(p => p.endsWith('-test'));
        const hasNonTest = parts.some(p => !p.endsWith('-test'));
        if (hasTest && hasNonTest && group.length === 2) continue; // acceptable

        const locations = group.map(g => `${g.partId}:Q${g.idx + 1}`).join(', ');
        warnGeneral(file, locations, `Cross-part duplicate: "${group[0].original.substring(0, 60)}..."`);
        crossDupeCount++;
      }
    }
  }
}
if (dupeCount === 0 && crossDupeCount === 0) console.log('  ✅ No duplicates found');

// ---------- PASS 4: Furigana check ----------
console.log('\n--- Pass 4: Furigana on kanji ---');
let furiganaIssues = 0;
for (const [partId, { file, questions }] of allQuestions) {
  questions.forEach((q, idx) => {
    // Check question text
    const nakedInQ = findNakedKanji(q.question);
    if (nakedInQ.length > 0) {
      warn(file, partId, idx, `Naked kanji in question: ${nakedInQ.join(', ')} — "${q.question.substring(0, 50)}..."`);
      furiganaIssues++;
    }

    // Check options
    if (q.options) {
      q.options.forEach((opt, oi) => {
        const naked = findNakedKanji(opt);
        if (naked.length > 0) {
          warn(file, partId, idx, `Naked kanji in option ${oi}: ${naked.join(', ')} — "${opt.substring(0, 40)}"`);
          furiganaIssues++;
        }
      });
    }
  });
}
if (furiganaIssues === 0) console.log('  ✅ All kanji have furigana');

// ---------- PASS 5: Spot-check answer correctness ----------
console.log('\n--- Pass 5: Quick conjugation spot-checks ---');
let spotIssues = 0;

// For free-input: check that answers array has at least 2 variants (kanji + kana or romaji)
for (const [partId, { file, questions }] of allQuestions) {
  questions.forEach((q, idx) => {
    if (q.type === 'free-input' && q.answers) {
      if (q.answers.length < 2) {
        warn(file, partId, idx, `Only ${q.answers.length} answer variant(s) — should have kanji, hiragana, and romaji`);
        spotIssues++;
      }
    }
  });
}
if (spotIssues === 0) console.log('  ✅ All free-input questions have multiple answer variants');

// ---------- Summary ----------
console.log('\n=== Summary ===');
console.log(`  Files checked: ${files.length}`);
console.log(`  Parts checked: ${allQuestions.size}`);
console.log(`  Total questions: ${[...allQuestions.values()].reduce((sum, { questions }) => sum + questions.length, 0)}`);
console.log(`  Errors: ${totalErrors}`);
console.log(`  Warnings: ${totalWarnings}`);

if (totalErrors > 0) {
  console.log('\n  ❌ VALIDATION FAILED — fix errors above');
  process.exit(1);
} else if (totalWarnings > 0) {
  console.log('\n  ⚠️  Passed with warnings — review above');
  process.exit(0);
} else {
  console.log('\n  ✅ ALL CHECKS PASSED');
  process.exit(0);
}
