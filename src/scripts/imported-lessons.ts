import yaml from 'js-yaml';
import type { Lesson, Question } from './lessons';

export interface LessonBundle {
  lesson: Lesson;
  questions: Record<string, Question[]>;
}

const STORAGE_KEY = 'nihon-imported-lessons';

type Store = Record<string, LessonBundle>;

function readStore(): Store {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const data = JSON.parse(raw);
    return data && typeof data === 'object' ? data : {};
  } catch {
    return {};
  }
}

function writeStore(store: Store): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

export function getAllImported(): LessonBundle[] {
  const store = readStore();
  return Object.values(store);
}

export function getImported(id: string): LessonBundle | null {
  return readStore()[id] ?? null;
}

export function saveImported(bundle: LessonBundle): void {
  const store = readStore();
  store[bundle.lesson.id] = bundle;
  writeStore(store);
}

export function deleteImported(id: string): void {
  const store = readStore();
  delete store[id];
  writeStore(store);
}

export type ParseResult =
  | { ok: true; bundle: LessonBundle }
  | { ok: false; error: string };

const VALID_TYPES = new Set(['multiple-choice', 'free-input', 'sentence-blocks', 'matching']);

function validateQuestion(q: any, path: string): string | null {
  if (typeof q !== 'object' || q === null) return `${path}: must be an object`;
  if (typeof q.type !== 'string') return `${path}.type: missing or not a string`;
  if (!VALID_TYPES.has(q.type)) return `${path}.type: "${q.type}" is not one of multiple-choice|free-input|sentence-blocks|matching`;
  if (typeof q.question !== 'string' || !q.question.trim()) return `${path}.question: missing or empty`;

  if (q.type === 'multiple-choice') {
    if (!Array.isArray(q.options) || q.options.length < 2) return `${path}.options: must be an array with at least 2 entries`;
    if (typeof q.answer !== 'number' || q.answer < 0 || q.answer >= q.options.length) {
      return `${path}.answer: must be a valid index into options`;
    }
  } else if (q.type === 'free-input') {
    if (!Array.isArray(q.answers) || q.answers.length === 0) return `${path}.answers: must be a non-empty array`;
  } else if (q.type === 'sentence-blocks') {
    if (!Array.isArray(q.blocks) || q.blocks.length === 0) return `${path}.blocks: must be a non-empty array`;
    for (let i = 0; i < q.blocks.length; i++) {
      if (typeof q.blocks[i] !== 'object' || typeof q.blocks[i].text !== 'string') {
        return `${path}.blocks[${i}].text: missing or not a string`;
      }
    }
  } else if (q.type === 'matching') {
    if (!Array.isArray(q.pairs) || q.pairs.length < 2) return `${path}.pairs: must have at least 2 pairs`;
    for (let i = 0; i < q.pairs.length; i++) {
      const p = q.pairs[i];
      if (typeof p !== 'object' || typeof p.jp !== 'string' || typeof p.meaning !== 'string') {
        return `${path}.pairs[${i}]: must have string fields "jp" and "meaning"`;
      }
    }
  }

  return null;
}

