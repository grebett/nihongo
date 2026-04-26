// Persists a FileSystemDirectoryHandle to IndexedDB so the user can pick
// their Nihongo project folder once and the app re-uses it for subsequent
// writes (e.g. promoting imported lessons to the repo).

const DB_NAME = 'nihongo-fs';
const STORE = 'handles';
const KEY_PROJECT_ROOT = 'project-root';

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

async function dbPut(key: string, value: any): Promise<void> {
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
    req.onsuccess = () => resolve(req.result ?? null);
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

export async function loadProjectRoot(): Promise<FileSystemDirectoryHandle | null> {
  return dbGet<FileSystemDirectoryHandle>(KEY_PROJECT_ROOT);
}

export async function clearProjectRoot(): Promise<void> {
  return dbDelete(KEY_PROJECT_ROOT);
}

export async function pickProjectRoot(): Promise<FileSystemDirectoryHandle> {
  const handle = await (window as any).showDirectoryPicker({
    id: 'nihongo-project',
    mode: 'readwrite',
    startIn: 'documents',
  });
  // Validate the picked folder looks like a Nihongo project
  try {
    const src = await handle.getDirectoryHandle('src', { create: false });
    const data = await src.getDirectoryHandle('data', { create: false });
    await data.getDirectoryHandle('lessons', { create: false });
  } catch {
    throw new Error("That folder doesn't look like a Nihongo project (no src/data/lessons/). Pick the project root (the folder that contains src/, public/, package.json, etc.).");
  }
  await dbPut(KEY_PROJECT_ROOT, handle);
  return handle;
}

export async function ensurePermission(
  handle: FileSystemDirectoryHandle,
  mode: 'read' | 'readwrite' = 'readwrite',
): Promise<boolean> {
  if ((await (handle as any).queryPermission({ mode })) === 'granted') return true;
  return (await (handle as any).requestPermission({ mode })) === 'granted';
}

/**
 * Convenience: get a usable, permission-granted project root handle, OR null
 * if not configured / permission denied.
 */
export async function getProjectRootReady(): Promise<FileSystemDirectoryHandle | null> {
  const handle = await loadProjectRoot();
  if (!handle) return null;
  const ok = await ensurePermission(handle);
  return ok ? handle : null;
}

/** Walk into src/data/lessons/<lessonId>/ — creating the leaf if needed. */
export async function getLessonDir(
  root: FileSystemDirectoryHandle,
  lessonId: string,
): Promise<FileSystemDirectoryHandle> {
  const src = await root.getDirectoryHandle('src');
  const data = await src.getDirectoryHandle('data');
  const lessons = await data.getDirectoryHandle('lessons');
  return lessons.getDirectoryHandle(lessonId, { create: true });
}

/** Write a flat map of {relativePath: content} into a directory handle. */
export async function writeFiles(
  dirHandle: FileSystemDirectoryHandle,
  files: Record<string, string>,
): Promise<number> {
  let written = 0;
  for (const [path, content] of Object.entries(files)) {
    const segments = path.split('/');
    const filename = segments.pop()!;
    let cursor = dirHandle;
    for (const seg of segments) {
      cursor = await cursor.getDirectoryHandle(seg, { create: true });
    }
    const fileHandle = await cursor.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(content);
    await writable.close();
    written++;
  }
  return written;
}
