import type {
  AnkiCache,
  AnkiCacheDeck,
  AnkiCard,
  AnkiConfig,
  AnkiDeckSummary,
  AnkiEase,
  AnkiStatus,
  QueuedReview,
} from './anki-types';

// ─── Storage namespaces ──────────────────────────────────────────────────

const KEY_CONFIG = 'nihon-anki-config';
const KEY_CACHE = 'nihon-anki-cache';
const KEY_QUEUE = 'nihon-anki-queue';

const DEFAULT_ENDPOINT = 'http://localhost:8765';

const DEFAULT_CONFIG: AnkiConfig = {
  endpoint: DEFAULT_ENDPOINT,
  enabled: false,
  deckFilter: [],
  lastSyncAt: null,
};

// ─── Config ──────────────────────────────────────────────────────────────

export function getConfig(): AnkiConfig {
  try {
    const raw = localStorage.getItem(KEY_CONFIG);
    if (!raw) return { ...DEFAULT_CONFIG };
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function saveConfig(patch: Partial<AnkiConfig>): AnkiConfig {
  const next = { ...getConfig(), ...patch };
  localStorage.setItem(KEY_CONFIG, JSON.stringify(next));
  return next;
}

// ─── Cache ───────────────────────────────────────────────────────────────

export function getCache(): AnkiCache {
  try {
    const raw = localStorage.getItem(KEY_CACHE);
    if (!raw) return { decks: {} };
    return JSON.parse(raw);
  } catch {
    return { decks: {} };
  }
}

function saveCache(cache: AnkiCache): void {
  localStorage.setItem(KEY_CACHE, JSON.stringify(cache));
}

export function getCachedDecks(): AnkiCacheDeck[] {
  return Object.values(getCache().decks).sort((a, b) => a.summary.name.localeCompare(b.summary.name));
}

export function getCachedDeck(deckName: string): AnkiCacheDeck | null {
  return getCache().decks[deckName] ?? null;
}

// ─── Queue ───────────────────────────────────────────────────────────────

export function getQueue(): QueuedReview[] {
  try {
    const raw = localStorage.getItem(KEY_QUEUE);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function saveQueue(q: QueuedReview[]): void {
  localStorage.setItem(KEY_QUEUE, JSON.stringify(q));
}

export function enqueueReview(cardId: number, ease: AnkiEase): void {
  const q = getQueue();
  q.push({ cardId, ease, queuedAt: Date.now() });
  saveQueue(q);
}

export function clearQueue(): void {
  saveQueue([]);
}

// ─── AnkiConnect HTTP client ─────────────────────────────────────────────

interface AnkiInvokeResponse<T> {
  result: T | null;
  error: string | null;
}

export async function invoke<T>(
  action: string,
  params: Record<string, unknown> = {},
  endpoint?: string,
  signal?: AbortSignal,
): Promise<T> {
  const url = endpoint || getConfig().endpoint || DEFAULT_ENDPOINT;
  const res = await fetch(url, {
    method: 'POST',
    body: JSON.stringify({ action, version: 6, params }),
    signal,
  });
  const data: AnkiInvokeResponse<T> = await res.json();
  if (data.error) throw new Error(data.error);
  if (data.result === null) throw new Error('AnkiConnect returned null result');
  return data.result;
}

export async function pingAnki(endpoint?: string): Promise<boolean> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 2000);
  try {
    await invoke<number>('version', {}, endpoint, ctrl.signal);
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

// ─── High-level API ──────────────────────────────────────────────────────

export async function loadDeckList(): Promise<string[]> {
  const cfg = getConfig();
  const all = await invoke<string[]>('deckNames');
  if (cfg.deckFilter.length === 0) return all;
  const allow = new Set(cfg.deckFilter);
  return all.filter((d) => allow.has(d));
}

export async function loadDeckStats(deckNames: string[]): Promise<Record<string, AnkiDeckSummary>> {
  // getDeckStats returns: { [deckId]: { name, total_in_deck, new_count, learn_count, review_count } }
  // We need to query by deck names → use findCards + areDue / etc. Simpler: use getDeckStats by id.
  // For now, use findCards with `deck:"X" is:due` to count due items.
  const out: Record<string, AnkiDeckSummary> = {};
  for (const name of deckNames) {
    const totalIds = await invoke<number[]>('findCards', { query: `deck:"${name}"` });
    const dueIds = await invoke<number[]>('findCards', { query: `deck:"${name}" (is:due OR is:new)` });
    out[name] = { name, totalCards: totalIds.length, dueCount: dueIds.length };
  }
  return out;
}

async function fetchCards(cardIds: number[]): Promise<AnkiCard[]> {
  if (cardIds.length === 0) return [];
  const info = await invoke<Array<{
    cardId: number;
    note: number;
    deckName: string;
    due: number;
    fields: Record<string, { value: string; order: number }>;
  }>>('cardsInfo', { cards: cardIds });
  return info.map((c) => ({
    cardId: c.cardId,
    noteId: c.note,
    deckName: c.deckName,
    due: c.due,
    fields: Object.fromEntries(
      Object.entries(c.fields).map(([k, v]) => [k, stripHtml(v.value)]),
    ),
    tags: [],
  }));
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
}

export async function loadDueCards(deckName: string, limit = 50): Promise<AnkiCard[]> {
  const ids = await invoke<number[]>('findCards', {
    query: `deck:"${deckName}" (is:due OR is:new)`,
  });
  return fetchCards(ids.slice(0, limit));
}

/**
 * Submit one review to Anki. Uses the `guiAnswerCard` action — requires the
 * card to be the currently shown one in Anki, so we use `answerCards` instead
 * which works on arbitrary cardIds without UI focus.
 */
export async function submitReview(cardId: number, ease: AnkiEase): Promise<void> {
  await invoke<boolean[]>('answerCards', {
    answers: [{ cardId, ease }],
  });
}

// ─── Sync ────────────────────────────────────────────────────────────────

export async function syncNow(): Promise<{ ok: boolean; reason?: string; flushed: number }> {
  const cfg = getConfig();
  if (!cfg.enabled) return { ok: false, reason: 'disabled', flushed: 0 };

  const reachable = await pingAnki(cfg.endpoint);
  if (!reachable) return { ok: false, reason: 'unreachable', flushed: 0 };

  // 1. Refresh deck list + due cards
  let deckNames: string[] = [];
  try {
    deckNames = await loadDeckList();
  } catch (e: any) {
    return { ok: false, reason: `deckNames: ${e?.message ?? e}`, flushed: 0 };
  }
  const stats = await loadDeckStats(deckNames);
  const cache: AnkiCache = { decks: {} };
  for (const name of deckNames) {
    const dueCards = await loadDueCards(name);
    cache.decks[name] = {
      summary: stats[name] ?? { name, totalCards: dueCards.length, dueCount: dueCards.length },
      dueCards,
      fetchedAt: Date.now(),
    };
  }
  saveCache(cache);

  // 2. Flush queue
  const queue = getQueue();
  let flushed = 0;
  if (queue.length > 0) {
    try {
      await invoke<boolean[]>('answerCards', {
        answers: queue.map((q) => ({ cardId: q.cardId, ease: q.ease })),
      });
      flushed = queue.length;
      clearQueue();
    } catch {
      // Keep queue, will retry next sync
    }
  }

  saveConfig({ lastSyncAt: Date.now() });
  return { ok: true, flushed };
}

// ─── Status helper ───────────────────────────────────────────────────────

let lastReachable: { ok: boolean; checkedAt: number } | null = null;
const REACHABLE_TTL = 30_000;

export async function getStatus(): Promise<AnkiStatus> {
  const cfg = getConfig();
  if (!cfg.enabled) return 'unconfigured';
  const now = Date.now();
  if (!lastReachable || now - lastReachable.checkedAt > REACHABLE_TTL) {
    const ok = await pingAnki(cfg.endpoint);
    lastReachable = { ok, checkedAt: now };
  }
  if (lastReachable.ok) return 'live';
  return Object.keys(getCache().decks).length > 0 ? 'cached' : 'offline';
}
