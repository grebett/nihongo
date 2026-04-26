// Pilot — central learning path catalogue. Tracks what content has been
// generated from what source, when, where it landed (Nihongo lesson + Anki deck).

const KEY = 'nihon-pilot-topics';

export type PilotMode = 'from-source' | 'production-drill' | 'rescue-weak';

export interface PilotTopic {
  id: string;            // generated
  name: string;          // user-given (e.g. "Assimil ch.5")
  mode: PilotMode;
  createdAt: number;
  lastUsedAt: number;
  sourcePreview: string; // first 200 chars of source material
  importedLessonId?: string;
  ankiDeckName?: string;
  ankiNotesAdded: number;
}

function read(): PilotTopic[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function write(topics: PilotTopic[]): void {
  localStorage.setItem(KEY, JSON.stringify(topics));
}

export function listTopics(): PilotTopic[] {
  return read().sort((a, b) => b.lastUsedAt - a.lastUsedAt);
}

export function recordTopic(t: Omit<PilotTopic, 'id' | 'createdAt' | 'lastUsedAt'> & { id?: string }): PilotTopic {
  const topics = read();
  const now = Date.now();
  const id = t.id ?? `topic-${now}`;
  const existing = topics.findIndex((x) => x.id === id);
  const merged: PilotTopic = {
    id,
    name: t.name,
    mode: t.mode,
    createdAt: existing >= 0 ? topics[existing].createdAt : now,
    lastUsedAt: now,
    sourcePreview: t.sourcePreview,
    importedLessonId: t.importedLessonId,
    ankiDeckName: t.ankiDeckName,
    ankiNotesAdded: t.ankiNotesAdded,
  };
  if (existing >= 0) topics[existing] = merged;
  else topics.unshift(merged);
  write(topics);
  return merged;
}

export function deleteTopic(id: string): void {
  write(read().filter((t) => t.id !== id));
}