export function parseImportYaml(text: string): ParseResult {
  let parsed: any;
  try {
    parsed = yaml.load(text);
  } catch (e: any) {
    return { ok: false, error: `Invalid YAML: ${e?.message ?? e}` };
  }

  if (!parsed || typeof parsed !== 'object') {
    return { ok: false, error: 'The file must contain a YAML object.' };
  }

  const lesson = parsed.lesson;
  const questions = parsed.questions;

  if (!lesson || typeof lesson !== 'object') return { ok: false, error: 'Missing or invalid "lesson" field.' };
  if (!questions || typeof questions !== 'object') return { ok: false, error: 'Missing or invalid "questions" field.' };

  if (typeof lesson.id !== 'string' || !lesson.id.trim()) return { ok: false, error: 'lesson.id is missing.' };
  if (typeof lesson.title !== 'string' || !lesson.title.trim()) return { ok: false, error: 'lesson.title is missing.' };
  if (!Array.isArray(lesson.sections) || lesson.sections.length === 0) {
    return { ok: false, error: 'lesson.sections must be a non-empty array.' };
  }

  const knownPartIds = new Set<string>();
  for (let si = 0; si < lesson.sections.length; si++) {
    const sec = lesson.sections[si];
    if (typeof sec !== 'object') return { ok: false, error: `lesson.sections[${si}] must be an object.` };
    if (typeof sec.id !== 'string' || !sec.id.trim()) return { ok: false, error: `lesson.sections[${si}].id is missing.` };
    if (typeof sec.title !== 'string') return { ok: false, error: `lesson.sections[${si}].title is missing.` };
    if (!Array.isArray(sec.parts) || sec.parts.length === 0) {
      return { ok: false, error: `lesson.sections[${si}].parts must be a non-empty array.` };
    }
    for (let pi = 0; pi < sec.parts.length; pi++) {
      const p = sec.parts[pi];
      if (typeof p !== 'object') return { ok: false, error: `lesson.sections[${si}].parts[${pi}] must be an object.` };
      if (typeof p.id !== 'string' || !p.id.trim()) return { ok: false, error: `lesson.sections[${si}].parts[${pi}].id is missing.` };
      if (typeof p.title !== 'string') return { ok: false, error: `lesson.sections[${si}].parts[${pi}].title is missing.` };
      knownPartIds.add(p.id);
    }
  }

  for (const [partId, qList] of Object.entries(questions)) {
    if (!Array.isArray(qList)) return { ok: false, error: `questions["${partId}"] must be an array.` };
    for (let i = 0; i < qList.length; i++) {
      const err = validateQuestion(qList[i], `questions["${partId}"][${i}]`);
      if (err) return { ok: false, error: err };
    }
  }

  // Normalise lesson defaults
  const normalisedLesson: Lesson = {
    id: lesson.id,
    title: lesson.title,
    description: typeof lesson.description === 'string' ? lesson.description : '',
    source: typeof lesson.source === 'string' ? lesson.source : '',
    videoId: typeof lesson.videoId === 'string' ? lesson.videoId : '',
    coverImage: typeof lesson.coverImage === 'string' ? lesson.coverImage : undefined,
    coverEmoji: typeof lesson.coverEmoji === 'string' ? lesson.coverEmoji : undefined,
    number: lesson.number,
    sections: lesson.sections,
  };

  return {
    ok: true,
    bundle: {
      lesson: normalisedLesson,
      questions: questions as Record<string, Question[]>,
    },
  };
}

// ─── Promote: bundle → multi-file format ────────────────────────────────

/**
 * Convert an imported bundle into the multi-file format used by built-in
 * lessons in `src/data/lessons/<id>/`. Returns a map of relative path → YAML
 * content, ready to be written to disk.
 *
 * Convention: one questions/<sectionId>.yaml file per section, containing all
 * its parts. (Mirrors how shimamori-1 / verb-conjugation are organised.)
 */
export function bundleToFiles(bundle: LessonBundle): Record<string, string> {
  const files: Record<string, string> = {};

  // lesson.yaml — strip away anything that's only meaningful for imports
  const lessonForRepo = { ...bundle.lesson };
  files['lesson.yaml'] = yaml.dump(lessonForRepo, {
    lineWidth: -1, // don't wrap long strings (preserves ruby HTML in one line)
    quotingType: '"',
    forceQuotes: false,
  });

  // Group questions by their owning section
  // (a part belongs to the section that lists it in lesson.sections[].parts[])
  const partToSection: Record<string, string> = {};
  for (const sec of bundle.lesson.sections) {
    for (const p of sec.parts) {
      partToSection[p.id] = sec.id;
    }
  }

  const sectionBuckets: Record<string, Record<string, Question[]>> = {};
  for (const [partId, qList] of Object.entries(bundle.questions)) {
    const sectionId = partToSection[partId] ?? partId; // orphan parts get their own file
    if (!sectionBuckets[sectionId]) sectionBuckets[sectionId] = {};
    sectionBuckets[sectionId][partId] = qList;
  }

  for (const [sectionId, parts] of Object.entries(sectionBuckets)) {
    files[`questions/${sectionId}.yaml`] = yaml.dump(parts, {
      lineWidth: -1,
      quotingType: '"',
      forceQuotes: false,
    });
  }

  return files;
}

/**
 * Build a single bash command that creates the lesson folder + all files via
 * heredocs. The user pastes this into their terminal; files appear under
 * `src/data/lessons/<id>/`.
 */
export function bundleToShellCommand(bundle: LessonBundle): string {
  const files = bundleToFiles(bundle);
  const id = bundle.lesson.id;
  const dirParts = new Set<string>();
  for (const path of Object.keys(files)) {
    const dir = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
    if (dir) dirParts.add(dir);
  }
  const mkdirs = `mkdir -p src/data/lessons/${id}${dirParts.size > 0 ? '/' + Array.from(dirParts).join(' src/data/lessons/' + id + '/') : ''}`;

  const heredocs = Object.entries(files).map(([path, content]) =>
    `cat > src/data/lessons/${id}/${path} <<'NIHONGO_EOF'\n${content}NIHONGO_EOF`
  ).join('\n');

  return `${mkdirs}\n${heredocs}`;
}
