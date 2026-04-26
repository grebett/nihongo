import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';

const LESSONS_DIR = path.resolve('src/data/lessons');

export interface Part {
  id: string;
  title: string;
  startTime: number;
  endTime: number;
}

export interface Section {
  id: string;
  title: string;
  description: string;
  parts: Part[];
}

export interface Block {
  text: string;
  reading?: string;
}

export interface Pair {
  jp: string;
  meaning: string;
  reading?: string;
}

export interface Question {
  type: 'multiple-choice' | 'free-input' | 'sentence-blocks' | 'matching';
  question: string;
  options?: string[];
  answer?: number;
  answers?: string[];
  display?: string;
  blocks?: Block[];
  distractors?: Block[];
  pairs?: Pair[];
  hint: string;
}

export interface Lesson {
  id: string;
  title: string;
  description: string;
  source: string;
  videoId: string;
  coverImage?: string;
  /** Single Japanese character (kanji preferred) — auto-rendered as a styled cover SVG. */
  coverEmoji?: string;
  number?: string | number;
  sections: Section[];
}

export function getAllLessons(): Lesson[] {
  const dirs = fs.readdirSync(LESSONS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  return dirs.map((dir) => {
    const lessonPath = path.join(LESSONS_DIR, dir, 'lesson.yaml');
    return yaml.load(fs.readFileSync(lessonPath, 'utf8')) as Lesson;
  });
}

export function getLesson(id: string): Lesson {
  const lessonPath = path.join(LESSONS_DIR, id, 'lesson.yaml');
  return yaml.load(fs.readFileSync(lessonPath, 'utf8')) as Lesson;
}

/**
 * Resolve the thumbnail source URL for a lesson, applying the same priority
 * everywhere (built-in template + dynamic imported render):
 *   1. coverImage if it's an HTTPS URL or data URI → as-is
 *   2. coverImage if plain filename → prepend baseUrl (lives in /public/)
 *   3. coverEmoji → inline data-URI SVG with auto-styled background
 *   4. videoId → YouTube thumbnail
 *   5. null → caller should render placeholder
 */
export function lessonThumbnailSrc(
  lesson: Pick<Lesson, 'coverImage' | 'coverEmoji' | 'videoId'>,
  baseUrl: string,
): string | null {
  const cover = lesson.coverImage?.trim();
  if (cover) {
    if (/^(https?:|data:)/i.test(cover)) return cover;
    return `${baseUrl.replace(/\/$/, '')}/${cover}`;
  }
  const emoji = lesson.coverEmoji?.trim();
  if (emoji) return emojiCoverSvg(emoji.charAt(0));
  if (lesson.videoId) return `https://i.ytimg.com/vi/${lesson.videoId}/mqdefault.jpg`;
  return null;
}

/**
 * Auto-styled cover SVG for a single character. 4 palettes picked by the
 * char's codepoint so different lessons feel visually distinct.
 */
export function emojiCoverSvg(char: string): string {
  const palettes = [
    ['%232e211a', '%2315100c', '%23a8201a', '%23d94a3f'], // warm dusk
    ['%23241e2a', '%23120e16', '%236c71c4', '%237983d4'], // night indigo
    ['%231f2820', '%230f140f', '%231f7a6a', '%234ab39e'], // matcha forest
    ['%23291a1a', '%23120909', '%23c89a3e', '%23e8b85a'], // ember tea
  ];
  const i = (char.codePointAt(0) ?? 0) % palettes.length;
  const [c1, c2, glow, textCol] = palettes[i];
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 112'>` +
    `<defs>` +
    `<linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>` +
    `<stop offset='0' stop-color='${c1}'/>` +
    `<stop offset='1' stop-color='${c2}'/>` +
    `</linearGradient>` +
    `<radialGradient id='glow' cx='0.18' cy='0.22' r='0.7'>` +
    `<stop offset='0' stop-color='${glow}' stop-opacity='0.32'/>` +
    `<stop offset='0.7' stop-color='${glow}' stop-opacity='0'/>` +
    `</radialGradient>` +
    `</defs>` +
    `<rect width='200' height='112' fill='url(%23g)'/>` +
    `<rect width='200' height='112' fill='url(%23glow)'/>` +
    `<text x='100' y='82' text-anchor='middle' font-size='68' fill='${textCol}' font-family='Noto Serif JP, Hiragino Mincho Pro, serif' font-weight='700' opacity='0.95'>${encodeURIComponent(char)}</text>` +
    `</svg>`;
  return `data:image/svg+xml;utf8,${svg}`;
}

export function getQuestions(lessonId: string): Record<string, Question[]> {
  const questionsDir = path.join(LESSONS_DIR, lessonId, 'questions');
  const result: Record<string, Question[]> = {};

  // Load from questions/ directory (one file per section)
  if (fs.existsSync(questionsDir)) {
    const files = fs.readdirSync(questionsDir).filter((f) => f.endsWith('.yaml'));
    for (const file of files) {
      const data = yaml.load(fs.readFileSync(path.join(questionsDir, file), 'utf8')) as Record<string, Question[]>;
      if (data) Object.assign(result, data);
    }
  }

  // Fallback: single questions.yaml
  const singlePath = path.join(LESSONS_DIR, lessonId, 'questions.yaml');
  if (fs.existsSync(singlePath)) {
    const data = yaml.load(fs.readFileSync(singlePath, 'utf8')) as Record<string, Question[]>;
    if (data) Object.assign(result, data);
  }

  return result;
}
