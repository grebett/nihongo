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
  const qPath = path.join(LESSONS_DIR, lessonId, 'questions.yaml');
  return yaml.load(fs.readFileSync(qPath, 'utf8')) as Record<string, Question[]>;
}
