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

export interface Question {
  type: 'multiple-choice' | 'free-input';
  question: string;
  options?: string[];
  answer?: number;
  answers?: string[];
  hint: string;
}

export interface Lesson {
  id: string;
  title: string;
  description: string;
  source: string;
  videoId: string;
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
