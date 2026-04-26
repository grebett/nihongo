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
    return { ok: false, error: `YAML invalide : ${e?.message ?? e}` };
  }

  if (!parsed || typeof parsed !== 'object') {
    return { ok: false, error: 'Le fichier doit contenir un objet YAML.' };
  }

  const lesson = parsed.lesson;
  const questions = parsed.questions;

  if (!lesson || typeof lesson !== 'object') return { ok: false, error: 'Champ "lesson" manquant ou invalide.' };
  if (!questions || typeof questions !== 'object') return { ok: false, error: 'Champ "questions" manquant ou invalide.' };

  if (typeof lesson.id !== 'string' || !lesson.id.trim()) return { ok: false, error: 'lesson.id manquant.' };
  if (typeof lesson.title !== 'string' || !lesson.title.trim()) return { ok: false, error: 'lesson.title manquant.' };
  if (!Array.isArray(lesson.sections) || lesson.sections.length === 0) {
    return { ok: false, error: 'lesson.sections doit être un tableau non vide.' };
  }

  const knownPartIds = new Set<string>();
  for (let si = 0; si < lesson.sections.length; si++) {
    const sec = lesson.sections[si];
    if (typeof sec !== 'object') return { ok: false, error: `lesson.sections[${si}] doit être un objet.` };
    if (typeof sec.id !== 'string' || !sec.id.trim()) return { ok: false, error: `lesson.sections[${si}].id manquant.` };
    if (typeof sec.title !== 'string') return { ok: false, error: `lesson.sections[${si}].title manquant.` };
    if (!Array.isArray(sec.parts) || sec.parts.length === 0) {
      return { ok: false, error: `lesson.sections[${si}].parts doit être un tableau non vide.` };
    }
    for (let pi = 0; pi < sec.parts.length; pi++) {
      const p = sec.parts[pi];
      if (typeof p !== 'object') return { ok: false, error: `lesson.sections[${si}].parts[${pi}] doit être un objet.` };
      if (typeof p.id !== 'string' || !p.id.trim()) return { ok: false, error: `lesson.sections[${si}].parts[${pi}].id manquant.` };
      if (typeof p.title !== 'string') return { ok: false, error: `lesson.sections[${si}].parts[${pi}].title manquant.` };
      knownPartIds.add(p.id);
    }
  }

  for (const [partId, qList] of Object.entries(questions)) {
    if (!Array.isArray(qList)) return { ok: false, error: `questions["${partId}"] doit être un tableau.` };
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
