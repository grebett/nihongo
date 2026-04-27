// Shadow library: persists two FileSystemDirectoryHandles in IndexedDB
// for the Shadow pronunciation page.
//
//   xml-dir       Pickable in /settings, ONCE — the Assimil "lessons/" folder
//                 containing L001.xml, L002.xml, …. Used to look up the XML for
//                 whichever audio lesson the user picks on /shadow.
//
//   last-lesson   The most recently picked audio lesson folder on /shadow.
//                 Auto-restored on next visit (with a permission re-grant prompt).
//
// Default Assimil layout on Mac (kept here as reference for the settings UI):
//   audio: ~/Library/.../assimil_resources/<isbn>/resources/ja-jp/sans_peine/audio/prod/<ver>/L001
//   xml:   ~/Library/.../assimil_resources/<isbn>/xml/ja-jp/sans_peine/3095/prod/<ver>/method/lessons/L001.xml

const DB_NAME = 'nihongo-fs';
const STORE = 'handles';
const KEY_XML_DIR = 'shadow-xml-dir';
const KEY_LAST_LESSON = 'shadow-last-lesson';
const LS_KEY_CONFIG = 'shadow-library-config';

export type ShadowConfig = {
  xmlFilenameTemplate: string; // {lesson} placeholder
};

export const DEFAULT_CONFIG: ShadowConfig = {
  xmlFilenameTemplate: '{lesson}.xml',
};

// Reference paths shown in /settings UI (informational only — not used by any lookup).
export const REFERENCE_PATHS = {
  audioLesson:
    '~/Library/Containers/com.mantano.assimil/Data/Library/Application Support/com.mantano.assimil/assimil_resources/<isbn>/resources/ja-jp/sans_peine/audio/prod/<version>/L<NNN>',
  xmlLessons:
    '~/Library/Containers/com.mantano.assimil/Data/Library/Application Support/com.mantano.assimil/assimil_resources/<isbn>/xml/ja-jp/sans_peine/3095/prod/<version>/method/lessons',
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function dbPut(key: string, value: unknown): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function dbGet<T>(key: string): Promise<T | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => resolve((req.result as T) ?? null);
    req.onerror = () => reject(req.error);
  });
}

async function dbDelete(key: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export function isFsApiSupported(): boolean {
  return typeof (window as any).showDirectoryPicker === 'function';
}

// ─── Config (localStorage) ───
export function getConfig(): ShadowConfig {
  try {
    const raw = localStorage.getItem(LS_KEY_CONFIG);
    if (!raw) return { ...DEFAULT_CONFIG };
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function setConfig(cfg: Partial<ShadowConfig>): void {
  const merged = { ...getConfig(), ...cfg };
  localStorage.setItem(LS_KEY_CONFIG, JSON.stringify(merged));
}

export function resetConfig(): void {
  localStorage.removeItem(LS_KEY_CONFIG);
}

// ─── XML lessons dir handle (settings, persistent) ───
export async function loadXmlDirHandle(): Promise<FileSystemDirectoryHandle | null> {
  return dbGet<FileSystemDirectoryHandle>(KEY_XML_DIR);
}

export async function clearXmlDirHandle(): Promise<void> {
  return dbDelete(KEY_XML_DIR);
}

export async function pickXmlDirHandle(): Promise<FileSystemDirectoryHandle> {
  const handle: FileSystemDirectoryHandle = await (window as any).showDirectoryPicker({
    id: 'shadow-xml-dir',
    mode: 'read',
    startIn: 'documents',
  });
  await dbPut(KEY_XML_DIR, handle);
  return handle;
}

// ─── Last picked lesson handle (auto-restore on /shadow) ───
export async function loadLastLessonHandle(): Promise<FileSystemDirectoryHandle | null> {
  return dbGet<FileSystemDirectoryHandle>(KEY_LAST_LESSON);
}

export async function saveLastLessonHandle(h: FileSystemDirectoryHandle): Promise<void> {
  return dbPut(KEY_LAST_LESSON, h);
}

export async function clearLastLessonHandle(): Promise<void> {
  return dbDelete(KEY_LAST_LESSON);
}

export async function pickLessonHandle(): Promise<FileSystemDirectoryHandle> {
  const handle: FileSystemDirectoryHandle = await (window as any).showDirectoryPicker({
    id: 'shadow-lesson',
    mode: 'read',
  });
  await dbPut(KEY_LAST_LESSON, handle);
  return handle;
}

// ─── Permission + walking ───
export async function ensurePermission(
  handle: FileSystemDirectoryHandle,
  mode: 'read' | 'readwrite' = 'read',
): Promise<boolean> {
  if ((await (handle as any).queryPermission({ mode })) === 'granted') return true;
  return (await (handle as any).requestPermission({ mode })) === 'granted';
}

/**
 * Recursively collect File objects under a directory handle whose name matches `extRe`.
 * Each File gets `webkitRelativePath` set to the path relative to (and including)
 * the directory's name, so downstream code can be path-shape-agnostic.
 */
export async function walkFiles(
  dir: FileSystemDirectoryHandle,
  extRe: RegExp,
): Promise<File[]> {
  const out: File[] = [];
  async function walk(d: FileSystemDirectoryHandle, prefix: string) {
    for await (const entry of (d as any).values()) {
      const name = (entry as any).name as string;
      if (entry.kind === 'file') {
        if (!extRe.test(name)) continue;
        const file: File = await (entry as any).getFile();
        Object.defineProperty(file, 'webkitRelativePath', {
          value: prefix + name,
          writable: false,
          configurable: true,
          enumerable: true,
        });
        out.push(file);
      } else if (entry.kind === 'directory') {
        await walk(entry as FileSystemDirectoryHandle, prefix + name + '/');
      }
    }
  }
  await walk(dir, dir.name + '/');
  return out;
}

/** Read a single XML file by lesson ID (using the configured filename template). */
export async function readXmlByLessonId(
  xmlDir: FileSystemDirectoryHandle,
  lessonId: string,
  filenameTemplate: string,
): Promise<string | null> {
  const filename = filenameTemplate.replace('{lesson}', lessonId);
  try {
    const fh = await xmlDir.getFileHandle(filename, { create: false });
    const file = await fh.getFile();
    return await file.text();
  } catch {
    return null;
  }
}
